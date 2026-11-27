// Rewards validity: 60 days, carried forward once used.
// Run: node tests/rewards.test.js
const assert = require('assert');
require('../assets/js/plan.js');
const P = globalThis.TrueShopPlan;
const D = P.DAY_MS, T0 = Date.UTC(2026, 0, 1);
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const acct = () => P.newRewards();

t('validity is 60 days', () => assert.strictEqual(P.REWARDS.validityDays, 60));

t('unused rewards lapse exactly 60 days after credit', () => {
  const a = acct();
  P.creditReward(a, 'points', 100, T0, 'steps');
  assert.strictEqual(P.rewardBalance(a, T0 + 60 * D - 1).points, 100);
  assert.strictEqual(P.rewardBalance(a, T0 + 60 * D).points, 0);
  assert.deepStrictEqual(P.sweepRewards(a, T0 + 60 * D), { points: 100, cashback: 0 });
  assert.strictEqual(a.log[0].type, 'lapsed');
});

t('using rewards once carries the remaining balance forward 60 days from the use', () => {
  const a = acct();
  P.creditReward(a, 'points', 100, T0, 'steps');
  P.creditReward(a, 'cashback', 50, T0 + 5 * D, 'cb');
  P.redeemRewards(a, 10, T0 + 50 * D, 'order', 'O1'); // used once on day 50
  const b = P.rewardBalance(a, T0 + 100 * D); // day 100: past both original dates
  assert.deepStrictEqual(b, { points: 90, cashback: 50 });
  assert.deepStrictEqual(P.rewardBalance(a, T0 + 110 * D), { points: 0, cashback: 0 }); // 60 days after the use
});

t('each further use extends again', () => {
  const a = acct();
  P.creditReward(a, 'points', 100, T0, 'steps');
  P.redeemRewards(a, 1, T0 + 59 * D, 'o', 'O1');
  P.redeemRewards(a, 1, T0 + 118 * D, 'o', 'O2');
  assert.strictEqual(P.rewardBalance(a, T0 + 177 * D).points, 98);
  assert.strictEqual(P.rewardBalance(a, T0 + 178 * D).points, 0);
});

t('a use after a lapse does not revive lapsed rewards', () => {
  const a = acct();
  P.creditReward(a, 'points', 100, T0, 'old');
  P.creditReward(a, 'points', 20, T0 + 65 * D, 'new');
  P.redeemRewards(a, 5, T0 + 70 * D, 'o', 'O1');
  assert.strictEqual(P.rewardBalance(a, T0 + 70 * D).points, 15);
  assert.throws(() => P.redeemRewards(a, 50, T0 + 70 * D, 'o', 'O2'), /Not enough/);
});

t('credits after the last use keep their own 60 days', () => {
  const a = acct();
  P.creditReward(a, 'points', 10, T0, 'a');
  P.redeemRewards(a, 5, T0 + 10 * D, 'o', 'O1');
  P.creditReward(a, 'cashback', 30, T0 + 40 * D, 'b');
  assert.deepStrictEqual(P.rewardBalance(a, T0 + 75 * D), { points: 0, cashback: 30 }); // points: 10+60=70; cashback: 40+60=100
  assert.strictEqual(P.rewardSummary(a, T0 + 75 * D).next.t, T0 + 100 * D);
});

t('redemption takes points first, then cashback, oldest first', () => {
  const a = acct();
  P.creditReward(a, 'cashback', 40, T0, 'cb');
  P.creditReward(a, 'points', 30, T0 + D, 'p1');
  P.creditReward(a, 'points', 30, T0 + 2 * D, 'p2');
  const u = P.redeemRewards(a, 70, T0 + 3 * D, 'o', 'O1');
  assert.deepStrictEqual(u.alloc.map((x) => [x.kind, x.amount]), [['points', 30], ['points', 30], ['cashback', 10]]);
});

t('cancelled order: rewards go back to their original lots and the use no longer carries forward', () => {
  const a = acct();
  P.creditReward(a, 'points', 100, T0, 'steps');
  P.redeemRewards(a, 10, T0 + 55 * D, 'o', 'O1');
  assert.strictEqual(P.reverseRedemption(a, 'O1', T0 + 56 * D), 10);
  assert.strictEqual(P.rewardBalance(a, T0 + 59 * D).points, 100);
  assert.strictEqual(P.rewardBalance(a, T0 + 60 * D).points, 0); // original date, not day 55 + 60
});

t('restored rewards already past their validity lapse at once', () => {
  const a = acct();
  P.creditReward(a, 'points', 100, T0, 'steps');
  P.redeemRewards(a, 100, T0 + 50 * D, 'o', 'O1');
  assert.strictEqual(P.reverseRedemption(a, 'O1', T0 + 70 * D), 100);
  assert.strictEqual(P.rewardBalance(a, T0 + 70 * D).points, 0);
});

t('a redemption can only be reversed once', () => {
  const a = acct();
  P.creditReward(a, 'points', 50, T0, 's');
  P.redeemRewards(a, 20, T0 + D, 'o', 'O1');
  P.reverseRedemption(a, 'O1', T0 + 2 * D);
  assert.strictEqual(P.reverseRedemption(a, 'O1', T0 + 2 * D), 0);
  assert.strictEqual(P.rewardBalance(a, T0 + 2 * D).points, 50);
});

t('zero, negative and unknown-kind credits are ignored', () => {
  const a = acct();
  assert.strictEqual(P.creditReward(a, 'points', 0, T0), null);
  assert.strictEqual(P.creditReward(a, 'points', -5, T0), null);
  assert.strictEqual(P.creditReward(a, 'gold', 5, T0), null);
  assert.strictEqual(P.redeemRewards(a, -5, T0), null);
  assert.strictEqual(a.lots.length, 0);
});

console.log(`\n${n} rewards checks passed`);
