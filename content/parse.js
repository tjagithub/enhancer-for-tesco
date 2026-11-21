(function (global) {
  'use strict';

  const SYMBOL_RE = /[£$€]/;

  function parsePrice(text) {
    if (!text) return null;
    const t = String(text).trim();
    const sym = t.match(/[£$€]\s*(\d+(?:\.\d{1,2})?)/);
    if (sym) return parseFloat(sym[1]);
    const pence = t.match(/(\d+(?:\.\d{1,2})?)p\b/i);
    if (pence) return parseFloat(pence[1]) / 100;
    return null;
  }

  function perKgFactor(unit) {
    switch (String(unit).toLowerCase()) {
      case 'kg': return 1;
      case '100g': return 10;
      case 'g': return 1000;
      case 'litre': case 'l': case 'lt': return 1;
      case '100ml': return 10;
      case 'ml': return 1000;
      default: return null; // each / unit / pack / etc.
    }
  }

  const UNIT_RE = new RegExp(
    '[£$€]\\s*(\\d+(?:\\.\\d{1,2})?)\\s*(?:p\\b)?\\s*\\/\\s*(\\d*?(?:\\.\\d+)?)\\s*([0-9]*[a-zA-Z]+)' +
    '|\\b(\\d+(?:\\.\\d{1,2})?)p\\s*\\/\\s*(\\d*?(?:\\.\\d+)?)\\s*([0-9]*[a-zA-Z]+)',
    'i'
  );

  function parseUnitPrice(text) {
    if (!text) return null;
    const m = String(text).match(UNIT_RE);
    if (!m) return null;
    let price;
    let unit;
    if (m[1] !== undefined && m[1] !== '') {
      price = parseFloat(m[1]);
      unit = m[3];
    } else {
      price = parseFloat(m[4]) / 100;
      unit = m[6];
    }
    const factor = perKgFactor(unit);
    return { price, unit: String(unit).toLowerCase(), perKg: factor === null ? null : price * factor };
  }

  function scoreWithBands(value, perKg, bands) {
    const b = perKg ? bands.kg : bands.each;
    if (value < b.low) return 'low';
    if (value < b.mid) return 'mid';
    return 'high';
  }

  // Pack sizes are written every way in titles: "4x95ml", "6 X 58Ml", "4 x 50.3 ml", "460ml".
  const SIZE_UNITS = { ml: ['ml', 1], cl: ['ml', 10], l: ['ml', 1000], litre: ['ml', 1000], litres: ['ml', 1000], ltr: ['ml', 1000], g: ['g', 1], kg: ['g', 1000] };
  const SIZE_UNIT_RE = '(ml|cl|litres?|ltr|l|kg|g)\\b';
  const MULTI_RE = new RegExp('(\\d+)\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*' + SIZE_UNIT_RE, 'i');
  const SINGLE_RE = new RegExp('(\\d+(?:\\.\\d+)?)\\s*' + SIZE_UNIT_RE, 'gi');
  const PACK_COUNT_RE = /\b(\d+)\s*(?:pack|pk)\b/i;
  const round2 = (n) => Math.round(n * 100) / 100;

  function parsePackSize(text) {
    if (!text) return null;
    const t = String(text);
    let count = 1;
    let size;
    let unit;
    const multi = t.match(MULTI_RE);
    if (multi) {
      count = parseInt(multi[1], 10);
      size = parseFloat(multi[2]);
      unit = multi[3];
    } else {
      const all = [...t.matchAll(SINGLE_RE)];
      if (!all.length) return null;
      const last = all[all.length - 1];
      size = parseFloat(last[1]);
      unit = last[2];
    }
    const [base, factor] = SIZE_UNITS[unit.toLowerCase()];
    const amount = round2(size * factor);
    // "8 Pack 464Ml": the size is the pack total, so split it per item.
    const packCount = !multi && t.match(PACK_COUNT_RE);
    if (packCount && parseInt(packCount[1], 10) > 1) {
      const n = parseInt(packCount[1], 10);
      return { count: n, each: round2(amount / n), base, total: amount, approx: false };
    }
    return { count, each: amount, base, total: round2(count * amount), approx: false };
  }

  // No size in the title: work it back from price / unit price, e.g. £5.75 at £15.13/litre.
  // Per-item prices give a count instead; a matching number in the title makes it exact.
  function estimatePackSize(price, unitParsed, title) {
    if (!price || !unitParsed) return null;
    if (unitParsed.unit === 'each' && unitParsed.price > 0) {
      const implied = price / unitParsed.price;
      const stated = (String(title || '').match(/\b\d+\b/g) || []).map(Number)
        .find((n) => n > 1 && Math.abs(n - implied) / n < 0.15);
      const count = stated || Math.round(implied);
      return count > 1 ? { count, each: null, base: 'each', total: count, approx: !stated } : null;
    }
    if (!unitParsed.perKg) return null;
    const base = /g$/i.test(unitParsed.unit) ? 'g' : 'ml';
    const total = Math.round((price / unitParsed.perKg) * 1000 / 5) * 5;
    return total > 0 ? { count: 1, each: total, base, total, approx: true } : null;
  }

  function formatAmount(value, base) {
    if (value >= 1000) return round2(value / 1000) + (base === 'ml' ? ' L' : ' kg');
    return round2(value) + (base === 'ml' ? ' ml' : ' g');
  }

  function formatPack(pack) {
    if (!pack) return '';
    if (pack.base === 'each') return (pack.approx ? '~' : '') + pack.total + ' items';
    const total = (pack.approx ? '~' : '') + formatAmount(pack.total, pack.base);
    return pack.count > 1 ? pack.count + ' × ' + formatAmount(pack.each, pack.base) + ' · ' + total : total;
  }

  // Title without its size: "Helter Skelters (5 X 70Ml) 350Ml" -> "Helter Skelters".
  const STRIP_RES = [
    new RegExp('\\(?\\s*\\d+\\s*[x×]\\s*\\d+(?:\\.\\d+)?\\s*' + SIZE_UNIT_RE + '\\s*\\)?', 'gi'),
    new RegExp('\\(?\\s*\\b\\d+(?:\\.\\d+)?\\s*' + SIZE_UNIT_RE + '\\s*\\)?', 'gi'),
    /\b\d+\s*(?:pack|pk)\b/gi,
  ];

  function stripPackSize(title) {
    if (!title) return '';
    let t = String(title);
    for (const re of STRIP_RES) t = t.replace(re, ' ');
    const out = t.replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').replace(/[\s,\-–]+$/, '').trim();
    return out || String(title).trim();
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // "Offer valid for delivery from 10/11/2026 until 30/11/2026" -> "10 Nov – 30 Nov 2026".
  function formatOfferDates(text) {
    const m = String(text || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\D+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    const day = (d, mo) => parseInt(d, 10) + ' ' + MONTHS[parseInt(mo, 10) - 1];
    const from = day(m[1], m[2]) + (m[3] === m[6] ? '' : ' ' + m[3]);
    return from + ' – ' + day(m[4], m[5]) + ' ' + m[6];
  }

  // Tesco browse slug: "Ice Cream & Lollies" -> "ice-cream-and-lollies", "3 for £8" -> "3-for-pound8".
  function slugify(name) {
    return String(name || '')
      .normalize('NFD').replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/&/g, ' and ').replace(/£/g, ' pound')
      .replace(/['’®]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .replace(/(^|-)pound-(?=\d)/g, '$1pound');
  }

  const api = { slugify, formatOfferDates, parsePrice, parseUnitPrice, perKgFactor, scoreWithBands, parsePackSize, estimatePackSize, formatPack, stripPackSize };
  global.TescoPriceHighlightParse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
