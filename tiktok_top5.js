const { chromium } = require('playwright');
const fs = require('fs');

const DIR = '/Users/mamengyang/.gemini/antigravity/my project';

// 精选5个最可能匹配 Aesthetic Line 的账号
const ACCOUNTS = [
  'brodiethatdood',    // 7.3M 大号，dog photoshoot内容
  'giant_poodle',      // 19.2K 贵宾犬日常
  'filoupoodle',       // poodle fashion
  'spongecake_cats',   // pet aesthetic
  'toraniwa',          // asian dog fashion
];

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();
  const profiles = [];

  for (let i = 0; i < ACCOUNTS.length; i++) {
    const username = ACCOUNTS[i];
    console.log(`[${i + 1}/5] @${username}`);
    try {
      await page.goto(`https://www.tiktok.com/@${username}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(4000);

      // 截图
      if (!fs.existsSync(`${DIR}/tiktok_profiles_ss`)) fs.mkdirSync(`${DIR}/tiktok_profiles_ss`, { recursive: true });
      await page.screenshot({ path: `${DIR}/tiktok_profiles_ss/${username}.png`, fullPage: false });

      const data = await page.evaluate(() => {
        // 提取关注/粉丝/获赞
        const countEls = document.querySelectorAll('strong[data-e2e]');
        const stats = {};
        countEls.forEach(el => {
          const key = el.getAttribute('data-e2e');
          stats[key] = el.textContent.trim();
        });

        const getText = (sel) => {
          const el = document.querySelector(sel);
          return el ? el.textContent.trim() : '';
        };

        return {
          followers: stats['followers-count'] || '',
          following: stats['following-count'] || '',
          likes: stats['likes-count'] || '',
          displayName: getText('h1[data-e2e="user-subtitle"]') || getText('h2[data-e2e="user-title"]'),
          bio: getText('h2[data-e2e="user-bio"]'),
          link: getText('a[data-e2e="user-link"]'),
        };
      });

      profiles.push({ username: '@' + username, ...data });
      console.log(`  ${data.followers} 粉丝 | ${data.likes} 赞 | ${data.bio?.substring(0, 50)}`);
    } catch (e) {
      console.log(`  ❌ ${e.message.substring(0, 50)}`);
      profiles.push({ username: '@' + username, error: e.message.substring(0, 100) });
    }
    if (i < ACCOUNTS.length - 1) await page.waitForTimeout(1500);
  }

  fs.writeFileSync(`${DIR}/tiktok_top5.json`, JSON.stringify(profiles, null, 2), 'utf-8');
  console.log('\n完成');
  browser.close();
})();
