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

  const api = { parsePrice, parseUnitPrice, perKgFactor, scoreWithBands };
  global.TescoPriceHighlightParse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
