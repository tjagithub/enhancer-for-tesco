const { chromium } = require('playwright-core');

const EXT = require('path').join(__dirname, '..');
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = process.argv[2] || 'https://www.tesco.com/shop/en-GB/browse/frozen-food/ice-cream-and-lollies/all';
const OUT = process.argv[3] || '/tmp/thl-shot.png';

(async () => {
  const context = await chromium.launchPersistentContext('/tmp/thl-shot-profile', {
    executablePath: CHROME, headless: false,
    viewport: { width: 1500, height: 1100 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--load-extension=' + EXT],
  });
  const page = context.pages()[0] || await context.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  const stats = await page.evaluate(() => {
    const layers = [...document.querySelectorAll('.thl-layer')];
    const washes = [...document.querySelectorAll('.thl-wash')];
    const badges = [...document.querySelectorAll('.thl-badge')];
    const prices = [...document.querySelectorAll('[class*=online-components-product-tile-price__text]')];
    const bars = [...document.querySelectorAll('a[class*=ddsweb-value-bar__container]')];
    const modifiedPrices = prices.filter((p) => ['thl-low', 'thl-mid', 'thl-high', 'thl-clubcard'].some((c) => p.classList.contains(c))).length;
    const modifiedBars = bars.filter((b) => ['thl-low', 'thl-mid', 'thl-high', 'thl-clubcard'].some((c) => b.classList.contains(c))).length;
    const insideTile = washes.filter((w) => {
      const r = w.getBoundingClientRect();
      const t = w.closest('li');
      if (!t) return false;
      const tr = t.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.left >= tr.left - 1 && r.left + r.width <= tr.right + 1;
    }).length;
    const cc = badges.filter((b) => /^CC /.test(b.textContent));
    const layerPE = layers[0] ? getComputedStyle(layers[0]).pointerEvents : null;
    const sample = (() => {
      const w = washes[0];
      if (!w) return null;
      const r = w.getBoundingClientRect();
      return { cls: w.className, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], left: w.style.left, top: w.style.top };
    })();
    return {
      prices: prices.length,
      bars: bars.length,
      ratings: document.querySelectorAll('.thl-rating').length,
      layers: layers.length,
      washes: washes.length,
      badges: badges.length,
      ccBadges: cc.length,
      ccSample: cc[0] ? cc[0].textContent : null,
      insideTile,
      modifiedPrices,
      modifiedBars,
      layerPointerEvents: layerPE,
      sample,
    };
  });
  console.log(JSON.stringify(stats, null, 1));
  await page.screenshot({ path: OUT, fullPage: false });
  console.log('screenshot:', OUT);
  await context.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
