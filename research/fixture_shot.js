// Renders the saved Tesco fixture with the extension injected, no live page load.
// Usage: node research/fixture_shot.js [fixture.html] [out-prefix] [restyle=1|0]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const FIXTURE = process.argv[2] || path.join(__dirname, 'fixtures', 'ice-cream.html');
const OUT = process.argv[3] || '/tmp/thl-fixture';
const RESTYLE = process.argv[4] !== '0';
const PAGE_URL = 'https://www.tesco.com/__fixture__';

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const html = fs.readFileSync(FIXTURE, 'utf8').replace(/<script\b[\s\S]*?<\/script>/gi, '');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1100 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  });
  page.on('response', (r) => { if (r.request().resourceType() === 'image' && r.status() >= 400) console.error('IMG', r.status(), r.url().slice(0, 80)); });
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.route('**/*', (route) => {
    const req = route.request();
    if (req.url() === PAGE_URL) return route.fulfill({ contentType: 'text/html', body: html });
    if (['script', 'xhr', 'fetch', 'websocket'].includes(req.resourceType())) return route.abort();
    return route.continue();
  });
  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 60000 });

  await page.evaluate((settings) => {
    const listeners = [];
    window.chrome = { storage: {
      local: { get: async () => ({ settings }) },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    } };
  }, { restyleTiles: RESTYLE });
  await page.addStyleTag({ content: read('content/content.css') });
  await page.addStyleTag({ content: read('content/tiles.css') });
  await page.addStyleTag({ content: read('content/declutter.css') });
  await page.addStyleTag({ content: read('content/filters.css') });
  await page.addStyleTag({ content: read('content/pages.css') });
  await page.addScriptTag({ content: read('content/parse.js') });
  await page.addScriptTag({ content: read('content/departments.js') });
  await page.addScriptTag({ content: read('content/filters.js') });
  await page.addScriptTag({ content: read('content/pages.js') });
  await page.addScriptTag({ content: read('content/content.js') });
  await page.waitForTimeout(1500);

  const grid = page.locator('li:has(.online-components-product-tile-price__text)').first();
  if (!(await grid.count())) {
    // Not a listing (homepage, product page): viewport and full-page shots only.
    await page.screenshot({ path: OUT + '-top.png' });
    await page.screenshot({ path: OUT + '-full.png', fullPage: true });
    await browser.close();
    return;
  }
  await grid.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.waitForFunction(() => [...document.images].filter((i) => i.closest('li')).slice(0, 8).every((i) => i.complete), null, { timeout: 15000 }).catch(() => console.error('images not complete'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '-grid.png' });
  await page.screenshot({ path: OUT + '-full.png', fullPage: true });
  const list = page.locator('ul:has(> li .online-components-product-tile-price__text)').first();
  await list.screenshot({ path: OUT + '-list.png' });
  await grid.screenshot({ path: OUT + '-tile.png' });
  const oos = page.locator('li[data-thl-status]').first();
  if (await oos.count()) await oos.screenshot({ path: OUT + '-unavailable.png' });
  const cc = page.locator('li:has(.ddsweb-value-bar__container)').first();
  if (await cc.count()) {
    const chip = cc.locator('.thl-chip-cc');
    if (await chip.count()) await chip.hover();
    await cc.screenshot({ path: OUT + '-cc.png' });
  }

  const brand = page.locator('.thl-dd[data-title="Brand"] > summary');
  if (await brand.count()) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await brand.click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: OUT + '-filters.png', clip: { x: 0, y: 0, width: 1500, height: 620 } });
  }

  const stats = await page.evaluate(() => ({
    restyle: document.documentElement.classList.contains('thl-restyle'),
    tiles: document.querySelectorAll('li:has(.online-components-product-tile-price__text)').length,
    scored: document.querySelectorAll('.thl-low, .thl-mid, .thl-high').length,
    badges: document.querySelectorAll('.thl-badge').length,
  }));
  console.log(JSON.stringify(stats));
  await browser.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
