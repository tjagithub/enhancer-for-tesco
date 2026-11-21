const path = require('path');
const assert = require('assert');
const P = require(path.join(__dirname, '..', 'content', 'parse.js'));

let n = 0;
function check(actual, expected, msg) {
  n++;
  try {
    assert.deepStrictEqual(actual, expected);
    console.log('  ok:', msg);
  } catch (e) {
    console.error('  FAIL:', msg, '=> got', JSON.stringify(actual), 'expected', JSON.stringify(expected));
    process.exitCode = 1;
  }
}

console.log('== slugify ==');
check(P.slugify('Groceries & Essentials'), 'groceries-and-essentials', 'ampersand');
check(P.slugify('Ice Cream & Lollies'), 'ice-cream-and-lollies', 'ice cream aisle (live URL)');
check(P.slugify('Chilled Vegetarian & Vegan'), 'chilled-vegetarian-and-vegan', 'veg aisle (live URL)');
check(P.slugify('Mix and Match Meals 3 for £8'), 'mix-and-match-meals-3-for-pound8', 'pound sign (live URL)');
check(P.slugify("Men's Shampoo"), 'mens-shampoo', 'apostrophe dropped');
check(P.slugify('Nestlé cereals'), 'nestle-cereals', 'accent folded');

console.log('== parsePrice ==');
check(P.parsePrice('£4.00'), 4, 'pound 2dp');
check(P.parsePrice('£10'), 10, 'pound no dp');
check(P.parsePrice('49p'), 0.49, 'pence');
check(P.parsePrice('99p Clubcard Price'), 0.99, 'pence with text');
check(P.parsePrice('Any 3 for £3.50 Clubcard Price - Selected Tesco Ambient Juice'), 3.5, 'multi-buy first price');
check(P.parsePrice('£0.16'), 0.16, 'sub pound');
check(P.parsePrice('nope'), null, 'no match');
check(P.parsePrice(null), null, 'null');

console.log('== parseUnitPrice ==');
check(P.parseUnitPrice('£3.92/kg'), { price: 3.92, unit: 'kg', perKg: 3.92 }, 'kg');
check(P.parseUnitPrice('(£2.94/kg)'), { price: 2.94, unit: 'kg', perKg: 2.94 }, 'parenthesised kg');
check(P.parseUnitPrice('£1.06/litre'), { price: 1.06, unit: 'litre', perKg: 1.06 }, 'litre');
check(P.parseUnitPrice('£0.99/each'), { price: 0.99, unit: 'each', perKg: null }, 'each null perKg');
check(P.parseUnitPrice('£12.00/kg'), { price: 12, unit: 'kg', perKg: 12 }, 'kg no fraction');
check(P.parseUnitPrice('49p/each'), { price: 0.49, unit: 'each', perKg: null }, 'pence per each');
check(P.parseUnitPrice('£3.40/100g'), { price: 3.4, unit: '100g', perKg: 34 }, 'per 100g -> per kg');
check(P.parseUnitPrice('£2.99/litre'), { price: 2.99, unit: 'litre', perKg: 2.99 }, 'litre 2dp');
check(P.parseUnitPrice(null), null, 'null');
check(P.parseUnitPrice('nothing here'), null, 'no match');

console.log('== scoreWithBands ==');
const bands = { kg: { low: 2.5, mid: 6.0 }, each: { low: 1.0, mid: 3.0 } };
check(P.scoreWithBands(0.9, true, bands), 'low', 'kg low');
check(P.scoreWithBands(3.92, true, bands), 'mid', 'kg mid');
check(P.scoreWithBands(41.67, true, bands), 'high', 'kg high');
check(P.scoreWithBands(0.5, false, bands), 'low', 'each low');
check(P.scoreWithBands(2.0, false, bands), 'mid', 'each mid');
check(P.scoreWithBands(9.0, false, bands), 'high', 'each high');

console.log('== parsePackSize / formatPack ==');
const pack = (t) => P.formatPack(P.parsePackSize(t));
check(pack('Haagen-Dazs Belgian Chocolate Mini Cups Ice Cream 4x95ml'), '4 × 95 ml · 380 ml', 'multi no spaces');
check(pack('Twister Mini Pineapple Lollies XL Family Pack 10 x 50ml'), '10 × 50 ml · 500 ml', 'multi spaced');
check(pack('Nestle Fab Strawberry Ice Lollies 6 X 58Ml'), '6 × 58 ml · 348 ml', 'capital X and Ml');
check(pack('Snickers Ice Cream 4 x 50.3 ml'), '4 × 50.3 ml · 201.2 ml', 'decimal each');
check(pack('Ben & Jerry\'s Minter Wonderland Mint Ice Cream 465Ml'), '465 ml', 'single');
check(pack('Carte D\'or Madagascan Vanilla Ice Cream Tub 900ml'), '900 ml', 'single tub');
check(pack('Tesco Semi Skimmed Milk 2.272L'), '2.27 L', 'litres');
check(pack('Mature Cheddar 1kg'), '1 kg', 'kg');
check(pack('Bananas Loose'), '', 'no size');
check(P.formatPack(P.estimatePackSize(5.75, P.parseUnitPrice('£15.13/litre'))), '~380 ml', 'estimated from unit price');
check(P.formatPack(P.estimatePackSize(3.0, P.parseUnitPrice('£6.00/kg'))), '~500 g', 'estimated grams');
check(pack('Tesco Rocket Lollies 8 Pack 464Ml'), '8 × 58 ml · 464 ml', 'N pack with total');
check(P.formatPack(P.estimatePackSize(1.45, P.parseUnitPrice('£0.14/each'), 'Tesco 10 Waffle Cones')), '10 items', 'each count from title');
check(P.formatPack(P.estimatePackSize(1.7, P.parseUnitPrice('£0.08/each'), 'Askeys Crispy Cones')), '~21 items', 'each count estimated');

console.log('== formatOfferDates ==');
check(P.formatOfferDates('Offer valid for delivery from 10/11/2026 until 30/11/2026'), '10 Nov – 30 Nov 2026', 'same year');
check(P.formatOfferDates('Offer valid for delivery from 10/11/2026 until 11/01/2027'), '10 Nov 2026 – 11 Jan 2027', 'across years');
check(P.formatOfferDates('no dates'), null, 'no dates');

console.log('== stripPackSize ==');
check(P.stripPackSize('Tesco Fruity Helter Skelters (5 X 70Ml) 350Ml'), 'Tesco Fruity Helter Skelters', 'parenthesised multi + total');
check(P.stripPackSize('Tesco Rocket Lollies 8 Pack 464Ml'), 'Tesco Rocket Lollies', 'N pack + total');
check(P.stripPackSize('Twister Mini Pineapple Ice Cream Lollies XL Family Pack 10 x 50ml'), 'Twister Mini Pineapple Ice Cream Lollies XL Family Pack', 'keeps words, drops multi');
check(P.stripPackSize('Ms Molly\'s Vanilla Ice Cream 2Ltr'), 'Ms Molly\'s Vanilla Ice Cream', 'litres');
check(P.stripPackSize('Snickers Ice Cream 4 x 50.3 ml'), 'Snickers Ice Cream', 'decimal multi');
check(P.stripPackSize('Tesco 10 Waffle Cones'), 'Tesco 10 Waffle Cones', 'count without unit kept');
check(P.stripPackSize('250ml'), '250ml', 'never empties a title');

// Real titles from Tesco's product API: parsed size must match price / unit price.
console.log('== API titles vs implied size ==');
const api = require(path.join(__dirname, 'fixtures', 'ice-cream-api.json'));
for (const { node } of api.flatMap((d) => d.data.category.results)) {
  const unit = String(node.price.unitOfMeasure).split(' ')[0].toLowerCase();
  if (!/^(kg|litre)$/.test(unit)) continue;
  const parsed = P.parsePackSize(node.title);
  const implied = (node.price.actual / node.price.unitPrice) * 1000;
  check(parsed !== null && Math.abs(parsed.total - implied) / implied < 0.1, true, node.title.trim());
  const stripped = P.stripPackSize(node.title);
  check(P.parsePackSize(stripped), null, 'no size left in: ' + stripped);
}

console.log(`\n${process.exitCode ? 'FAILURES' : 'ALL PASS'}`);
