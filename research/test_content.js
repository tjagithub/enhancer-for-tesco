const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PARSE_SRC = fs.readFileSync(path.join(__dirname, '..', 'content', 'parse.js'), 'utf8');
const CONTENT_SRC = fs.readFileSync(path.join(__dirname, '..', 'content', 'content.js'), 'utf8');
const FILTERS_SRC = fs.readFileSync(path.join(__dirname, '..', 'content', 'filters.js'), 'utf8');
const DEPTS_SRC = fs.readFileSync(path.join(__dirname, '..', 'content', 'departments.js'), 'utf8');
const PAGES_SRC = fs.readFileSync(path.join(__dirname, '..', 'content', 'pages.js'), 'utf8');

const FIXTURES = [
  { name: 'ice-cream', file: path.join(__dirname, 'fixtures', 'ice-cream.html') },
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
  // Saved pages carry Tesco's own scripts; strip them before JSDOM runs anything.
  const grid = fs.readFileSync(fixture.file, 'utf8').replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const dom = makeDom(grid);
  installChromeShim(dom, undefined);
  run(PARSE_SRC, dom);
  run(DEPTS_SRC, dom);
  run(FILTERS_SRC, dom);
  run(PAGES_SRC, dom);
  run(CONTENT_SRC, dom);
  await new Promise((r) => setTimeout(r, 100));
  const doc = dom.window.document;

  console.log(`\n== ${fixture.name} ==`);

  // Filter bar: built from Tesco's hidden panel; its controls click Tesco's own inputs.
  const fbar = doc.querySelector('.thl-filters');
  assert(fbar, 'filter bar rendered');
  const dds = [...doc.querySelectorAll('.thl-filters .thl-dd')].map((d) => d.dataset.title);
  assert(dds[0] === 'Sort' && dds.length === 5, `sort + 4 group dropdowns (${dds.join(', ')})`);
  const chips = [...doc.querySelectorAll('.thl-filters .thl-fchip')].map((c) => c.firstChild.textContent);
  assert(chips.join() === 'New,Special Offers', `toggle chips (${chips.join()})`);
  const panelNew = [...doc.querySelectorAll('[aria-label="side panel filter"] input[type=checkbox]')][0];
  let proxied = 0;
  panelNew.addEventListener('click', () => proxied++);
  doc.querySelector('.thl-filters .thl-fchip').click();
  assert(proxied === 1, 'chip clicks Tesco\'s own checkbox');

  // Department sidebar: built from the bundled tree, opened down to the page's aisle (canonical link).
  const side = doc.querySelectorAll('.thl-sidebar');
  assert(side.length === 1, 'one department sidebar');
  const supers = doc.querySelectorAll('.thl-sidebar > details.thl-sb-super').length;
  assert(supers === 4, `sidebar lists grocery departments only (${supers})`);
  const cur = doc.querySelector('.thl-sb-current');
  assert(cur && cur.textContent === 'Ice Cream & Lollies' && cur.getAttribute('href') === '/shop/en-GB/browse/groceries-and-essentials/frozen-food/ice-cream-and-lollies/all', 'current aisle highlighted with its link');
  const openNames = [...doc.querySelectorAll('.thl-sidebar details[open] > summary')].map((s) => s.textContent).join(' > ');
  assert(openNames === 'Groceries & Essentials > Frozen Food', `only the current path is open (${openNames})`);
  const links = doc.querySelectorAll('.thl-sidebar a').length;
  assert(links < 120, `closed levels are not built yet (${links} links)`);

  const prices = doc.querySelectorAll('[class*="online-components-product-tile-price__text"]');
  const units = doc.querySelectorAll('[class*="online-components-product-tile-unit-price__subtext"]');
  const bars = doc.querySelectorAll('a[class*="ddsweb-value-bar__container"]');

  assert(prices.length > 0, `found ${prices.length} price elements`);
  assert(units.length === prices.length, `every price has a unit price (${units.length}/${prices.length})`);
  assert(bars.length > 0, `found ${bars.length} clubcard bars`);
  assert(doc.documentElement.classList.contains('thl-restyle'), 'restyle class set by default');
  assert(doc.documentElement.classList.contains('thl-declutter'), 'declutter class set by default');
  const banners = doc.querySelectorAll('.thl-banner').length;
  const packs = [...doc.querySelectorAll('.thl-pack')].filter((p) => p.textContent).length;
  assert(banners === prices.length, `every card has a banner (${banners}/${prices.length})`);
  assert(packs === prices.length, `every card has a pack size (${packs}/${prices.length})`);
  const ratingCount = doc.querySelectorAll('[data-testid="star-rating"]').length;
  const thumbs = doc.querySelectorAll('.thl-thumb-up, .thl-thumb-down').length;
  assert(thumbs === ratingCount, `every rated card has a thumb (${thumbs}/${ratingCount})`);

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

// Out-of-stock tile (no price, stock message instead) must still become a card.
async function runOutOfStock() {
  console.log('\n== out of stock ==');
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'tile-out-of-stock.html'), 'utf8');
  const dom = makeDom(html);
  installChromeShim(dom, undefined);
  run(PARSE_SRC, dom);
  run(CONTENT_SRC, dom);
  await new Promise((r) => setTimeout(r, 100));
  const doc = dom.window.document;
  const li = doc.querySelector('li');
  assert(li.dataset.thlStatus === 'unavailable', 'tile marked unavailable');
  const chip = doc.querySelector('.thl-chip-status');
  assert(chip && chip.textContent === 'Out of stock', 'banner shows Out of stock');
  const pack = doc.querySelector('.thl-pack');
  assert(pack && pack.textContent === '200 g', 'pack size from title (' + (pack && pack.textContent) + ')');
  const btn = doc.querySelector('.thl-unavailable-btn');
  assert(btn && btn.textContent === 'Out of Stock' && btn.getAttribute('aria-disabled') === 'true', 'disabled Out of Stock button');
  const title = doc.querySelector('.thl-title-link');
  assert(title && title.textContent === 'FRUIT RIOT CRUNCHY CANDY GRAPES', 'title stripped of size');
}

// Homepage: promo panels make way for a groceries-only department grid.
async function runHome() {
  console.log('\n== homepage ==');
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'home.html'), 'utf8').replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const dom = makeDom(html);
  installChromeShim(dom, undefined);
  for (const src of [PARSE_SRC, DEPTS_SRC, FILTERS_SRC, PAGES_SRC, CONTENT_SRC]) run(src, dom);
  await new Promise((r) => setTimeout(r, 100));
  const doc = dom.window.document;
  assert(doc.querySelectorAll('.thl-home').length === 1, 'one groceries grid');
  const cards = [...doc.querySelectorAll('.thl-home-card h2')].map((h) => h.textContent);
  assert(cards.length === 8 && cards[0] === 'Fresh Food', `grocery departments (${cards.join(', ')})`);
  const href = doc.querySelector('.thl-home-card li a').getAttribute('href');
  assert(/^\/shop\/en-GB\/browse\/groceries-and-essentials\/fresh-food\/[a-z0-9-]+\/all$/.test(href), 'aisle link is a browse URL (' + href + ')');
  assert(!doc.querySelector('.thl-sidebar'), 'no sidebar on the homepage');
}

(async () => {
  try {
    await runOutOfStock();
    await runHome();
  } catch (e) {
    failures++;
    console.error('  ERROR:', e.message);
  }
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
