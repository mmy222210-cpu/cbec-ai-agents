const { chromium } = require('playwright');
const fs = require('fs');

const DIR = '/Users/mamengyang/.gemini/antigravity/my project';

// 搜索关键词 — 针对 Aesthetic Line 宠物服装的目标KOL
const SEARCHES = [
  'dog outfit OOTD',
  'pet fashion aesthetic',
  'dog clothes haul',
  'poodle outfit',
  'asian dog fashion',
  'zen dog aesthetic',
  'dog photoshoot outfit',
  'small dog fashion',
];

(async () => {
  console.log('连接 Chrome...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();

  const allResults = [];

  for (let i = 0; i < SEARCHES.length; i++) {
    const keyword = SEARCHES[i];
    console.log(`\n======== [${i + 1}/${SEARCHES.length}] 搜索: "${keyword}" ========`);

    try {
      const url = `https://www.tiktok.com/search?q=${encodeURIComponent(keyword)}&t=1`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);

      // 切换到"用户"标签页（如果有的话）
      try {
        const userTab = await page.$('span:has-text("Users"), span:has-text("用户"), [data-e2e="search-user-tab"]');
        if (userTab) {
          await userTab.click();
          await page.waitForTimeout(3000);
        }
      } catch (e) {
        console.log('  未找到用户标签，使用默认结果');
      }

      // 截图
      const ssPath = `${DIR}/tiktok_screenshots/search_${i + 1}.png`;
      if (!fs.existsSync(`${DIR}/tiktok_screenshots`)) fs.mkdirSync(`${DIR}/tiktok_screenshots`, { recursive: true });
      await page.screenshot({ path: ssPath, fullPage: false });

      // 提取搜索结果中的用户信息
      const users = await page.evaluate(() => {
        const results = [];

        // 方法1: 从搜索结果中提取用户卡片
        const userCards = document.querySelectorAll('[data-e2e="search-user-card"], [class*="UserCard"], [class*="user-card"]');
        userCards.forEach(card => {
          const nameEl = card.querySelector('[class*="name"], [class*="Name"], h3, h2, a[href*="/@"]');
          const followerEl = card.querySelector('[class*="follower"], [class*="Follower"], [class*="count"]');
          const descEl = card.querySelector('[class*="desc"], [class*="Desc"], [class*="bio"]');

          if (nameEl) {
            results.push({
              name: nameEl.textContent.trim(),
              followers: followerEl ? followerEl.textContent.trim() : '',
              desc: descEl ? descEl.textContent.trim() : '',
              link: nameEl.href || '',
            });
          }
        });

        // 方法2: 从链接中提取 @用户名
        if (results.length === 0) {
          const links = document.querySelectorAll('a[href*="/@"]');
          const seen = new Set();
          links.forEach(link => {
            const href = link.href;
            const match = href.match(/@([\w.]+)/);
            if (match && !seen.has(match[1])) {
              seen.add(match[1]);
              const parentText = link.closest('[class*="Card"], [class*="card"], [class*="Item"], [class*="item"], div')?.textContent || '';
              results.push({
                name: '@' + match[1],
                followers: '',
                desc: parentText.substring(0, 200),
                link: href,
              });
            }
          });
        }

        // 方法3: 提取视频卡片中的创作者信息
        if (results.length === 0) {
          const videoCards = document.querySelectorAll('[class*="DivVideoCard"], [class*="video-card"], [data-e2e="search-card"]');
          videoCards.forEach(card => {
            const authorEl = card.querySelector('[class*="author"], [class*="Author"], a[href*="/@"]');
            const viewEl = card.querySelector('[class*="view"], [class*="View"], [class*="play"]');
            if (authorEl) {
              results.push({
                name: authorEl.textContent.trim(),
                followers: '',
                views: viewEl ? viewEl.textContent.trim() : '',
                desc: card.textContent.substring(0, 200).trim(),
                link: authorEl.href || '',
              });
            }
          });
        }

        return results.slice(0, 15);
      });

      console.log(`  找到 ${users.length} 个结果`);
      users.forEach((u, idx) => {
        console.log(`  ${idx + 1}. ${u.name} | ${u.followers || u.views || ''}`);
      });

      allResults.push({
        keyword,
        screenshot: `search_${i + 1}.png`,
        users,
        pageText: await page.evaluate(() => document.body.innerText.substring(0, 2000)),
      });

    } catch (e) {
      console.log(`  ❌ 搜索失败: ${e.message.substring(0, 80)}`);
      allResults.push({ keyword, error: e.message.substring(0, 200) });
    }

    if (i < SEARCHES.length - 1) {
      await page.waitForTimeout(2000);
    }
  }

  // 保存结果
  fs.writeFileSync(`${DIR}/tiktok_kol_search.json`, JSON.stringify(allResults, null, 2), 'utf-8');
  console.log(`\n========== 搜索完成 ==========`);
  console.log(`数据: tiktok_kol_search.json`);
  console.log(`截图: tiktok_screenshots/`);

  browser.close();
})();
