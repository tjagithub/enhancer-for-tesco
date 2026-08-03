const { chromium } = require('playwright-core');

const EXT = require('path').join(__dirname, '..');
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

(async () => {
  const context = await chromium.launchPersistentContext('/tmp/thl-chromium-profile', {
    executablePath: CHROME,
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--load-extension=${EXT}`],
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://www.tesco.com/shop/en-GB/browse/fresh-food/all', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  const result = await page.evaluate(() => ({
    title: document.title,
    prices: document.querySelectorAll('[class*="online-components-product-tile-price__text"]').length,
    highlighted: document.querySelectorAll('[class*="thl-"]').length,
    ratings: document.querySelectorAll('.thl-rating').length,
    ratingContainers: document.querySelectorAll('[data-testid="star-rating"]').length,
    ratingSample: (() => {
      const c = document.querySelector('[data-testid="star-rating"]');
      return c ? c.outerHTML.slice(0, 300) : null;
    })(),
  }));
  console.log(JSON.stringify(result));
  await context.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
