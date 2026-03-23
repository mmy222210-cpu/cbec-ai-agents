const { chromium } = require('playwright');
const fs = require('fs');

const DIR = '/Users/mamengyang/.gemini/antigravity/my project';

(async () => {
  console.log('连接 Chrome...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();

  try {
    // 1. 进入喜欢页
    console.log('进入个人主页...');
    await page.goto('https://www.douyin.com/user/self', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log('点击"喜欢"标签...');
    await page.locator('span:text-is("喜欢")').first().click({ timeout: 5000 });
    await page.waitForTimeout(3000);

    // 2. 滚动加载所有视频
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(800);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // 收集视频链接 (只收集抖音自有视频，排除外部爬虫链接)
    const videoLinks = await page.evaluate(() => {
      const links = new Set();
      document.querySelectorAll('a').forEach(a => {
        if (a.href && (a.href.includes('/video/') || a.href.includes('/note/')) && !a.href.includes('source=Baidu')) {
          // 提取干净URL
          const url = a.href.split('?')[0];
          links.add(url);
        }
      });
      return Array.from(links);
    });
    console.log(`找到 ${videoLinks.length} 个喜欢的视频\n`);

    // 3. 创建截图目录
    const ssDir = `${DIR}/video_screenshots`;
    if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

    // 4. 逐个打开视频，截图 + 提取详细信息
    const allVideos = [];

    for (let i = 0; i < videoLinks.length; i++) {
      const url = videoLinks[i];
      const videoId = url.substring(url.lastIndexOf('/') + 1);
      console.log(`\n[${i + 1}/${videoLinks.length}] 视频: ${videoId}`);

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(3500);

        // 截图
        const ssPath = `${ssDir}/video_${i + 1}_${videoId}.png`;
        await page.screenshot({ path: ssPath });

        // 提取详细信息
        const info = await page.evaluate(() => {
          // 作者信息
          let authorName = '';
          let authorUrl = '';
          const userLinks = document.querySelectorAll('a[href*="/user/"]');
          for (const link of userLinks) {
            if (link.href.includes('/user/self')) continue;
            const text = link.textContent.trim();
            if (!text || text.length > 30 || text.length < 1) continue;
            if (text.includes('搜索') || text.includes('我的') || text.includes('登录') || text.includes('喜欢') || text.includes('收藏') || text.includes('历史') || text.includes('作品') || text.includes('预约')) continue;
            if (text.includes('\n') && text.split('\n').filter(s => s.trim()).length > 2) continue;
            const rect = link.getBoundingClientRect();
            if (rect.top < 50) continue;
            if (rect.left < 60 && rect.top < 400) continue;
            authorName = text.split('\n')[0].trim();
            authorUrl = link.href.split('?')[0];
            break;
          }

          // 视频描述 (完整)
          let desc = '';
          const descSelectors = ['[data-e2e="video-desc"]', 'h1', '[class*="desc"]'];
          for (const sel of descSelectors) {
            const el = document.querySelector(sel);
            if (el) {
              const t = el.textContent.trim();
              if (t.length > 2 && t.length < 500 && !t.includes('精选推荐搜索')) {
                desc = t;
                break;
              }
            }
          }

          // 互动数据
          let likes = '', comments = '', shares = '', collects = '';
          const statItems = document.querySelectorAll('[class*="action-item"], [data-e2e*="like"], [data-e2e*="comment"], [data-e2e*="share"]');
          const allNums = [];
          document.querySelectorAll('span').forEach(span => {
            const t = span.textContent.trim();
            if (/^\d+(\.\d+)?[wW万]?$/.test(t) || /^\d+$/.test(t)) {
              const rect = span.getBoundingClientRect();
              if (rect.left > 0) allNums.push({ text: t, x: rect.left, y: rect.top });
            }
          });

          // 视频时长
          let duration = '';
          const timeEl = document.querySelector('[class*="time"], [class*="duration"], [class*="progress"]');
          if (timeEl) {
            const t = timeEl.textContent.trim();
            if (t.match(/\d+:\d+/)) duration = t;
          }

          // 标签提取
          const tags = [];
          const tagEls = document.querySelectorAll('a[href*="hashtag"], [class*="tag"], [class*="hashtag"]');
          tagEls.forEach(el => {
            const t = el.textContent.trim();
            if (t.startsWith('#') && t.length < 30) tags.push(t);
          });

          // 也从描述中提取 #标签
          if (desc) {
            const hashMatches = desc.match(/#[^\s#]+/g);
            if (hashMatches) {
              hashMatches.forEach(tag => {
                if (!tags.includes(tag)) tags.push(tag);
              });
            }
          }

          // 评论区前几条评论
          const commentTexts = [];
          document.querySelectorAll('[data-e2e="comment-list"] [data-e2e="comment-content"], [class*="comment-content"], [class*="CommentContent"]').forEach(el => {
            const t = el.textContent.trim();
            if (t && t.length > 0 && t.length < 200 && commentTexts.length < 5) {
              commentTexts.push(t);
            }
          });

          return {
            authorName,
            authorUrl,
            desc,
            tags,
            likes,
            comments,
            shares,
            collects,
            duration,
            topComments: commentTexts,
          };
        });

        // 额外获取互动数据 - 用更通用的方式
        const engagementData = await page.evaluate(() => {
          const body = document.body.innerText;
          const nums = [];
          // 在视频详情页左下方通常有点赞、评论、收藏、转发数
          const actionBtns = document.querySelectorAll('[class*="action"] span, [class*="like"] span, [class*="comment"] span');
          actionBtns.forEach(span => {
            const t = span.textContent.trim();
            if (t && /^[\d.]+[wW万kK]?$/.test(t)) {
              nums.push(t);
            }
          });
          return nums;
        });

        const videoData = {
          序号: i + 1,
          视频ID: videoId,
          视频链接: url,
          博主: info.authorName,
          博主主页: info.authorUrl,
          视频描述: info.desc,
          标签: info.tags,
          互动数据: engagementData,
          热门评论: info.topComments,
          截图: ssPath,
        };

        allVideos.push(videoData);
        console.log(`  博主: ${info.authorName}`);
        console.log(`  描述: ${info.desc.substring(0, 80)}`);
        console.log(`  标签: ${info.tags.slice(0, 5).join(' ')}`);
        console.log(`  截图: video_${i + 1}_${videoId}.png`);

      } catch (e) {
        console.log(`  加载失败: ${e.message.substring(0, 60)}`);
      }
    }

    // 5. 保存结果
    fs.writeFileSync(`${DIR}/douyin_videos_detail.json`, JSON.stringify(allVideos, null, 2), 'utf-8');
    console.log(`\n============================`);
    console.log(`共采集 ${allVideos.length} 个视频的详细信息`);
    console.log(`截图保存在: video_screenshots/`);
    console.log(`数据保存在: douyin_videos_detail.json`);
    console.log(`============================`);

  } catch (error) {
    console.error('出错:', error.message);
    await page.screenshot({ path: `${DIR}/error.png` }).catch(() => {});
  } finally {
    browser.close();
  }
})();
