const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PARSE_SRC = fs.readFileSync(path.join(__dirname, '..', 'content', 'parse.js'), 'utf8');
const CONTENT_SRC = fs.readFileSync(path.join(__dirname, '..', 'content', 'content.js'), 'utf8');

const FIXTURES = [
  { name: 'browse', file: '/tmp/grid_browse.html' },
  { name: 'search', file: '/tmp/grid_search.html' },
];

let failures = 0;

function makeDom(gridHtml) {
  const html = `<!DOCTYPE html><html><body>${gridHtml}</body></html>`;
  return new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
}

function installChromeShim(dom, settingsValue) {
  dom.window.chrome = {
    storage: {
      local: {
        get: async (key) => ({ settings: settingsValue }),
        onChanged: { addListener() {} },
      },
    },
  };
}

function run(content, dom) {
  dom.window.eval(content);
}function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.error('  FAIL:', msg);
  } else {
    console.log('  ok:', msg);
  }
}

async function runFixture(fixture) {
  const grid = fs.readFileSync(fixture.file, 'utf8');
  const dom = makeDom(grid);
  installChromeShim(dom, undefined);
  run(PARSE_SRC, dom);
  run(CONTENT_SRC, dom);
  await new Promise((r) => setTimeout(r, 100));
  const doc = dom.window.document;

  console.log(`\n== ${fixture.name} ==`);

  const prices = doc.querySelectorAll('[class*="online-components-product-tile-price__text"]');
  const units = doc.querySelectorAll('[class*="online-components-product-tile-unit-price__subtext"]');
  const bars = doc.querySelectorAll('a[class*="ddsweb-value-bar__container"]');

  assert(prices.length > 0, `found ${prices.length} price elements`);
  assert(units.length === prices.length, `every price has a unit price (${units.length}/${prices.length})`);
  assert(bars.length > 0, `found ${bars.length} clubcard bars`);

  const layers = doc.querySelectorAll('.thl-layer');
  assert(layers.length > 0, `overlay layers created (${layers.length})`);

  const priceWash = (p) => {
    const tile = p.closest('li');
    const layer = tile && tile.querySelector('.thl-layer');
    return (layer && layer.querySelectorAll('.thl-wash')[0]) || null;
  };

  // target elements must not be modified: no score classes, no inline badges, no data-thl
  let untouched = 0;
  prices.forEach((p) => {
    const modified = ['thl-low', 'thl-mid', 'thl-high', 'thl-clubcard', 'thl-regular-on-clubcard']
      .some((c) => p.classList.contains(c));
    if (!modified && !p.querySelector('.thl-badge') && !p.hasAttribute('data-thl')) untouched++;
  });
  assert(untouched === prices.length, `price elements untouched (${untouched}/${prices.length})`);

  // each price has a positioned wash overlay scored low/mid/high
  let scored = 0;
  prices.forEach((p) => {
    const wash = priceWash(p);
    if (wash && ['thl-low', 'thl-mid', 'thl-high'].some((c) => wash.classList.contains(c)) && wash.style.left !== '') scored++;
  });
  assert(scored === prices.length, `all prices scored with wash overlay (${scored}/${prices.length})`);

  // bars get a "CC ..." badge overlay in their tile layer
  let ccBadges = 0;
  bars.forEach((b) => {
    const tile = b.closest('li');
    const layer = tile && tile.querySelector('.thl-layer');
    const badge = layer && [...layer.querySelectorAll('.thl-badge')].find((x) => /^CC /.test(x.textContent));
    if (badge) ccBadges++;
  });
  assert(ccBadges === bars.length, `all clubcard bars have CC badge overlay (${ccBadges}/${bars.length})`);

  // regular prices in clubcard tiles flagged with a "CC deal available" badge
  let flagged = 0;
  prices.forEach((p) => {
    const tile = p.closest('li');
    const layer = tile && tile.querySelector('.thl-layer');
    const badge = layer && [...layer.querySelectorAll('.thl-badge')].find((x) => x.textContent === 'CC deal available');
    if (badge) flagged++;
  });
  assert(flagged > 0, `regular prices in clubcard tiles flagged (${flagged})`);

  // every price has a badge overlay (score label or CC deal available)
  let withBadge = 0;
  prices.forEach((p) => {
    const tile = p.closest('li');
    const layer = tile && tile.querySelector('.thl-layer');
    if (layer && layer.querySelectorAll('.thl-badge').length) withBadge++;
  });
  assert(withBadge === prices.length, `badge overlay on all prices (${withBadge}/${prices.length})`);

  // unit price wash matches its price wash score
  let unitMatch = 0;
  prices.forEach((p) => {
    const parent = p.parentElement;
    const u = parent && parent.querySelector('[class*="online-components-product-tile-unit-price__subtext"]');
    if (!u) return;
    const tile = p.closest('li');
    const layer = tile && tile.querySelector('.thl-layer');
    const washes = layer && layer.querySelectorAll('.thl-wash');
    const pw = washes && washes[0];
    const uw = washes && washes[1];
    const pc = pw && ['thl-low', 'thl-mid', 'thl-high'].find((c) => pw.classList.contains(c));
    if (pc && uw && uw.classList.contains(pc)) unitMatch++;
  });
  assert(unitMatch === prices.length, `unit price wash matches price score (${unitMatch}/${prices.length})`);

  // star-rating icons
  const ratings = doc.querySelectorAll('[data-testid="star-rating"]');
  const icons = doc.querySelectorAll('.thl-rating');
  const rated = [...ratings].filter((r) => {
    const el = r.querySelector('[aria-label*="out of 5"]') || r;
    return /out of 5/i.test(el.getAttribute('aria-label') || '');
  }).length;
  assert(ratings.length > 0, `found ${ratings.length} rating containers`);
  assert(icons.length === rated, `rating icons only on rated tiles (${icons.length} icons / ${rated} rated)`);
  assert([...icons].every((i) => ['✅', '⚠️', '❌'].includes(i.textContent)), 'rating icons use expected emoji');
  const okEmoji = [...icons].every((i) => {
    const r = parseFloat(i.title || '0');
    return (i.textContent === '✅' && r >= 4) || (i.textContent === '⚠️' && r >= 3 && r < 4) || (i.textContent === '❌' && r < 3);
  });
  assert(okEmoji, 'rating emoji matches threshold rules');
}

(async () => {
  for (const f of FIXTURES) {
    try {
      await runFixture(f);
    } catch (e) {
      failures++;
      console.error('  ERROR:', e.message);
    }
  }

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
