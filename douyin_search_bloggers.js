const { chromium } = require('playwright');
const fs = require('fs');

const DIR = '/Users/mamengyang/.gemini/antigravity/my project';

function parseNum(str) {
  if (!str) return 0;
  str = str.trim().replace(/,/g, '');
  if (str.includes('万') || str.includes('w') || str.includes('W')) return parseFloat(str) * 10000 || 0;
  if (str.includes('亿')) return parseFloat(str) * 100000000 || 0;
  return parseInt(str) || 0;
}

(async () => {
  console.log('连接 Chrome...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();

  const ssDir = `${DIR}/top_bloggers`;
  if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

  // 6个核心标签
  const tags = ['腹肌', '薄肌', '宽肩窄腰', '双开门身材', '禁欲系', '反差'];

  // 收集所有视频 { url, likes, comments, authorName, authorUrl, tag }
  const allVideos = [];
  const seenVideoUrls = new Set();

  try {
    // ===== 第一步：每个标签搜视频，按热度排序，收集高赞视频 =====
    for (const tag of tags) {
      console.log(`\n====== 搜索 #${tag} ======`);

      // 抖音搜索默认按综合排序（热度优先）
      await page.goto(
        `https://www.douyin.com/search/${encodeURIComponent(tag)}?type=video&sort_type=0`,
        { waitUntil: 'domcontentloaded', timeout: 20000 }
      );
      await page.waitForTimeout(4000);

      // 滚动加载更多
      for (let s = 0; s < 10; s++) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(800);
      }

      // 提取视频卡片信息（链接 + 点赞数）
      const videos = await page.evaluate(() => {
        const results = [];
        // 搜索结果的视频卡片
        const allLinks = document.querySelectorAll('a[href*="/video/"]');
        const seen = new Set();

        allLinks.forEach(a => {
          const href = a.href.split('?')[0];
          if (seen.has(href)) return;
          seen.add(href);

          // 尝试找到卡片容器中的点赞数
          const card = a.closest('li, [class*="card"], [class*="Card"], [class*="item"]') || a.parentElement;
          let likeText = '';
          if (card) {
            const spans = card.querySelectorAll('span');
            spans.forEach(span => {
              const t = span.textContent.trim();
              if (/^[\d.]+[万wW]?$/.test(t) && !likeText) {
                likeText = t;
              }
            });
          }

          results.push({ href, likeText });
        });

        return results;
      });

      console.log(`  找到 ${videos.length} 个视频`);

      for (const v of videos) {
        if (!seenVideoUrls.has(v.href)) {
          seenVideoUrls.add(v.href);
          allVideos.push({ url: v.href, likeText: v.likeText, likeNum: parseFloat(v.likeText) || 0, tag });
        }
      }
    }

    console.log(`\n总共收集 ${allVideos.length} 个不重复视频`);

    // ===== 第二步：打开每个视频获取精确的互动数据和博主信息 =====
    console.log('\n====== 逐个打开视频获取详细信息 ======\n');

    const videoDetails = [];

    for (let i = 0; i < Math.min(allVideos.length, 80); i++) {
      const v = allVideos[i];
      try {
        await page.goto(v.url, { waitUntil: 'domcontentloaded', timeout: 12000 });
        await page.waitForTimeout(2000);

        const detail = await page.evaluate(() => {
          // 互动数据 - 从视频左侧/底部按钮区域提取
          let likes = '', comments = '', shares = '', collects = '';

          // 抖音视频页互动数据通常在特定位置
          const allSpans = document.querySelectorAll('span, [class*="count"], [class*="num"]');
          const nums = [];
          allSpans.forEach(span => {
            const t = span.textContent.trim();
            if (/^[\d.]+[万wWkK亿]?$/.test(t)) {
              const rect = span.getBoundingClientRect();
              nums.push({ text: t, x: rect.left, y: rect.top, width: rect.width });
            }
          });

          // 找作者
          let authorName = '';
          let authorUrl = '';
          const userLinks = document.querySelectorAll('a[href*="/user/"]');
          for (const link of userLinks) {
            const href = link.href.split('?')[0];
            if (href.includes('/user/self')) continue;
            const text = link.textContent.trim();
            if (!text || text.length > 30 || text.length < 1) continue;
            if (['搜索','我的','登录','喜欢','收藏','历史','作品','预约','稍后','再看'].some(w => text.includes(w))) continue;
            const rect = link.getBoundingClientRect();
            if (rect.top < 50 || (rect.left < 60 && rect.top < 400)) continue;
            authorName = text.split('\n')[0].trim();
            authorUrl = href;
            break;
          }

          // 描述
          let desc = '';
          const descEl = document.querySelector('[data-e2e="video-desc"]');
          if (descEl) desc = descEl.textContent.trim();
          if (!desc) {
            const h1 = document.querySelector('h1');
            if (h1) desc = h1.textContent.trim();
          }

          // 从底部action bar提取数据
          // 通常顺序：点赞、评论、收藏、转发
          const actionNums = [];
          document.querySelectorAll('[class*="action"], [class*="toolbar"], [class*="interaction"]').forEach(container => {
            container.querySelectorAll('span').forEach(span => {
              const t = span.textContent.trim();
              if (/^[\d.]+[万wWkK亿]?$/.test(t)) {
                actionNums.push(t);
              }
            });
          });

          return { authorName, authorUrl, desc, nums: nums.slice(0, 10), actionNums };
        });

        if (detail.authorName) {
          videoDetails.push({
            videoUrl: v.url,
            tag: v.tag,
            authorName: detail.authorName,
            authorUrl: detail.authorUrl,
            desc: detail.desc,
            interactionNums: detail.actionNums.length > 0 ? detail.actionNums : detail.nums.map(n => n.text),
          });

          if (i < 20 || detail.authorName) {
            console.log(`[${i+1}] ${detail.authorName} | 互动: ${(detail.actionNums.length > 0 ? detail.actionNums : detail.nums.map(n=>n.text)).join(',')} | #${v.tag}`);
          }
        }
      } catch (e) {
        continue;
      }
    }

    console.log(`\n获取了 ${videoDetails.length} 个视频的详细信息`);

    // ===== 第三步：统计每个博主出现次数和互动数据，取 TOP 博主 =====
    const bloggerMap = new Map(); // authorUrl -> { name, url, videoCount, tags, videos }

    for (const vd of videoDetails) {
      if (!vd.authorUrl) continue;
      if (!bloggerMap.has(vd.authorUrl)) {
        bloggerMap.set(vd.authorUrl, {
          name: vd.authorName,
          url: vd.authorUrl,
          videoCount: 0,
          tags: new Set(),
          videos: [],
        });
      }
      const b = bloggerMap.get(vd.authorUrl);
      b.videoCount++;
      b.tags.add(vd.tag);
      b.videos.push({ url: vd.videoUrl, desc: vd.desc, nums: vd.interactionNums });
    }

    // 按视频出现次数排序（出现多次说明是大号/热门博主）
    const sortedBloggers = Array.from(bloggerMap.values())
      .sort((a, b) => b.videoCount - a.videoCount)
      .slice(0, 30);

    console.log(`\n====== 获取TOP博主的粉丝数据 ======\n`);

    const finalResults = [];

    for (const blogger of sortedBloggers) {
      if (finalResults.length >= 10) break;
      try {
        await page.goto(blogger.url, { waitUntil: 'domcontentloaded', timeout: 12000 });
        await page.waitForTimeout(2500);

        const profile = await page.evaluate(() => {
          const bodyText = document.body.innerText;
          const h1 = document.querySelector('h1');
          const name = h1 ? h1.textContent.trim() : '';
          const fanMatch = bodyText.match(/粉丝\s*([\d.]+[万wW亿]?)/) || bodyText.match(/([\d.]+[万wW亿]?)\s*粉丝/);
          const likeMatch = bodyText.match(/获赞\s*([\d.]+[万wW亿]?)/);
          const followMatch = bodyText.match(/关注\s*([\d.]+)/);

          let desc = '';
          const descEl = document.querySelector('[data-e2e="user-desc"]');
          if (descEl) desc = descEl.textContent.trim();

          // 判断是否是男性内容 - 检查视频封面/标签
          const pageText = bodyText.substring(0, 2000);
          const maleKeywords = ['腹肌','薄肌','宽肩','窄腰','禁欲','双开门','反差','健身','肌肉','男友','人夫','身高'];
          const femaleKeywords = ['黑丝','jk','制服诱惑','蜜桃','辣妹','甜妹穿搭','小姐姐'];
          let maleScore = 0, femaleScore = 0;
          maleKeywords.forEach(k => { if (pageText.includes(k)) maleScore++; });
          femaleKeywords.forEach(k => { if (pageText.includes(k)) femaleScore++; });

          return {
            name,
            followers: fanMatch ? fanMatch[1] : '',
            likes: likeMatch ? likeMatch[1] : '',
            desc,
            isMale: maleScore > femaleScore,
            maleScore,
            femaleScore,
          };
        });

        const followerNum = parseNum(profile.followers);
        const displayName = profile.name || blogger.name;
        console.log(`${displayName} | 粉丝: ${profile.followers}(${followerNum}) | 获赞: ${profile.likes} | 男性内容: ${profile.isMale}(${profile.maleScore}/${profile.femaleScore}) | 热门视频: ${blogger.videoCount}条`);

        // 截图
        const safeName = displayName.replace(/[\/\\:*?"<>|@#\s]/g, '_').substring(0, 20);
        const ssPath = `${ssDir}/${safeName}.png`;
        await page.screenshot({ path: ssPath });

        finalResults.push({
          name: displayName,
          url: blogger.url,
          followers: profile.followers,
          followerNum,
          totalLikes: profile.likes,
          desc: profile.desc,
          isMale: profile.isMale,
          hotVideoCount: blogger.videoCount,
          matchedTags: Array.from(blogger.tags),
          sampleVideos: blogger.videos.slice(0, 3).map(v => ({ url: v.url, desc: v.desc, nums: v.nums })),
          screenshot: ssPath,
        });

      } catch (e) {
        continue;
      }
    }

    // 最终输出 - 只保留男性博主，按粉丝数排序
    const maleResults = finalResults
      .filter(r => r.isMale)
      .sort((a, b) => b.followerNum - a.followerNum)
      .slice(0, 10);

    console.log('\n\n=============================================');
    console.log(`最终结果：擦边男博主 TOP ${maleResults.length}（按粉丝数排序）`);
    console.log('=============================================\n');

    maleResults.forEach((item, idx) => {
      console.log(`${idx + 1}. ${item.name}`);
      console.log(`   粉丝: ${item.followers} | 获赞: ${item.totalLikes}`);
      console.log(`   热门标签命中: ${item.matchedTags.map(t => '#' + t).join(' ')}`);
      console.log(`   搜索中出现: ${item.hotVideoCount} 次`);
      console.log(`   主页: ${item.url}`);
      console.log('');
    });

    // 也输出完整列表（含非男性）供参考
    console.log('\n--- 完整列表（含所有博主）---\n');
    finalResults.forEach((item, idx) => {
      console.log(`${idx+1}. ${item.name} | 粉丝: ${item.followers} | 男: ${item.isMale} | 标签: ${item.matchedTags.join(',')} | 出现: ${item.hotVideoCount}次`);
    });

    fs.writeFileSync(`${DIR}/target_bloggers.json`, JSON.stringify(maleResults, null, 2), 'utf-8');
    fs.writeFileSync(`${DIR}/all_bloggers.json`, JSON.stringify(finalResults, null, 2), 'utf-8');
    console.log('\n结果已保存到 target_bloggers.json / all_bloggers.json');

  } catch (error) {
    console.error('出错:', error.message);
    await page.screenshot({ path: `${DIR}/search_error.png` }).catch(() => {});
  } finally {
    browser.close();
  }
})();
