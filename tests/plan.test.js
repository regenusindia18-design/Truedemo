// Engine checks against figures stated in the TrueShop plan documents.
// Run: node tests/plan.test.js
const assert = require('assert');
require('../assets/js/plan.js');
const P = globalThis.TrueShopPlan;
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('1000L:1000R pays ₹400 (40% of weaker leg)', () => {
  assert.strictEqual(P.binaryClosing({ leftBV: 1000, rightBV: 1000 }).gross, 400);
});
t('power leg carries forward, weaker leg flushes to 0', () => {
  const r = P.binaryClosing({ leftBV: 5000, rightBV: 2000, carryLeft: 1000 });
  assert.deepStrictEqual([r.matched, r.carryLeft, r.carryRight, r.powerLeg], [2000, 4000, 0, 'Left']);
});
t('weekly caps per package', () => {
  assert.strictEqual(P.binaryClosing({ leftBV: 1e6, rightBV: 1e6, packageKey: 'starter' }).paid, 15000);
  assert.strictEqual(P.binaryClosing({ leftBV: 1e6, rightBV: 1e6, packageKey: 'pro' }).paid, 50000);
  assert.strictEqual(P.binaryClosing({ leftBV: 1e6, rightBV: 1e6, packageKey: 'vip' }).paid, 150000);
});
t('category BV on ₹1,000 DP = 650 / 400 / 250', () => {
  assert.deepStrictEqual(['health', 'personal', 'lifestyle'].map((c) => P.productBV(1000, c)), [650, 400, 250]);
});
t('generation levels total 20%', () => {
  assert.strictEqual(Math.round(P.GENERATION_LEVELS.reduce((a, b) => a + b) * 100), 20);
});
t('actual stream outflow totals 70%', () => {
  assert.strictEqual(Math.round(P.INCOME_STREAMS.reduce((a, s) => a + s.actual, 0) * 100), 70);
});
t('XLSX default scenario reproduced', () => {
  const s = P.companySimulation({ joinings: 500, firstOrderDP: 2000, bvRatio: 0.5, repurchaseMembers: 1200, repurchaseDP: 1200 });
  assert.strictEqual(s.totalBV, 1220000);
  assert.deepStrictEqual(s.rows.map((r) => r.payout), [61000, 50000, 100000, 144000, 61000, 122000]);
  assert.strictEqual(s.totalPayout, 538000);
  assert.strictEqual(s.retention, 682000);
});
t('70% hard cap enforced when stress-tested', () => {
  const s = P.companySimulation({ joinings: 500, firstOrderDP: 2000, bvRatio: 0.5, repurchaseMembers: 0, repurchaseDP: 0, rates: { leadership: 0.5 } });
  assert.ok(s.scaled);
  assert.ok(Math.abs(s.payoutRatio - 0.7) < 1e-9);
});
t('TruePoints capped at 10% of bill; BV on net paid', () => {
  const q = P.priceCart([{ mrp: 1500, dp: 1000, category: 'health', qty: 1 }], 500);
  assert.deepStrictEqual([q.pointsUsed, q.netPaid, q.bv], [100, 900, 585]);
});
t('5,000 steps = 10 TruePoints', () => {
  assert.strictEqual(P.stepsToPoints(4999), 0);
  assert.strictEqual(P.stepsToPoints(12000), 20);
});
t('wallet split 90/10 with 5% TDS + 5% admin', () => {
  const s = P.splitCommission(10000);
  assert.deepStrictEqual([s.repurchase, s.tds, s.admin, s.bankNet], [1000, 450, 450, 8100]);
});
t('rank by weaker leg', () => {
  assert.strictEqual(P.rankFor(62400, 54100).current.name, 'Silver Achiever');
  assert.strictEqual(P.rankFor(9999, 1e6).current, null);
});
console.log(`\n${n} checks passed`);
