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

console.log(`\n${process.exitCode ? 'FAILURES' : 'ALL PASS'}`);
