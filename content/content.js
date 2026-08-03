(() => {
  'use strict';

  const P = globalThis.TescoPriceHighlightParse;
  const parsePrice = P.parsePrice;
  const parseUnitPrice = P.parseUnitPrice;

  const PRICE_SEL = '[class*="online-components-product-tile-price__text"]';
  const UNIT_SEL = '[class*="online-components-product-tile-unit-price__subtext"]';
  const VBAR_SEL = 'a[class*="ddsweb-value-bar__container"]';
  const VBAR_TEXT_SEL = '[class*="ddsweb-value-bar__content-text"]';
  const VBAR_SUB_SEL = '[class*="ddsweb-value-bar__content-subtext"]';
  const RATING_SEL = '[data-testid="star-rating"]';

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
      document.querySelectorAll('.thl-rating').forEach((el) => el.remove());
      return;
    }

    const priceEls = Array.from(document.querySelectorAll(PRICE_SEL));
    if (!priceEls.length) return;

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
