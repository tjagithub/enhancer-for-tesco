// Filter bar (declutter): chips + multi-select dropdowns that drive Tesco's own hidden filter panel.
// Every control clicks the matching Tesco input, so Tesco builds the route (facetsArgs) itself.
(function () {
  'use strict';

  const PANEL = '[aria-label="side panel filter"]';
  const COUNT_RE = /^(.*?)\s*\((\d[\d,]*)\)\s*$/;
  const ui = { open: null, query: '' };
  let lastSig = '';

  function labelOf(input) {
    const box = input.closest('[class*="with-label__container"]');
    const label = box && box.querySelector('label');
    const text = (label ? label.textContent : '').replace(/\s+/g, ' ').trim();
    const m = text.match(COUNT_RE);
    return m ? { name: m[1], count: m[2] } : { name: text, count: '' };
  }

  const option = (input) => Object.assign({ input, checked: input.checked }, labelOf(input));

  // Model of Tesco's panel: sort radios, top-level toggles (New, Offers) and accordion groups.
  function readPanel() {
    const panel = document.querySelector(PANEL);
    if (!panel) return null;
    const sort = [...panel.querySelectorAll('input[name="sortBy"]')].map(option);
    const toggles = [...panel.querySelectorAll('input[type="checkbox"]')]
      .filter((i) => !i.closest('[data-testid="accordion-panel"]'))
      .map(option);
    const groups = [...panel.querySelectorAll('[data-testid="accordion-control"]')].map((btn) => {
      const body = document.getElementById(btn.getAttribute('aria-controls'));
      const heading = btn.querySelector('h3');
      return {
        title: (heading || btn).textContent.replace(/\s+/g, ' ').trim(),
        options: body ? [...body.querySelectorAll('input[type="checkbox"]')].map(option) : [],
        more: body ? body.querySelector('button[id^="show-more"]') : null,
      };
    }).filter((g) => g.options.length);
    return { panel, sort, toggles, groups };
  }

  function signature(model) {
    const o = (x) => x.name + '|' + x.count + '|' + (x.checked ? 1 : 0);
    return JSON.stringify([model.sort.map(o), model.toggles.map(o), model.groups.map((g) => [g.title, !!g.more, g.options.map(o)])]);
  }

  // Click Tesco's input; if the route did not change, press the panel's "Done" as Tesco's UI would.
  function apply(model, input) {
    const before = location.href;
    input.click();
    setTimeout(() => {
      if (location.href !== before) return;
      const done = [...model.panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Done');
      if (done) done.click();
    }, 600);
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function countEl(count) {
    return el('span', 'thl-count', count);
  }

  function dropdown(model, title, options, single, more) {
    const d = el('details', 'thl-dd');
    d.dataset.title = title;
    const picked = options.filter((o) => o.checked);
    const summary = d.appendChild(el('summary'));
    summary.textContent = single ? title + ': ' + (picked[0] ? picked[0].name : '') : title;
    if (!single && picked.length) {
      summary.classList.add('thl-dd-on');
      summary.appendChild(countEl(String(picked.length)));
    }
    const menu = d.appendChild(el('div', 'thl-dd-menu'));
    let search = null;
    if (!single && (options.length > 8 || more)) {
      search = menu.appendChild(el('input', 'thl-dd-search'));
      search.type = 'search';
      search.placeholder = 'Search ' + title.toLowerCase();
      search.addEventListener('input', () => {
        ui.query = search.value;
        filterItems(menu, search.value);
      });
    }
    for (const o of options) {
      const item = menu.appendChild(el('label', 'thl-dd-item'));
      const box = item.appendChild(el('input'));
      box.type = single ? 'radio' : 'checkbox';
      if (single) box.name = 'thl-sort';
      box.checked = o.checked;
      box.addEventListener('change', () => apply(model, o.input));
      item.appendChild(el('span', 'thl-dd-name', o.name));
      if (o.count) item.appendChild(countEl(o.count));
    }
    d.addEventListener('toggle', () => {
      if (!d.open) {
        if (ui.open === title) ui.open = null;
        return;
      }
      ui.open = title;
      document.querySelectorAll('.thl-dd[open]').forEach((x) => { if (x !== d) x.open = false; });
      // Tesco's "More …" opens its own full-screen chip view, so it is not pressed here (see fixtures).
      if (search) search.focus();
    });
    if (ui.open === title) {
      d.open = true;
      if (search && ui.query) {
        search.value = ui.query;
        filterItems(menu, ui.query);
      }
    }
    return d;
  }

  function filterItems(menu, query) {
    const q = query.trim().toLowerCase();
    menu.querySelectorAll('.thl-dd-item').forEach((item) => {
      item.hidden = !!q && !item.textContent.toLowerCase().includes(q);
    });
  }

  function clearUrl() {
    const u = new URL(location.href);
    u.searchParams.delete('facetsArgs');
    return u.pathname + u.search;
  }

  function build(model) {
    const bar = el('div', 'thl-filters');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Filters');
    const row = bar.appendChild(el('div', 'thl-filters-row'));
    if (model.sort.length) row.appendChild(dropdown(model, 'Sort', model.sort, true, null));
    for (const t of model.toggles) {
      const chip = row.appendChild(el('button', 'thl-fchip', t.name));
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(t.checked));
      if (t.count) chip.appendChild(countEl(t.count));
      chip.addEventListener('click', () => apply(model, t.input));
    }
    for (const g of model.groups) row.appendChild(dropdown(model, g.title, g.options, false, g.more));

    const active = model.groups.flatMap((g) => g.options).concat(model.toggles).filter((o) => o.checked);
    if (active.length) {
      const strip = bar.appendChild(el('div', 'thl-filters-active'));
      for (const o of active) {
        const x = strip.appendChild(el('button', 'thl-fchip-x', o.name + ' ✕'));
        x.type = 'button';
        x.setAttribute('aria-label', 'Remove filter ' + o.name);
        x.addEventListener('click', () => apply(model, o.input));
      }
      const clear = strip.appendChild(el('a', 'thl-filters-clear', 'Clear all'));
      clear.href = clearUrl();
    }
    return bar;
  }

  function render(on) {
    const header = document.querySelector('[data-testid="product-list-header"]');
    const bar = document.querySelector('.thl-filters');
    const model = on && header ? readPanel() : null;
    if (!model) {
      if (bar) bar.remove();
      lastSig = '';
      return;
    }
    const sig = signature(model);
    if (bar && sig === lastSig) return;
    lastSig = sig;
    const next = build(model);
    if (bar) bar.replaceWith(next);
    else header.insertBefore(next, header.firstChild);
  }

  // Close dropdowns on a real outside click or Escape (our proxied clicks into Tesco's panel are synthetic).
  document.addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    document.querySelectorAll('.thl-dd[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.thl-dd[open]').forEach((d) => { d.open = false; });
  });

  globalThis.THLFilters = { render, readPanel };
})();
