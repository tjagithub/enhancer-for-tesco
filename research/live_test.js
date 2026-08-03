const fs = require('fs');
const path = require('path');
const { firefox } = require('playwright-core');

const FF = '/Users/tja/Library/Caches/ms-playwright/firefox-1534/firefox/Nightly.app/Contents/MacOS/firefox';
const URL = process.argv[2] || 'https://www.tesco.com/shop/en-GB/browse/fresh-food/all';
const SHOT = process.argv[3] || path.join(__dirname, 'live-shot.png');

const parseSrc = fs.readFileSync(path.join(__dirname, '..', 'content', 'parse.js'), 'utf8');
const contentSrc = fs.readFileSync(path.join(__dirname, '..', 'content', 'content.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'content', 'content.css'), 'utf8');

(async () => {
  const browser = await firefox.launch({ executablePath: FF, headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(5000);

  // Inject extension files with a storage shim
  await page.evaluate(([shim, p, c, css]) => {
    window.chrome = {
      storage: {
        local: {
          get: async (key) => ({ settings: undefined }),
          onChanged: { addListener() {} },
        },
      },
    };
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    (0, eval)(p);
    (0, eval)(c);
  }, [null, parseSrc, contentSrc, cssSrc]);

  await page.waitForTimeout(1500);

  const stats = await page.evaluate(() => {
    const count = (sel) => document.querySelectorAll(sel).length;
    const prices = [...document.querySelectorAll('[class*="online-components-product-tile-price__text"]')];
    const scored = prices.filter((p) => /thl-(low|mid|high)/.test(p.className)).length;
    const bars = [...document.querySelectorAll('a[class*="ddsweb-value-bar__container"]')];
    const ccScored = bars.filter((b) => b.classList.contains('thl-clubcard')).length;
    return {
      url: location.href,
      priceCount: prices.length,
      scored,
      scored,
      bars,
      ccScored,
      ratingCount: document.querySelectorAll('.thl-rating').length,
      badges: document.querySelectorAll('.thl-badge').length,
      firstExample: prices.slice(0, 4).map((p) => ({
        text: p.textContent.trim().slice(0, 40),
        cls: [...p.classList].filter((c) => c.startsWith('thl')).join(' '),
        badge: p.querySelector('.thl-badge') && p.querySelector('.thl-badge').textContent,
        unit: p.parentElement && p.parentElement.querySelector('[class*="online-components-product-tile-unit-price__subtext"]') &&
          p.parentElement.querySelector('[class*="online-components-product-tile-unit-price__subtext"]').textContent.trim(),
      })),
    };
  });

  await page.screenshot({ path: SHOT, fullPage: false });

  console.log(JSON.stringify({ stats, errors }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
