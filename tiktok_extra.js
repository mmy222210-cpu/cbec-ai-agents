const { chromium } = require('playwright');
const fs = require('fs');
const DIR = '/Users/mamengyang/.gemini/antigravity/my project';

// 替补2个 + 补充3个备选
const ACCOUNTS = ['dogmomjvd', 'poodie_minnie', 'katai0303', 'iamcalledlucas', 'beagleskiko'];

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();
  const profiles = [];

  for (let i = 0; i < ACCOUNTS.length; i++) {
    const u = ACCOUNTS[i];
    console.log(`[${i+1}/5] @${u}`);
    try {
      await page.goto(`https://www.tiktok.com/@${u}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(4000);
      await page.screenshot({ path: `${DIR}/tiktok_profiles_ss/${u}.png`, fullPage: false });
      const data = await page.evaluate(() => {
        const countEls = document.querySelectorAll('strong[data-e2e]');
        const stats = {};
        countEls.forEach(el => { stats[el.getAttribute('data-e2e')] = el.textContent.trim(); });
        const getText = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : ''; };
        return {
          followers: stats['followers-count'] || '',
          likes: stats['likes-count'] || '',
          bio: getText('h2[data-e2e="user-bio"]'),
          link: getText('a[data-e2e="user-link"]'),
        };
      });
      profiles.push({ username: '@' + u, ...data });
      console.log(`  ${data.followers} 粉丝 | ${data.likes} 赞 | ${data.bio?.substring(0,50)}`);
    } catch (e) {
      console.log(`  ❌ ${e.message.substring(0,50)}`);
    }
    if (i < ACCOUNTS.length - 1) await page.waitForTimeout(1500);
  }
  fs.writeFileSync(`${DIR}/tiktok_extra.json`, JSON.stringify(profiles, null, 2), 'utf-8');
  console.log('\n完成');
  browser.close();
})();
