(() => {
  'use strict';

  const storage = (typeof browser !== 'undefined' && browser.storage) || chrome.storage;

  const DEFAULTS = {
    enabled: true,
    mode: 'bands',
    bands: { kg: { low: 2.5, mid: 6.0 }, each: { low: 1.0, mid: 3.0 } },
    flagRegularOnClubcard: true,
    ratingIcons: true,
    restyleTiles: true,
    declutter: true,
  };

  const $ = (id) => document.getElementById(id);

  function readForm() {
    return {
      enabled: $('enabled').checked,
      mode: document.querySelector('input[name="mode"]:checked').value,
      bands: {
        kg: { low: num('kgLow'), mid: num('kgMid') },
        each: { low: num('eachLow'), mid: num('eachMid') },
      },
      flagRegularOnClubcard: $('flagRegular').checked,
      ratingIcons: $('ratingIcons').checked,
      restyleTiles: $('restyleTiles').checked,
      declutter: $('declutter').checked,
    };
  }

  function num(id) {
    const v = parseFloat($(id).value);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }

  function writeForm(s) {
    $('enabled').checked = s.enabled;
    document.querySelector(`input[name="mode"][value="${s.mode}"]`).checked = true;
    $('kgLow').value = s.bands.kg.low;
    $('kgMid').value = s.bands.kg.mid;
    $('eachLow').value = s.bands.each.low;
    $('eachMid').value = s.bands.each.mid;
    $('flagRegular').checked = s.flagRegularOnClubcard;
    $('ratingIcons').checked = s.ratingIcons;
    $('restyleTiles').checked = s.restyleTiles;
    $('declutter').checked = s.declutter;
    $('bands').style.display = s.mode === 'bands' ? 'block' : 'none';
  }

  function showSaved() {
    const el = $('saved');
    el.hidden = false;
    clearTimeout(showSaved._t);
    showSaved._t = setTimeout(() => { el.hidden = true; }, 1200);
  }

  async function init() {
    try {
      const got = await storage.local.get('settings');
      writeForm(Object.assign({}, DEFAULTS, got.settings));
    } catch {
      writeForm(DEFAULTS);
    }

    const save = () => {
      const settings = readForm();
      storage.local.set({ settings });
      showSaved();
    };

    for (const id of ['enabled', 'flagRegular', 'ratingIcons', 'restyleTiles', 'declutter']) {
      $(id).addEventListener('change', save);
    }
    document.querySelectorAll('input[name="mode"]').forEach((r) =>
      r.addEventListener('change', () => { writeForm(readForm()); save(); })
    );
    for (const id of ['kgLow', 'kgMid', 'eachLow', 'eachMid']) {
      $(id).addEventListener('change', save);
    }
  }

  init();
})();
