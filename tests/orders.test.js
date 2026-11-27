// Orders: tracking, 7-day escrow from delivery, BV + cashback credited only on confirmation,
// and the storefront account (TS10248) shared with the admin dataset.
// Run: node tests/orders.test.js
const assert = require('assert');
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
require('../assets/js/plan.js');
require('../assets/js/products.js');
const P = globalThis.TrueShopPlan;
// stand-in for app.js: the storefront member's state
let saves = 0;
globalThis.TS = { state: { member: { id: 'TS10248', name: 'Aarav Deshmukh', package: 'pro', kyc: { pan: true, aadhaar: true, bank: false } }, wallets: { payout: 100, repurchase: 10 }, rewards: P.newRewards(), ledger: [], orders: [] }, save() { saves++; } };
require('../assets/js/admin-data.js');
const A = globalThis.AdminDB, D = A.DAY;
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const d = () => A.db;
const me = () => d().members[A.linkedIdx()];
const prod = (id) => window.TS_PRODUCTS.find((p) => p.id === id);
const quote = (pts = 0) => P.priceCart([{ ...prod('h1'), qty: 2 }], pts, pts);
const T0 = Date.now();
const order = (now = T0, pts = 0) => A.placeOrder(d(), { mi: me().idx, items: [{ pid: 'h1', qty: 2 }], quote: quote(pts), pay: 'UPI', id: 'T' + Math.random().toString(36).slice(2, 8) }, now);
const ship = (o, now) => { while (A.stageOf(o) !== 'delivered') A.advance(d(), o, now); };

t('storefront member is TS10248 in the admin dataset, with the storefront name and KYC', () => {
  assert.strictEqual(me().id, 'TS10248');
  assert.strictEqual(me().name, 'Aarav Deshmukh');
  assert.strictEqual(me().kyc, 'pending'); // bank not verified
});

t('seeded orders have tracking and consistent escrow state', () => {
  d().orders.forEach((o) => {
    assert.ok(o.track && o.track.events[0].stage === 'placed', o.id);
    if (o.status === 'Confirmed') assert.ok(o.deliveredAt && o.bvCredited, o.id);
    if (o.status === 'Pending_Escrow' && o.deliveredAt) assert.ok(T0 < o.escrowEndsAt, o.id);
    if (A.stageIdx(o) >= 2 && o.channel !== 'offline_store') assert.ok(o.track.awb, o.id);
  });
});

t('stages go placed → packed → shipped (AWB) → out for delivery → delivered', () => {
  const o = order();
  assert.deepStrictEqual([1, 2, 3, 4].map(() => A.advance(d(), o, T0)), ['packed', 'shipped', 'out_for_delivery', 'delivered']);
  assert.ok(o.track.awb && o.track.courier);
  assert.throws(() => A.advance(d(), o, T0), /already delivered/);
});

t('escrow starts at delivery, not at order time', () => {
  const o = order(T0);
  ship(o, T0 + 3 * D);
  assert.strictEqual(o.escrowEndsAt, T0 + 3 * D + P.ESCROW_DAYS * D);
});

t('placing an order credits no BV and no cashback', () => {
  const before = { bv: A.orderBV(me()).month, cb: P.rewardBalance(TS.state.rewards).cashback };
  const o = order();
  assert.strictEqual(A.orderBV(me()).month, before.bv);
  assert.strictEqual(P.rewardBalance(TS.state.rewards).cashback, before.cb);
  assert.ok(A.orderBV(me()).escrow >= o.bv);
});

t('BV cannot be released before delivery, and early release needs a reason', () => {
  const o = order();
  assert.throws(() => A.confirm(d(), o, T0), /Not delivered/);
  ship(o, T0);
  assert.throws(() => A.confirm(d(), o, T0 + D), /reason/);
  A.confirm(d(), o, T0 + D, 'customer confirmed');
  assert.strictEqual(o.status, 'Confirmed');
  assert.match(o.track.events.at(-1).note, /early/);
});

t('settle confirms after the window and credits BV + cashback to the storefront account', () => {
  const o = order(T0);
  ship(o, T0);
  A.settle(d(), T0 + 6 * D);
  assert.strictEqual(o.status, 'Pending_Escrow');
  assert.ok(!me().bv.log.some((l) => l.ref === o.id));
  A.settle(d(), T0 + 7 * D);
  assert.strictEqual(o.status, 'Confirmed');
  assert.strictEqual(me().bv.log.filter((l) => l.ref === o.id).map((l) => l.bv).join(), String(o.bv));
  const lot = TS.state.rewards.lots.find((l) => l.ref === o.id);
  assert.ok(lot && lot.kind === 'cashback' && lot.amount === o.cashback && lot.t === T0 + 7 * D);
});

t('confirming twice does not credit twice', () => {
  const o = order(T0); ship(o, T0); A.confirm(d(), o, T0 + 8 * D);
  assert.throws(() => A.confirm(d(), o, T0 + 9 * D), /Confirmed/);
  A.settle(d(), T0 + 30 * D);
  assert.strictEqual(me().bv.log.filter((l) => l.ref === o.id).length, 1);
  assert.strictEqual(TS.state.rewards.lots.filter((l) => l.ref === o.id).length, 1);
});

t('personal month BV starts again from zero in a new month', () => {
  const o = order(T0); ship(o, T0);
  const next = Date.UTC(new Date(T0).getUTCFullYear(), new Date(T0).getUTCMonth() + 2, 1);
  assert.strictEqual(A.orderBV(me(), next).month, 0);
  A.confirm(d(), o, next, 'test');
  assert.strictEqual(A.orderBV(me(), next).month, o.bv);
});

t('blocked member: no new orders, and BV stays in escrow until unblocked', () => {
  const o = order(T0); ship(o, T0);
  me().status = 'blocked';
  assert.throws(() => order(T0), /on hold/);
  assert.throws(() => A.confirm(d(), o, T0 + 8 * D), /blocked/);
  A.settle(d(), T0 + 8 * D);
  assert.strictEqual(o.status, 'Pending_Escrow');
  me().status = 'active';
  A.settle(d(), T0 + 9 * D);
  assert.strictEqual(o.status, 'Confirmed');
});

t('cancel only before shipping; return only after delivery inside 7 days', () => {
  const a = order(); A.advance(d(), a, T0); A.cancel(d(), a, T0);
  assert.strictEqual(a.status, 'Cancelled');
  const b = order(); A.advance(d(), b, T0); A.advance(d(), b, T0);
  assert.throws(() => A.cancel(d(), b, T0), /shipped/);
  assert.throws(() => A.returnOrder(d(), b, T0), /Not delivered/);
  ship(b, T0);
  assert.throws(() => A.returnOrder(d(), b, T0 + 7 * D), /closed/);
  A.returnOrder(d(), b, T0 + 6 * D);
  assert.strictEqual(b.status, 'Returned');
  assert.throws(() => A.confirm(d(), b, T0 + 9 * D), /Returned/);
  assert.strictEqual(b.bvCredited, undefined);
});

t('cancel or return gives redeemed rewards back without refreshing their validity', () => {
  const r = TS.state.rewards;
  P.creditReward(r, 'points', 50, T0 - 59 * D, 'old steps'); // lapses tomorrow
  const before = P.rewardBalance(r, T0).points;
  const o = order(T0, 50);
  P.redeemRewards(r, o.pointsUsed, T0, 'order', o.id);
  A.cancel(d(), o, T0 + 1000);
  assert.strictEqual(P.rewardBalance(r, T0 + 1000).points, before);
  assert.strictEqual(P.rewardBalance(r, T0 + 2 * D).points, before - 50); // the old lot still lapses on its own date
});

t('POS orders are delivered at the counter and use the same escrow', () => {
  const o = A.placeOrder(d(), { mi: me().idx, items: [{ pid: 'p1', qty: 1 }], quote: { netPaid: 229, bv: 91.6, pointsUsed: 0 }, pay: 'Cash', channel: 'offline_store', storeId: 'S1' }, T0);
  assert.strictEqual(A.stageOf(o), 'delivered');
  assert.strictEqual(o.escrowEndsAt, T0 + 7 * D);
  assert.strictEqual(o.cashback, P.round2(91.6 * P.CASHBACK_RATE));
});

t('commission to the storefront member lands in its own wallets and ledger', () => {
  const p0 = TS.state.wallets.payout;
  A.creditWallet(me(), 1000, 'Binary', 'test');
  assert.strictEqual(TS.state.wallets.payout, p0 + 900);
  assert.strictEqual(TS.state.ledger[0].amount, 1000);
  assert.strictEqual(A.wallets(me()).payout, p0 + 900);
});

t('admin KYC approval verifies the storefront account', () => {
  A.setKyc(me(), 'verified');
  assert.ok(TS.state.member.kyc.bank);
});

t('v2 data migrates: tracking added, old storefront orders moved in without double credit', () => {
  const v2 = A.generate(); // raw v2 shape
  TS.state.orders = [{ id: 'ORDOLD01', t: T0 - 2 * D, items: [{ name: prod('h2').name, qty: 1, emoji: '💊' }], paid: 799, bv: 519.35, cashback: 25.97, status: 'Pending_Escrow' }];
  const m = A.migrate(v2, T0);
  const o = m.orders.find((x) => x.id === 'ORDOLD01');
  assert.ok(o && o.track && o.bvCredited && o.cashbackCredited && o.items[0].pid === 'h2');
  assert.strictEqual(TS.state.orders.length, 0);
  assert.strictEqual(m.v, 3);
});

console.log(`\n${n} order checks passed`);
