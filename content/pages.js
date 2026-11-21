// Declutter for non-listing pages: a groceries-only homepage and a compact product page.
// The product page is CSS-only (pages.css); the homepage swaps Tesco's promo panels for a department grid.
(function () {
  'use strict';

  // Isle of Man delivery is groceries only, so other departments are left out of the sidebar and homepage.
  const GROCERY = ['Groceries & Essentials', 'Health & Beauty', 'Baby & Toddler', 'Pets'];
  const BROWSE = '/shop/en-GB/browse/';
  const QUICK = [['My Favourites', '/shop/en-GB/favourites'], ['Special Offers', '/shop/en-GB/promotions']];

  const slug = (name) => globalThis.TescoPriceHighlightParse.slugify(name);
  const browseUrl = (names) => BROWSE + names.map(slug).join('/') + '/all';

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function link(text, href, cls) {
    const a = el('a', cls, text);
    a.href = href;
    return a;
  }

  function departmentCard(superName, [dept, aisles]) {
    const card = el('section', 'thl-home-card');
    card.appendChild(el('h2')).appendChild(link(dept, browseUrl([superName, dept])));
    const list = card.appendChild(el('ul'));
    for (const aisle of aisles) {
      const name = Array.isArray(aisle) ? aisle[0] : aisle;
      list.appendChild(el('li')).appendChild(link(name, browseUrl([superName, dept, name])));
    }
    return card;
  }

  function buildHome(tree) {
    const home = el('section', 'thl-home');
    home.setAttribute('aria-label', 'Groceries');
    const top = home.appendChild(el('div', 'thl-home-top'));
    top.appendChild(el('h1', 'thl-home-title', 'Groceries'));
    const quick = top.appendChild(el('nav', 'thl-home-quick'));
    quick.setAttribute('aria-label', 'Shortcuts');
    for (const [text, href] of QUICK) quick.appendChild(link(text, href, 'thl-home-chip'));
    for (const name of GROCERY.slice(1)) quick.appendChild(link(name, browseUrl([name]), 'thl-home-chip'));
    const main = tree.find((s) => s[0] === GROCERY[0]);
    const grid = home.appendChild(el('div', 'thl-home-grid'));
    if (main) for (const dept of main[1]) grid.appendChild(departmentCard(main[0], dept));
    return home;
  }

  function renderHome(on) {
    const wrap = document.querySelector('[data-testid="global-homepage-wrapper"]');
    const existing = document.querySelector('.thl-home');
    const tree = globalThis.THL_DEPARTMENTS;
    if (!on || !wrap || !Array.isArray(tree)) {
      if (existing) existing.remove();
      return;
    }
    if (!existing) wrap.parentNode.insertBefore(buildHome(tree), wrap);
  }

  globalThis.THLPages = { GROCERY, render: renderHome };
})();
