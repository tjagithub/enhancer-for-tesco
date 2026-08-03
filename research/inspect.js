const { chromium } = require('playwright-core');

const EXE = '/Users/tja/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = process.argv[2] || 'https://www.tesco.com/groceries/en-GB/shop/fresh-food/all';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  const out = {};
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text()); });
  page.on('requestfailed', r => { if (r.url().includes('tesco')) console.log('REQ FAIL:', r.url(), r.failure()?.errorText); });

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);

    // Try to dismiss cookie banner
    for (const sel of ['#onetrust-accept-btn-handler', 'button:has-text("Accept all")', 'button:has-text("Accept")']) {
      try {
        const b = page.locator(sel).first();
        if (await b.isVisible({ timeout: 1500 }).catch(() => false)) {
          await b.click({ timeout: 1500 });
          await page.waitForTimeout(1000);
          break;
        }
      } catch {}
    }

    out.title = await page.title();
    out.url = page.url();

    // Find product-tile-like elements
    const tileCandidates = [
      '[data-auto="product-tile"]',
      '[data-auto="product-tile--product"]',
      '[data-auto="product-tile--deal"]',
      '[data-auto="product-tile--promotion"]',
      '[data-testid="product-tile"]',
      '.product-tile',
      'a[href*="/groceries/en-GB/products/"]',
    ];

    out.tileCounts = {};
    for (const sel of tileCandidates) {
      out.tileCounts[sel] = await page.locator(sel).count();
    }

    // Try to capture outerHTML of a few tiles for manual analysis
    let tileHtmls = [];
    for (const sel of tileCandidates) {
      const n = await page.locator(sel).count();
      if (n > 0) {
        const tiles = page.locator(sel);
        for (let i = 0; i < Math.min(3, n); i++) {
          tileHtmls.push(`<=== ${sel} [${i}] ===>\n` + (await tiles.nth(i).evaluate(el => el.outerHTML)));
        }
        break;
      }
    }

    // Save full page html for offline grep
    const html = await page.content();
    require('fs').writeFileSync(__dirname + '/page.html', html);

    require('fs').writeFileSync(__dirname + '/tiles.txt', tileHtmls.join('\n\n'));

    console.log(JSON.stringify(out, null, 2));
    console.log('saved tiles.txt + page.html');
  } catch (e) {
    console.log('ERROR', e.message);
  } finally {
    await browser.close();
  }
})();
