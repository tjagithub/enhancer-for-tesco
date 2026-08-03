// E2E smoke test for the options popup against the real loaded extension.
// Launches headed Chromium with the extension, opens the popup page, mutates a
// band value, then verifies the content script rescored live tiles.
'use strict';

const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright-core');

const EXT = '/Volumes/dock/projects/tesco-highlight';
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

function extId(p) {
  const h = crypto.createHash('sha256').update(p).digest();
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += String.fromCharCode(97 + (h[i] >> 4)) + String.fromCharCode(97 + (h[i] & 0x0f));
  }
  return id;
}

(async () => {
  const id = extId(EXT);
  const context = await chromium.launchPersistentContext('/tmp/thl-popup-profile', {
    executablePath: CHROME,
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--load-extension=' + EXT],
  });
  const page = context.pages()[0] || await context.newPage();

  const popupUrl = 'chrome-extension://' + id + '/popup/popup.html';
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  try {
    await page.goto(popupUrl, { timeout: 20000 });
  } catch (e) {
    console.log('POPUP-OPEN-FAIL', e.message.split('\n')[0]);
    await context.close();
    process.exit(1);
  }

  const fields = await page.evaluate(() => ({
    title: document.title,
    enabled: document.getElementById('enabled').checked,
    mode: document.querySelector('input[name="mode"]:checked').value,
    kgLow: document.getElementById('kgLow').value,
    kgMid: document.getElementById('kgMid').value,
    eachLow: document.getElementById('eachLow').value,
    eachMid: document.getElementById('eachMid').value,
    flag: document.getElementById('flagRegular').checked,
    rating: document.getElementById('ratingIcons').checked,
  }));
  console.log('POPUP-FIELDS', JSON.stringify(fields));

  // Mutate the per-kg low band and save (change event).
  await page.fill('#kgLow', '3.2');
  await page.dispatchEvent('#kgLow', 'change');
  await page.waitForTimeout(300);

  const stored = await page.evaluate(() => new Promise((res) => {
    chrome.storage.local.get('settings', (s) => res(s.settings));
  }));
  console.log('STORED', JSON.stringify({ kgLow: stored.bands.kg.low, mode: stored.mode }));

  // Now load a Tesco page in the same context and confirm the content script
  // uses the updated threshold (a price between 2.5 and 3.2 should flip mid).
  await page.goto('https://www.tesco.com/shop/en-GB/browse/frozen-food/ice-cream-and-lollies/all', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  const stats = await page.evaluate(() => {
    const tags = [...document.querySelectorAll('.thl-badge.thl-tag')];
    return {
      title: document.title,
      bodyText: document.body.innerText.slice(0, 120),
      prices: document.querySelectorAll('[class*="online-components-product-tile-price__text"]').length,
      layers: document.querySelectorAll('.thl-layer').length,
      tags: tags.length,
      mids: tags.filter((t) => /^MID$/.test(t.textContent)).length,
      sample: tags.slice(0, 3).map((t) => t.textContent),
    };
  });
  console.log('LIVE', JSON.stringify(stats));
  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  await context.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
