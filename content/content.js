(() => {
  'use strict';

  const P = globalThis.TescoPriceHighlightParse;
  const parsePrice = P.parsePrice;
  const parseUnitPrice = P.parseUnitPrice;
  const { parsePackSize, estimatePackSize, formatPack, stripPackSize, formatOfferDates } = P;
  const VBAR_TERMS_SEL = '[class*="ddsweb-value-bar__terms"]';
  const STATUS_SEL = '[class*="online-components-product-tile-status-message__wrapper"]';

  const PRICE_SEL = '[class*="online-components-product-tile-price__text"]';
  const UNIT_SEL = '[class*="online-components-product-tile-unit-price__subtext"]';
  const VBAR_SEL = 'a[class*="ddsweb-value-bar__container"]';
  const VBAR_TEXT_SEL = '[class*="ddsweb-value-bar__content-text"]';
  const VBAR_SUB_SEL = '[class*="ddsweb-value-bar__content-subtext"]';
  const RATING_SEL = '[data-testid="star-rating"]';
  const TITLE_SEL = '[class*="online-components-product-tile-product-heading__heading"]';
  const SPONSORED_SEL = '[class*="online-components-product-tile-sponsored-label__sponsored-label"]';

  const SCORE_CLASSES = ['thl-low', 'thl-mid', 'thl-high'];
  const SCORE_LABELS = { low: 'LOW', mid: 'MID', high: 'HIGH' };
  const SCORE_BADGES = { low: 'thl-badge-low', mid: 'thl-badge-mid', high: 'thl-badge-high' };

  const DEFAULT_SETTINGS = {
    enabled: true,
    mode: 'bands', // 'bands' | 'relative'
    bands: {
      kg: { low: 2.5, mid: 6.0 },
      each: { low: 1.0, mid: 3.0 },
    },
    flagRegularOnClubcard: true,
    ratingIcons: true,
    restyleTiles: true,
    declutter: true,
  };

  let settings = DEFAULT_SETTINGS;
  let lastErrorShown = false;

  const storage = (typeof browser !== 'undefined' && browser.storage) || (typeof chrome !== 'undefined' && chrome.storage);

  // ---- Overlay layer management -------------------------------------------
  // Highlights live in a separate `.thl-layer` appended to the tile root.
  // The layer is pointer-transparent, so the page's own elements keep working.
  // Tile anchors are turned into positioning contexts with `position: relative`
  // (visually neutral) so overlays can be absolutely positioned on top.

  const tileLayers = new Map(); // tile root -> { layer, groups: Map<target, group> }
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((entries) => {
    for (const entry of entries) layoutTile(entry.target);
  }) : null;

  function deepMerge(base, over) {
    const out = { ...base };
    if (over && typeof over === 'object') {
      for (const k of Object.keys(over)) {
        if (base[k] && typeof base[k] === 'object' && typeof over[k] === 'object') {
          out[k] = { ...base[k], ...over[k] };
        } else {
          out[k] = over[k];
        }
      }
    }
    return out;
  }

  async function loadSettings() {
    try {
      const got = await storage.local.get('settings');
      settings = deepMerge(DEFAULT_SETTINGS, got.settings);
    } catch (e) {
      if (!lastErrorShown) {
        lastErrorShown = true;
        console.warn('[Tesco Price Highlight] Could not read settings:', e.message);
      }
    }
    scan();
  }

  // ---- Tile restyle (experimental) ----------------------------------------

  function applyTileRestyle() {
    const root = document.documentElement.classList;
    const declutter = !!settings.enabled && !!settings.declutter;
    root.toggle('thl-restyle', !!settings.enabled && !!settings.restyleTiles);
    root.toggle('thl-declutter', declutter);
    renderHeaderBasket(declutter);
    renderSidebar(declutter);
    if (globalThis.THLFilters) globalThis.THLFilters.render(declutter);
    if (globalThis.THLPages) globalThis.THLPages.render(declutter);
  }

  // ---- Department sidebar (declutter) ------------------------------------
  // Tree comes from content/departments.js (bundled from Tesco's menu data); links are built from slugs.

  const BROWSE = '/shop/en-GB/browse/';

  // Slugs of the browse page we are on, e.g. ['groceries-and-essentials', 'frozen-food', 'ice-cream-and-lollies'].
  function currentBrowsePath() {
    const canon = document.querySelector('link[rel="canonical"]');
    for (const href of [location.href, canon && canon.href]) {
      if (!href) continue;
      let pathname;
      try { pathname = new URL(href, location.href).pathname; } catch (e) { continue; }
      const m = pathname.match(/\/browse\/(.+?)(?:\/all)?\/?$/);
      if (m) return m[1].split('/');
    }
    return [];
  }

  function renderSidebar(on) {
    const existing = document.querySelector('.thl-sidebar');
    const wrapper = document.querySelector('.template-wrapper');
    const tree = globalThis.THL_DEPARTMENTS;
    if (!on || !wrapper || !Array.isArray(tree)) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    const here = currentBrowsePath();
    const aside = document.createElement('aside');
    aside.className = 'thl-sidebar';
    aside.setAttribute('aria-label', 'Departments');
    const title = aside.appendChild(document.createElement('h2'));
    title.className = 'thl-sb-title';
    title.textContent = 'Departments';
    const keep = globalThis.THLPages ? globalThis.THLPages.GROCERY : null;
    for (const [name, children] of tree) {
      if (!keep || keep.includes(name)) aside.appendChild(sidebarGroup([name], children, here));
    }
    wrapper.insertBefore(aside, wrapper.firstChild);
    // Bring the current aisle into view inside the sidebar only (scrollIntoView would move the page).
    const cur = aside.querySelector('.thl-sb-current');
    if (cur) aside.scrollTop = Math.max(0, cur.offsetTop - aside.clientHeight / 2);
  }

  // A collapsible level; its links are only built the first time it opens.
  function sidebarGroup(names, children, here) {
    const slugs = names.map(P.slugify);
    const onPath = slugs.every((s, i) => here[i] === s);
    const details = document.createElement('details');
    details.className = names.length === 1 ? 'thl-sb-super' : 'thl-sb-dept';
    details.appendChild(document.createElement('summary')).textContent = names[names.length - 1];
    const fill = () => {
      if (details.dataset.filled) return;
      details.dataset.filled = '1';
      details.appendChild(sidebarLink('All ' + names[names.length - 1], slugs, 'thl-sb-all', false));
      for (const child of children) {
        if (Array.isArray(child)) {
          details.appendChild(sidebarGroup([...names, child[0]], child[1], here));
        } else {
          const s = [...slugs, P.slugify(child)];
          details.appendChild(sidebarLink(child, s, 'thl-sb-aisle', s.every((x, i) => here[i] === x)));
        }
      }
    };
    if (onPath) {
      details.open = true;
      fill();
    }
    details.addEventListener('toggle', () => { if (details.open) fill(); });
    return details;
  }

  function sidebarLink(text, slugs, cls, current) {
    const a = document.createElement('a');
    a.className = cls + (current ? ' thl-sb-current' : '');
    a.href = BROWSE + slugs.join('/') + '/all';
    a.textContent = text;
    if (current) a.setAttribute('aria-current', 'page');
    return a;
  }

  // Declutter hides the basket sidebar, so mirror its total into a header button.
  function renderHeaderBasket(on) {
    const masthead = document.querySelector('[data-testid="masthead"]');
    const existing = document.querySelector('.thl-header-basket');
    if (!on || !masthead) {
      if (existing) existing.remove();
      return;
    }
    const link = existing || ensureChild(masthead, 'thl-header-basket', 'a');
    if (!link.firstChild) {
      link.appendChild(basketIcon());
      link.appendChild(document.createElement('span'));
    }
    const icon = document.querySelector('[data-auto="basket-icon"]');
    const href = (icon && icon.href) || '/shop/en-GB/trolley';
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    const priceEl = document.querySelector('[data-auto="basket-guide-price"] [data-auto="price-value"]');
    const total = priceEl ? priceEl.textContent.trim() : 'Basket';
    const label = link.lastChild;
    if (label.textContent !== total) label.textContent = total;
    link.setAttribute('aria-label', 'Basket, ' + total + ' guide price');
  }

  function basketIcon() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M3 9h18l-2 11H5L3 9zm5 0l4-6 4 6M9 13v4m3-4v4m3-4v4');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  // Restyled cards get a verdict banner and a pack-size line. Elements are appended
  // (never reordered) and only rewritten when their content changes, so scans settle.
  function ensureChild(parent, cls, tag) {
    let el = parent.querySelector(':scope > .' + cls);
    if (!el) {
      el = document.createElement(tag || 'div');
      el.className = cls;
      parent.appendChild(el);
    }
    return el;
  }

  function renderCard(tile, info) {
    const grid = tile.querySelector(':scope > div:not(.thl-layer) > div');
    if (!grid) return;
    tile.dataset.thlScore = info.score || 'none';
    if (info.status) tile.dataset.thlStatus = 'unavailable';
    else delete tile.dataset.thlStatus;

    const chips = [];
    if (tile.querySelector(SPONSORED_SEL)) chips.push(['sponsored', 'Sponsored']);
    if (info.status) chips.push(['status', /out of stock/i.test(info.status) ? 'Out of stock' : 'Unavailable']);
    if (info.score) chips.push([info.score, SCORE_LABELS[info.score]]);
    if (info.cc) chips.push(['cc thl-chip-cc-' + (info.cc.score || 'none'), info.cc.text, clubcardRows(info)]);
    const banner = ensureChild(grid, 'thl-banner');
    const key = JSON.stringify(chips);
    if (banner.dataset.key !== key) {
      banner.dataset.key = key;
      banner.replaceChildren(...chips.map(([kind, text, rows]) => {
        const chip = document.createElement('span');
        chip.className = 'thl-chip thl-chip-' + kind;
        chip.textContent = text;
        if (rows) {
          chip.tabIndex = 0;
          chip.appendChild(popover(rows));
        }
        return chip;
      }));
    }

    const ratingEl = tile.querySelector(RATING_SEL);
    const rating = ratingEl ? parseRating(ratingEl) : null;
    const thumb = grid.querySelector(':scope > .thl-thumb');
    if (rating === null) {
      if (thumb) thumb.remove();
    } else {
      const el = thumb || ensureChild(grid, 'thl-thumb');
      const up = rating >= 4;
      const cls = 'thl-thumb ' + (up ? 'thl-thumb-up' : 'thl-thumb-down');
      if (el.className !== cls) el.className = cls;
      if (el.textContent !== (up ? '\u{1F44D}' : '\u{1F44E}')) el.textContent = up ? '\u{1F44D}' : '\u{1F44E}';
      el.title = rating.toFixed(1) + ' out of 5 stars';
    }

    const titleEl = tile.querySelector(TITLE_SEL);
    if (titleEl) {
      const full = titleEl.textContent.trim();
      const link = ensureChild(ensureChild(grid, 'thl-title'), 'thl-title-link', 'a');
      const short = stripPackSize(full);
      const href = (titleEl.querySelector('a[href]') || {}).href || '';
      if (link.textContent !== short) link.textContent = short;
      if (link.title !== full) link.title = full;
      if (href && link.href !== href) link.href = href;
    }

    const pack = parsePackSize(titleEl && titleEl.textContent) || estimatePackSize(info.price, info.unit, titleEl && titleEl.textContent);
    // No price: our own footer with the pack line and a greyed-out "Out of Stock" button.
    let host = info.priceEl && info.priceEl.parentElement;
    if (!host) {
      host = ensureChild(grid, 'thl-unavailable');
      const btn = ensureChild(host, 'thl-unavailable-btn', 'span');
      const label = /out of stock/i.test(info.status) ? 'Out of Stock' : 'Unavailable';
      if (btn.textContent !== label) btn.textContent = label;
      if (btn.title !== info.status) btn.title = info.status;
      btn.setAttribute('aria-disabled', 'true');
    }
    const packEl = ensureChild(host, 'thl-pack', 'p');
    const packText = formatPack(pack);
    if (packEl.textContent !== packText) packEl.textContent = packText;
  }

  // Clubcard breakdown for the chip's hover popover: [label, value, extra class].
  function clubcardRows(info) {
    const cc = info.cc;
    const money = (n) => '£' + n.toFixed(2);
    const withUnit = (price, unit) => (price !== null ? money(price) : '') + (unit ? ' · ' + unit : '');
    const rows = [['Clubcard price', withUnit(cc.price, cc.unitText), 'thl-pop-cc']];
    if (info.price !== null) rows.push(['Regular price', withUnit(info.price, info.unitText)]);
    // Only straight price cuts have a meaningful saving; multi-buys ("Any 2 for £3") do not.
    const single = /^£?\d+(\.\d+)?\s*(save\b.*)?$/i.test(cc.text.replace(/^Clubcard\s*/, ''));
    if (single && cc.price !== null && info.price > cc.price) {
      const saved = info.price - cc.price;
      rows.push(['You save', money(saved) + ' (' + Math.round((saved / info.price) * 100) + '%)', 'thl-pop-save']);
    }
    if (cc.score) rows.push(['Clubcard verdict', SCORE_LABELS[cc.score], 'thl-pop-' + cc.score]);
    if (cc.dates) rows.push(['Valid', cc.dates]);
    return rows;
  }

  function popover(rows) {
    const pop = document.createElement('span');
    pop.className = 'thl-pop';
    pop.setAttribute('role', 'tooltip');
    for (const [label, value, cls] of rows) {
      const row = document.createElement('span');
      row.className = 'thl-pop-row' + (cls ? ' ' + cls : '');
      const l = document.createElement('span');
      l.className = 'thl-pop-label';
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'thl-pop-value';
      v.textContent = value;
      row.append(l, v);
      pop.appendChild(row);
    }
    return pop;
  }

  function clearCards() {
    document.querySelectorAll('.thl-banner, .thl-pack, .thl-thumb, .thl-title, .thl-unavailable').forEach((el) => el.remove());
    document.querySelectorAll('[data-thl-score]').forEach((el) => delete el.dataset.thlScore);
    document.querySelectorAll('[data-thl-status]').forEach((el) => delete el.dataset.thlStatus);
  }

  function tileRoot(el) {
    return (
      el.closest('li') ||
      el.closest('[data-auto="pdp-buy-box"]') ||
      (el.parentElement && el.parentElement.closest('[data-auto="pdp-buy-box"]')) ||
      el.parentElement
    );
  }

  function tileLayer(tile) {
    let entry = tileLayers.get(tile);
    if (!entry) {
      if (getComputedStyle(tile).position === 'static') tile.style.position = 'relative';
      const layer = document.createElement('div');
      layer.className = 'thl-layer';
      tile.appendChild(layer);
      entry = { layer, groups: new Map() };
      tileLayers.set(tile, entry);
      if (resizeObserver) resizeObserver.observe(tile);
    } else if (!entry.layer.isConnected) {
      // The page re-rendered and dropped our layer; put it back.
      tile.appendChild(entry.layer);
    }
    return entry;
  }

  function groupFor(tile, target) {
    const entry = tileLayer(tile);
    let g = entry.groups.get(target);
    if (!g) {
      g = { layer: entry.layer, wash: null, badge: null, placement: 'right', kind: 'pill' };
      entry.groups.set(target, g);
    }
    return g;
  }

  function setWash(g, cls) {
    if (!g.wash) {
      g.wash = document.createElement('div');
      g.wash.className = 'thl-wash';
      g.layer.appendChild(g.wash);
    }
    g.wash.className = 'thl-wash ' + cls;
  }

  function setBadge(g, text, cls, placement, kind) {
    if (!g.badge) {
      g.badge = document.createElement('span');
      g.badge.className = 'thl-badge';
      g.layer.appendChild(g.badge);
    }
    g.badge.textContent = text;
    g.badge.className = 'thl-badge ' + cls + (kind === 'tag' ? ' thl-tag' : '');
    g.placement = placement || 'right';
    g.kind = kind || 'pill';
  }

  function clearGroup(tile, target) {
    const entry = tileLayers.get(tile);
    if (!entry) return;
    const g = entry.groups.get(target);
    if (!g) return;
    if (g.wash) g.wash.remove();
    if (g.badge) g.badge.remove();
    entry.groups.delete(target);
  }

  function layoutTile(tile) {
    const entry = tileLayers.get(tile);
    if (!entry) return;
    positionOverlays(tile, [...entry.groups.keys()]);
  }

  function positionOverlays(tile, targets) {
    const entry = tileLayers.get(tile);
    if (!entry) return;
    // Cards hide the overlay layer, so skip the layout reads (most of the extension's cost in profiles).
    if (document.documentElement.classList.contains('thl-restyle') && tile.querySelector('.thl-banner')) return;
    const ar = tile.getBoundingClientRect();
    const ox = ar.left + tile.clientLeft;
    const oy = ar.top + tile.clientTop;
    const tileW = tile.clientWidth;
    for (const target of targets) {
      const g = entry.groups.get(target);
      if (!g) continue;
      const r = target.getBoundingClientRect();
      if (g.wash) {
        g.wash.style.left = (r.left - ox) + 'px';
        g.wash.style.top = (r.top - oy) + 'px';
        g.wash.style.width = r.width + 'px';
        g.wash.style.height = r.height + 'px';
      }
      if (g.badge) {
        const bw = g.badge.offsetWidth || 36;
        const bh = g.badge.offsetHeight || 16;
        let left;
        let top;
        if (g.placement === 'top-right') {
          left = r.left - ox + r.width - bw - 6;
          top = r.top - oy + 6;
        } else {
          const gap = g.kind === 'tag' ? 3 : 4;
          left = r.left - ox + r.width + gap;
          top = r.top - oy + (r.height - bh) / 2;
          if (left + bw > tileW - 2) left = Math.max(2, tileW - bw - 2);
        }
        g.badge.style.left = Math.max(0, left) + 'px';
        g.badge.style.top = Math.max(0, top) + 'px';
      }
    }
  }

  function pruneLayers() {
    for (const [tile, entry] of tileLayers) {
      if (!tile.isConnected) {
        if (resizeObserver) resizeObserver.unobserve(tile);
        entry.layer.remove();
        tileLayers.delete(tile);
        continue;
      }
      for (const [target, g] of entry.groups) {
        if (!target.isConnected) {
          if (g.wash) g.wash.remove();
          if (g.badge) g.badge.remove();
          entry.groups.delete(target);
        }
      }
    }
  }

  function removeAllLayers() {
    for (const [tile, entry] of tileLayers) {
      if (resizeObserver) resizeObserver.unobserve(tile);
      entry.layer.remove();
    }
    tileLayers.clear();
  }

  // ---- Scoring --------------------------------------------------------------

  function scoreValue(value, perKg) {
    if (perKg && settings.mode === 'relative') return scoreRelative(value);
    const b = perKg ? settings.bands.kg : settings.bands.each;
    if (value < b.low) return 'low';
    if (value < b.mid) return 'mid';
    return 'high';
  }

  let relativeThresholds = null;
  function scoreRelative(value) {
    if (!relativeThresholds) {
      const b = settings.bands.kg;
      if (value < b.low) return 'low';
      if (value < b.mid) return 'mid';
      return 'high';
    }
    if (value < relativeThresholds.low) return 'low';
    if (value < relativeThresholds.high) return 'mid';
    return 'high';
  }

  function computeRelativeThresholds(values) {
    if (values.length < 4) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return {
      low: sorted[Math.floor(sorted.length / 3)],
      high: sorted[Math.ceil((sorted.length * 2) / 3) - 1],
    };
  }

  // ---- Ratings --------------------------------------------------------------

  function parseRating(container) {
    const ratedEl = container.querySelector('[aria-label*="out of 5"]') || container;
    const label = ratedEl.getAttribute('aria-label') || '';
    const m = label.match(/(\d+(?:\.\d+)?)\s*out\s*of\s*5/i);
    return m ? parseFloat(m[1]) : null;
  }

  function ratingEmoji(r) {
    if (r >= 4) return '\u2705';
    if (r >= 3) return '\u26A0\uFE0F';
    return '\u274C';
  }

  function applyRatings() {
    if (!settings.ratingIcons) {
      document.querySelectorAll('.thl-rating').forEach((el) => el.remove());
      return;
    }
    document.querySelectorAll(RATING_SEL).forEach((container) => {
      const existing = container.querySelector('.thl-rating');
      const rating = parseRating(container);
      if (rating === null) {
        if (existing) existing.remove();
        return;
      }
      let icon = existing;
      if (!icon) {
        icon = document.createElement('span');
        icon.className = 'thl-rating';
        container.appendChild(icon);
      }
      icon.textContent = ratingEmoji(rating);
      icon.setAttribute('title', rating.toFixed(1) + ' out of 5 stars');
    });
  }

  // ---- Scan -----------------------------------------------------------------

  function scan() {
    if (!settings.enabled) {
      removeAllLayers();
      clearCards();
      applyTileRestyle();
      document.querySelectorAll('.thl-rating').forEach((el) => el.remove());
      return;
    }

    const priceEls = Array.from(document.querySelectorAll(PRICE_SEL));
    if (!priceEls.length && !document.querySelector(TITLE_SEL)) {
      applyTileRestyle(); // pages without tiles (homepage) still get declutter
      return;
    }

    const perKgValues = [];
    if (settings.mode === 'relative') {
      for (const p of priceEls) {
        const unit = p.parentElement && p.parentElement.querySelector(UNIT_SEL);
        const parsed = parseUnitPrice(unit && unit.textContent);
        if (parsed && parsed.perKg !== null) perKgValues.push(parsed.perKg);
      }
    }
    relativeThresholds = settings.mode === 'relative' ? computeRelativeThresholds(perKgValues) : null;

    const touched = new Map(); // tile -> Set of targets laid out this scan
    const scoredTiles = new Map(); // tile -> { price: group }
    const touchedGroups = new Set();
    const cards = new Map(); // tile -> { priceEl, price, unit, score, cc }

    for (const priceEl of priceEls) {
      const tile = tileRoot(priceEl);
      if (!tile) continue;

      const parent = priceEl.parentElement;
      const unitEl = parent ? parent.querySelector(UNIT_SEL) : null;
      const unitParsed = parseUnitPrice(unitEl && unitEl.textContent);
      const rawPrice = parsePrice(priceEl.textContent);

      let score = null;
      if (unitParsed && unitParsed.perKg !== null) {
        score = scoreValue(unitParsed.perKg, true);
      } else if (unitParsed && rawPrice !== null) {
        score = scoreValue(rawPrice, false);
      } else if (rawPrice !== null) {
        score = scoreValue(rawPrice, false);
      }

      if (!cards.has(tile)) {
        const unitText = unitEl ? unitEl.textContent.trim() : '';
        cards.set(tile, { priceEl, price: rawPrice, unit: unitParsed, unitText, score, cc: null });
      }

      const g = groupFor(tile, priceEl);
      if (score) {
        setWash(g, 'thl-' + score);
        setBadge(g, SCORE_LABELS[score], SCORE_BADGES[score], 'right', 'tag');
      } else {
        clearGroup(tile, priceEl);
      }
      touchedGroups.add(g);
      if (!touched.has(tile)) touched.set(tile, new Set());
      touched.get(tile).add(priceEl);

      if (unitEl) {
        const ug = groupFor(tile, unitEl);
        if (score) {
          setWash(ug, 'thl-' + score);
        } else {
          clearGroup(tile, unitEl);
        }
        touchedGroups.add(ug);
        touched.get(tile).add(unitEl);
      }
    }

    // Clubcard / promotion bars
    const bars = Array.from(document.querySelectorAll(VBAR_SEL));
    const clubcardTiles = new Set();

    for (const bar of bars) {
      const textEl = bar.querySelector(VBAR_TEXT_SEL);
      const subEl = bar.querySelector(VBAR_SUB_SEL);
      if (!textEl) continue;
      const text = textEl.textContent.trim();
      const isClubcard = /clubcard/i.test(text);
      const barPrice = parsePrice(text);
      const unitParsed = parseUnitPrice(subEl && subEl.textContent);

      let score = null;
      if (unitParsed && unitParsed.perKg !== null) {
        score = scoreValue(unitParsed.perKg, true);
      } else if (unitParsed && barPrice !== null) {
        score = scoreValue(barPrice, false);
      } else if (barPrice !== null) {
        score = scoreValue(barPrice, false);
      }

      const tile = tileRoot(bar);
      if (tile) {
        if (score && isClubcard) {
          const g = groupFor(tile, bar);
          setBadge(g, 'CC ' + SCORE_LABELS[score], SCORE_BADGES[score], 'top-right');
          touchedGroups.add(g);
          if (!touched.has(tile)) touched.set(tile, new Set());
          touched.get(tile).add(bar);
        }
        if (isClubcard) clubcardTiles.add(tile);
        if (isClubcard && cards.has(tile)) {
          const deal = text.replace(/\s*clubcard price\s*/i, ' ').trim();
          const termsEl = bar.querySelector(VBAR_TERMS_SEL);
          cards.get(tile).cc = {
            score,
            text: 'Clubcard ' + deal,
            price: barPrice,
            unitText: subEl ? subEl.textContent.trim().replace(/^\((.*)\)$/, '$1') : '',
            dates: formatOfferDates(termsEl && termsEl.textContent),
          };
        }
      }
    }

    // Regular price on a tile that has a Clubcard price: flag it.
    if (settings.flagRegularOnClubcard) {
      for (const priceEl of priceEls) {
        const tile = tileRoot(priceEl);
        if (!tile || !clubcardTiles.has(tile)) continue;
        const parent = priceEl.parentElement;
        const unitEl = parent ? parent.querySelector(UNIT_SEL) : null;
        const g = groupFor(tile, priceEl);
        setWash(g, 'thl-high');
        setBadge(g, 'CC deal available', 'thl-badge-high', 'right');
        touchedGroups.add(g);
        if (!touched.has(tile)) touched.set(tile, new Set());
        touched.get(tile).add(priceEl);
        if (unitEl) {
          const ug = groupFor(tile, unitEl);
          setWash(ug, 'thl-high');
          touchedGroups.add(ug);
          touched.get(tile).add(unitEl);
        }
      }
    }

    // Drop groups for tiles that were not part of this scan.
    pruneLayers();
    for (const [tile, entry] of tileLayers) {
      for (const [target, g] of [...entry.groups]) {
        if (!touchedGroups.has(g)) clearGroup(tile, target);
      }
    }

    // Lay out overlays for every touched tile.
    for (const tile of touched.keys()) layoutTile(tile);

    // Tiles with no price (out of stock, unavailable) still get a card.
    for (const titleEl of document.querySelectorAll(TITLE_SEL)) {
      const tile = tileRoot(titleEl);
      if (!tile || tile.tagName !== 'LI' || cards.has(tile)) continue;
      const statusEl = tile.querySelector(STATUS_SEL);
      const status = statusEl ? statusEl.textContent.trim() : 'Unavailable';
      cards.set(tile, { priceEl: null, price: null, unit: null, unitText: '', score: null, cc: null, status });
    }

    applyTileRestyle();
    if (settings.restyleTiles) {
      for (const [tile, info] of cards) renderCard(tile, info);
    } else {
      clearCards();
    }

    applyRatings();
  }

  let debounceTimer = null;
  function debouncedScan() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scan, 350);
  }

  function start() {
    loadSettings();
    const observer = new MutationObserver(debouncedScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    if (storage && storage.onChanged) {
      storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.settings) {
          settings = deepMerge(DEFAULT_SETTINGS, changes.settings.newValue);
          scan();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
