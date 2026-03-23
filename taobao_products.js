const { chromium } = require('playwright');
const fs = require('fs');

const DIR = '/Users/mamengyang/.gemini/antigravity/my project';
const SS_DIR = `${DIR}/taobao_screenshots`;

// 9个淘宝短链接
const PRODUCT_LINKS = [
  'https://e.tb.cn/h.igkccpfvPDR5YRw?tk=RHcAUzj7YAW',
  'https://e.tb.cn/h.i5CbsdNomr1WwRO?tk=fZX7Uzj79IX',
  'https://e.tb.cn/h.i5CY6mOYAwYZ7ls?tk=eZHBUzjSeN9',
  'https://e.tb.cn/h.iTb9wvQQ6P0mmDt?tk=RvHXUzjibqT',
  'https://e.tb.cn/h.i5C1863RH8gRoQ0?tk=4oKHUzj7EGP',
  'https://e.tb.cn/h.iTbPzJtsKhrYSqJ?tk=DNADUzjRokG',
  'https://e.tb.cn/h.igkWN2VdlSUKdt3?tk=V79VUzjRiNc',
  'https://e.tb.cn/h.igk365JjowD2e9R?tk=TA6PUzj8Qo3',
  'https://e.tb.cn/h.iTbmpGP66607AMU?tk=qGcwUzjQ8Q5',
];

(async () => {
  console.log('连接 Chrome...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();

  // 创建截图目录
  if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

  const allProducts = [];

  for (let i = 0; i < PRODUCT_LINKS.length; i++) {
    const link = PRODUCT_LINKS[i];
    console.log(`\n========================================`);
    console.log(`[${i + 1}/${PRODUCT_LINKS.length}] 正在访问: ${link}`);

    try {
      // 访问短链接，等待跳转到产品页
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);

      // 获取当前URL（可能已跳转到产品页）
      let currentUrl = page.url();
      console.log(`  当前URL: ${currentUrl}`);

      // 如果还在 m.tb.cn，尝试等待跳转
      if (currentUrl.includes('m.tb.cn') || currentUrl.includes('login')) {
        console.log('  等待页面跳转...');
        await page.waitForTimeout(5000);
        currentUrl = page.url();
        console.log(`  跳转后URL: ${currentUrl}`);
      }

      // 等待页面内容加载
      await page.waitForTimeout(3000);

      // 截全页面图
      const ssPath = `${SS_DIR}/product_${i + 1}.png`;
      await page.screenshot({ path: ssPath, fullPage: false });
      console.log(`  截图: product_${i + 1}.png`);

      // 提取产品信息
      const info = await page.evaluate(() => {
        const getText = (selectors) => {
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
              const t = el.textContent.trim();
              if (t && t.length > 0) return t;
            }
          }
          return '';
        };

        // 商品标题 - 多种选择器适配淘宝/天猫不同版本
        let title = getText([
          'h1',
          '[class*="ItemHeader"] h1',
          '[class*="title"]',
          '[data-spm*="title"]',
          '.tb-main-title',
          '#J_Title h3',
          '.ItemHeader--mainTitle',
          'meta[property="og:title"]',
        ]);
        // 如果从meta获取
        if (!title) {
          const metaTitle = document.querySelector('meta[property="og:title"]');
          if (metaTitle) title = metaTitle.getAttribute('content') || '';
        }
        // 从document.title提取
        if (!title || title.length < 3) {
          const docTitle = document.title;
          if (docTitle && !docTitle.includes('登录') && docTitle.length > 5) {
            title = docTitle.replace(/-淘宝网$/, '').replace(/-天猫.*$/, '').trim();
          }
        }

        // 价格
        let price = '';
        const priceSelectors = [
          '[class*="Price"] span',
          '[class*="price"]',
          '.tb-rmb-num',
          '#J_StrPrice .tb-rmb-num',
          '[class*="priceText"]',
          'em.tb-rmb-num',
        ];
        for (const sel of priceSelectors) {
          const els = document.querySelectorAll(sel);
          for (const el of els) {
            const t = el.textContent.trim();
            if (t && /[\d.]+/.test(t)) {
              const match = t.match(/[\d.]+/);
              if (match && parseFloat(match[0]) > 1) {
                price = match[0];
                break;
              }
            }
          }
          if (price) break;
        }

        // 销量
        let sales = '';
        const salesSelectors = [
          '[class*="sold"]',
          '[class*="Sales"]',
          '[class*="sale"]',
          '[class*="tradeCount"]',
          '.tb-sell-counter',
        ];
        for (const sel of salesSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const t = el.textContent.trim();
            if (t && (t.includes('人') || t.includes('付款') || t.includes('件') || /\d/.test(t))) {
              sales = t;
              break;
            }
          }
        }
        // 从页面文本中查找销量
        if (!sales) {
          const bodyText = document.body.innerText;
          const salesMatch = bodyText.match(/(\d+[\d.]*\+?)\s*人付款/);
          if (salesMatch) sales = salesMatch[0];
          const salesMatch2 = bodyText.match(/月销\s*(\d+[\d.]*\+?)/);
          if (!sales && salesMatch2) sales = salesMatch2[0];
        }

        // 店铺名
        let shop = '';
        const shopSelectors = [
          '[class*="ShopHeader"] a',
          '[class*="shop-name"]',
          '[class*="shopName"]',
          '.tb-shop-name a',
          '[data-spm*="shop"]',
        ];
        for (const sel of shopSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const t = el.textContent.trim();
            if (t && t.length > 1 && t.length < 50) {
              shop = t;
              break;
            }
          }
        }

        // 商品属性/详情
        let attributes = [];
        const attrSelectors = [
          '[class*="Attr"] li',
          '[class*="attribute"] li',
          '.attributes-list li',
          '[class*="sku"] [class*="item"]',
          '[class*="property"] li',
        ];
        for (const sel of attrSelectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            els.forEach(el => {
              const t = el.textContent.trim();
              if (t && t.length < 100) attributes.push(t);
            });
            break;
          }
        }

        // SKU / 颜色选项
        let skuOptions = [];
        const skuSelectors = [
          '[class*="sku"] [class*="value"] span',
          '[class*="Sku"] [class*="text"]',
          '[class*="color"] [class*="name"]',
          '.J_Prop [class*="name"]',
          '[class*="skuItem"]',
        ];
        for (const sel of skuSelectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            els.forEach(el => {
              const t = el.textContent.trim();
              if (t && t.length < 50 && t.length > 0) skuOptions.push(t);
            });
            break;
          }
        }

        // 评价数
        let reviewCount = '';
        const bodyText = document.body.innerText;
        const reviewMatch = bodyText.match(/累计评价\s*(\d+)/);
        if (reviewMatch) reviewCount = reviewMatch[1];
        const reviewMatch2 = bodyText.match(/(\d+)\s*条评价/);
        if (!reviewCount && reviewMatch2) reviewCount = reviewMatch2[1];

        // 收集所有图片URL (主图)
        let mainImages = [];
        const imgSelectors = [
          '[class*="thumbnail"] img',
          '[class*="Thumbnail"] img',
          '[class*="main-image"] img',
          '[class*="PicGallery"] img',
          '#J_UlThumb img',
        ];
        for (const sel of imgSelectors) {
          const imgs = document.querySelectorAll(sel);
          if (imgs.length > 0) {
            imgs.forEach(img => {
              const src = img.src || img.getAttribute('data-src') || '';
              if (src && !src.includes('sprite') && !src.includes('icon')) {
                mainImages.push(src);
              }
            });
            break;
          }
        }

        // 页面全文（用于兜底分析）
        const pageText = document.body.innerText.substring(0, 3000);

        return {
          title,
          price,
          sales,
          shop,
          attributes,
          skuOptions,
          reviewCount,
          mainImages: mainImages.slice(0, 5),
          pageTextSnippet: pageText,
        };
      });

      const product = {
        序号: i + 1,
        原始链接: link,
        当前URL: currentUrl,
        商品标题: info.title,
        价格: info.price,
        销量: info.sales,
        店铺: info.shop,
        属性: info.attributes,
        SKU选项: info.skuOptions,
        评价数: info.reviewCount,
        主图: info.mainImages,
        截图文件: `product_${i + 1}.png`,
        页面文本摘要: info.pageTextSnippet.substring(0, 500),
      };

      allProducts.push(product);

      console.log(`  标题: ${info.title || '未获取'}`);
      console.log(`  价格: ¥${info.price || '未获取'}`);
      console.log(`  销量: ${info.sales || '未获取'}`);
      console.log(`  店铺: ${info.shop || '未获取'}`);
      console.log(`  SKU: ${info.skuOptions.slice(0, 5).join(', ') || '未获取'}`);
      console.log(`  评价: ${info.reviewCount || '未获取'}`);

    } catch (e) {
      console.log(`  ❌ 加载失败: ${e.message.substring(0, 80)}`);
      allProducts.push({
        序号: i + 1,
        原始链接: link,
        错误: e.message.substring(0, 200),
      });
    }

    // 每个产品之间等待，避免反爬
    if (i < PRODUCT_LINKS.length - 1) {
      console.log('  等待2秒后继续...');
      await page.waitForTimeout(2000);
    }
  }

  // 保存结果
  const outputPath = `${DIR}/taobao_products_data.json`;
  fs.writeFileSync(outputPath, JSON.stringify(allProducts, null, 2), 'utf-8');

  console.log(`\n============================`);
  console.log(`采集完成！共 ${allProducts.length} 个产品`);
  console.log(`数据: taobao_products_data.json`);
  console.log(`截图: taobao_screenshots/`);
  console.log(`============================`);

  browser.close();
})();
