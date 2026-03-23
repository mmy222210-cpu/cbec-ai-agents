const { chromium } = require('playwright');
const fs = require('fs');

const DIR = '/Users/mamengyang/.gemini/antigravity/my project';

// 从搜索结果中筛选的高潜力账号
const ACCOUNTS = [
  'mymaijia',          // 出现在全部8个搜索中
  'giant_poodle',      // 贵宾+fashion
  'brodiethatdood',    // dog photoshoot
  'filoupoodle',       // poodle fashion
  'poodleoftok',       // poodle社群
  'beagleskiko',       // dog outfit
  'spongecake_cats',   // pet aesthetic
  'dogior.de',         // 高端宠物时尚
  'small_fashion_dogs',// small dog fashion
  'dogmomjvd',         // dog mom
  'iamcalledlucas',    // dog ootd
  'jorgebulldog',      // bulldog outfit
  'bellas.buttons5',   // dog clothes haul
  'tikanni.kita.n.tehya', // dog outfit
  'katai0303',         // pet fashion aesthetic
  'toraniwa',          // asian dog fashion
  'natzrule',          // zen dog aesthetic
  'lvvlek',            // dog clothes
  'poodie_minnie',     // poodle
  'aa950831',          // asian dog fashion
];

(async () => {
  console.log('连接 Chrome...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();

  const profiles = [];

  for (let i = 0; i < ACCOUNTS.length; i++) {
    const username = ACCOUNTS[i];
    console.log(`\n[${i + 1}/${ACCOUNTS.length}] 访问 @${username}`);

    try {
      await page.goto(`https://www.tiktok.com/@${username}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);

      const data = await page.evaluate(() => {
        const getText = (selectors) => {
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) return el.textContent.trim();
          }
          return '';
        };

        // 粉丝数、关注数、获赞数
        const statsEls = document.querySelectorAll('[data-e2e="followers-count"], [data-e2e="following-count"], [data-e2e="likes-count"]');
        const stats = {};
        statsEls.forEach(el => {
          const key = el.getAttribute('data-e2e');
          stats[key] = el.textContent.trim();
        });

        // 备用方法提取数据
        if (!stats['followers-count']) {
          const countEls = document.querySelectorAll('[class*="Count"], strong[data-e2e]');
          const counts = [];
          countEls.forEach(el => {
            const t = el.textContent.trim();
            if (t && /[\d.]+[KMB]?/.test(t)) counts.push(t);
          });
          if (counts.length >= 3) {
            stats['following-count'] = counts[0];
            stats['followers-count'] = counts[1];
            stats['likes-count'] = counts[2];
          }
        }

        // 用户名和描述
        const displayName = getText(['h1[data-e2e="user-subtitle"]', 'h2[data-e2e="user-title"]', 'h1', '[class*="ShareTitle"]']);
        const bio = getText(['h2[data-e2e="user-bio"]', '[data-e2e="user-bio"]', '[class*="ShareDesc"]']);
        const link = getText(['a[data-e2e="user-link"]', '[class*="Link"]']);

        // 页面文本摘要
        const pageText = document.body.innerText.substring(0, 1500);

        return {
          displayName,
          bio,
          link,
          following: stats['following-count'] || '',
          followers: stats['followers-count'] || '',
          likes: stats['likes-count'] || '',
          pageText,
        };
      });

      profiles.push({
        username: '@' + username,
        ...data,
      });

      console.log(`  粉丝: ${data.followers || '未获取'} | 获赞: ${data.likes || '未获取'}`);
      console.log(`  简介: ${data.bio?.substring(0, 60) || '无'}`);

    } catch (e) {
      console.log(`  ❌ 失败: ${e.message.substring(0, 60)}`);
      profiles.push({ username: '@' + username, error: e.message.substring(0, 100) });
    }

    if (i < ACCOUNTS.length - 1) await page.waitForTimeout(1500);
  }

  fs.writeFileSync(`${DIR}/tiktok_profiles.json`, JSON.stringify(profiles, null, 2), 'utf-8');
  console.log(`\n========== 完成，共 ${profiles.length} 个账号 ==========`);

  browser.close();
})();
