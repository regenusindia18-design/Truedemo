// Loophole probe: drives the real pages in headless Chromium and reports each
// known loophole as OPEN (still exploitable in the demo) or closed.
// See LOOPHOLES.md for what each ID means and the suggested fix.
//
// Run (not part of CI, needs Playwright):
//   npm i --no-save playwright && npx playwright install chromium
//   python3 -m http.server 8765 &
//   node tests/loophole-probe.js            # or BASE=https://…/Truedemo/ node tests/loophole-probe.js
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8765/';
const R = [];
const rec = (id, open, detail) => { R.push({ id, open, detail }); console.log(open ? 'OPEN  ' : 'closed', id, '—', detail); };
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext(); const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  pg.on('dialog', (d) => d.accept());

  // M1 member can close their own binary week repeatedly
  await pg.goto(B + 'dashboard.html'); await pg.waitForTimeout(300);
  const w0 = await pg.evaluate(() => TS.state.wallets.payout);
  for (let i = 0; i < 5; i++) { await pg.click('[data-add="L"]'); await pg.click('[data-add="R"]'); await pg.click('#closeWeek'); await pg.waitForTimeout(80); await pg.keyboard.press('Escape'); }
  const w1 = await pg.evaluate(() => ({ p: TS.state.wallets.payout, wk: TS.state.binary.week }));
  rec('M1 member-run closing + fake team BV', w1.p > w0, `5 clicks: payout ₹${w0} → ₹${w1.p}, week 47 → ${w1.wk}`);

  // M2 bank "penny drop" accepts blanks
  await pg.click('#withdraw'); await pg.waitForTimeout(150);
  const hasVerify = await pg.locator('#verify').count();
  if (hasVerify) { await pg.click('#verify'); await pg.waitForTimeout(100); }
  const bank = await pg.evaluate(() => TS.state.member.kyc.bank);
  rec('M2 bank verification with empty account/IFSC', bank, `account and IFSC left blank → bank verified = ${bank}`);

  // M3 withdrawal is instant, never reaches admin queue
  const wdBefore = await pg.evaluate(() => AdminDB.db.withdrawals.length);
  await pg.click('#withdraw'); await pg.waitForTimeout(150); await pg.click('#wd'); await pg.waitForTimeout(150);
  const wd = await pg.evaluate(() => ({ p: TS.state.wallets.payout, n: AdminDB.db.withdrawals.length }));
  rec('M3 withdrawal bypasses admin approval', wd.n === wdBefore && wd.p === 0, `payout wallet emptied to ₹${wd.p}; admin withdrawal queue ${wdBefore} → ${wd.n}`);

  // M4 TrueSteps sync unlimited
  for (let i = 0; i < 40; i++) await pg.click('#syncSteps');
  const steps = await pg.evaluate(() => TS.state.steps.today);
  rec('M4 unlimited pedometer sync', steps > 50000, `40 taps → ${steps.toLocaleString('en-IN')} steps today = ${Math.floor(steps / 5000) * 10} points claimable`);

  // M5 client-side cart tampering (price)
  await pg.goto(B + 'shop.html'); await pg.waitForTimeout(300);
  await pg.click('[data-add="h3"]');
  await pg.evaluate(() => { TS.state.cart[0].dp = 1; TS.state.cart[0].mrp = 1; TS.save(); });
  await pg.reload(); await pg.waitForTimeout(300);
  await pg.click('#checkout'); await pg.click('#pay'); await pg.waitForTimeout(200);
  const tam = await pg.evaluate(() => { const o = AdminDB.db.orders[0]; return { paid: o.paid, bv: o.bv }; });
  rec('M5 cart price trusted from the browser', tam.paid < 10, `Plant Protein (DP ₹1,899) ordered for ₹${tam.paid}`);

  // M6 stale cart price after admin price change
  await pg.click('[data-add="h1"]');
  await pg.evaluate(() => { const ov = { h1: { mrp: 1499, dp: 1199 } }; localStorage.setItem('trueshop-product-overrides', JSON.stringify(ov)); });
  await pg.reload(); await pg.waitForTimeout(300);
  const cartDp = await pg.evaluate(() => ({ cart: TS.state.cart[0].dp, live: window.TS_PRODUCTS.find((p) => p.id === 'h1').dp }));
  rec('M6 cart keeps the price from when it was added', cartDp.cart !== cartDp.live, `cart DP ₹${cartDp.cart} vs current DP ₹${cartDp.live}`);
  await pg.evaluate(() => { TS.state.cart = []; TS.save(); localStorage.removeItem('trueshop-product-overrides'); });

  // M7 token redemption keeps rewards alive forever (by design)
  const tok = await pg.evaluate(() => { const P = TrueShopPlan, a = P.newRewards(), D = P.DAY_MS, t0 = Date.now(); P.creditReward(a, 'points', 500, t0, 'x'); for (let k = 1; k <= 6; k++) P.redeemRewards(a, 1, t0 + k * 59 * D, 'o', 'O' + k); return P.rewardBalance(a, t0 + 354 * D).points; });
  rec('M7 ₹1 redemption every 59 days keeps all rewards alive', tok > 0, `500 pts credited, 6×1 pt redeemed → ${tok} pts still valid after 354 days`);

  // M8 rewards laundering through cancel
  const laund = await pg.evaluate(() => { const P = TrueShopPlan, a = P.newRewards(), D = P.DAY_MS, t0 = Date.now(); P.creditReward(a, 'points', 100, t0, 'x'); P.redeemRewards(a, 100, t0 + 59 * D, 'o', 'X'); P.reverseRedemption(a, 'X', t0 + 59 * D + 1000); return P.rewardBalance(a, t0 + 61 * D).points; });
  rec('M8 order-then-cancel to reset the rewards clock', laund > 0, `after cancel, balance on day 61 = ${laund}`);

  // M9 order BV credited before escrow
  await pg.click('[data-add="p1"]'); await pg.click('#checkout'); await pg.click('#pay'); await pg.waitForTimeout(150);
  const esc = await pg.evaluate(() => { const A = AdminDB, o = A.db.orders[0]; return { credited: !!o.bvCredited, legL: TS.state.binary.pendingLeft }; });
  rec('M9 shop BV/cashback credited before escrow', esc.credited, `new order bvCredited=${esc.credited}`);

  // M10 blocked member still orders and earns BV
  await pg.evaluate(() => { const A = AdminDB; A.db.members[A.linkedIdx()].status = 'blocked'; A.save(); });
  await pg.reload(); await pg.waitForTimeout(300);
  await pg.click('[data-add="p2"]'); await pg.click('#checkout'); await pg.click('#pay'); await pg.waitForTimeout(150);
  const blk = await pg.evaluate(() => {
    const A = AdminDB, m = A.db.members[A.linkedIdx()], placed = A.db.orders[0].mi === m.idx && A.db.orders[0].items[0].pid === 'p2';
    const o = A.db.orders.find((x) => x.mi === m.idx && x.status === 'Pending_Escrow'); let credited = false;
    if (o) { while (A.stageOf(o) !== 'delivered') A.advance(A.db, o); try { A.confirm(A.db, o, Date.now(), 'probe'); credited = o.bvCredited; } catch (e) {} }
    return { placed, credited };
  });
  rec('M10 blocked member still orders and earns BV', blk.placed || blk.credited, `new order placed = ${blk.placed}, escrow BV credited = ${blk.credited}`);
  await pg.evaluate(() => { const A = AdminDB; A.db.members[A.linkedIdx()].status = 'active'; A.save(); });

  // ADMIN
  await pg.goto(B + 'admin.html'); await pg.click('#loginForm button'); await pg.waitForTimeout(200);
  // A1 forged admin session
  const c2 = await br.newContext(); const p2 = await c2.newPage();
  await p2.goto(B + 'admin.html'); await p2.evaluate(() => sessionStorage.setItem('trueshop-admin-session', '1')); await p2.reload(); await p2.waitForTimeout(300);
  rec('A1 admin sign-in is a browser flag', !(await p2.locator('#app').isHidden()), 'setting sessionStorage trueshop-admin-session=1 opens the admin panel');

  // A2 CTO pools can be distributed twice in a month
  await pg.goto(B + 'admin.html#ranks'); await pg.waitForTimeout(300);
  const cto0 = await pg.evaluate(() => AdminDB.db.members.reduce((a, m) => a + m.earned.cto, 0));
  await pg.click('#ctoGo'); await pg.waitForTimeout(200); await pg.click('#ctoGo'); await pg.waitForTimeout(200);
  const cto = await pg.evaluate(() => ({ total: AdminDB.db.members.reduce((a, m) => a + m.earned.cto, 0), runs: AdminDB.db.ctoRuns.length }));
  rec('A2 CTO pools paid twice in the same month', cto.runs >= 2, `2 clicks → ${cto.runs} distributions, ₹${Math.round(cto.total - cto0).toLocaleString('en-IN')} paid`);

  // A3 withdrawal approval vs wallet balance / blocked
  const wdp = await pg.evaluate(() => { const d = AdminDB.db; const w = d.withdrawals.find((x) => x.status === 'pending' && d.members[x.mi].kyc === 'verified'); const m = d.members[w.mi]; return { id: w.id, amount: w.amount, wallet: m.wallet.payout }; });
  rec('A3 withdrawal not checked against wallet balance', wdp && wdp.amount > wdp.wallet, wdp ? `${wdp.id}: ₹${wdp.amount} requested vs ₹${wdp.wallet} in wallet; approve is allowed and nothing is deducted` : 'n/a');
  const blkWd = await pg.evaluate(() => { const d = AdminDB.db; const w = d.withdrawals.find((x) => x.status === 'pending' && d.members[x.mi].kyc === 'verified'); d.members[w.mi].status = 'blocked'; return w.id; });
  await pg.goto(B + 'admin.html#withdrawals'); await pg.waitForTimeout(250);
  const blkBtn = await pg.locator(`[data-ap="${blkWd}"]`).isEnabled();
  rec('A4 blocked member withdrawal can be approved', blkBtn, `${blkWd} approve button enabled for a blocked member`);
  await pg.evaluate((id) => { const d = AdminDB.db; d.members[d.withdrawals.find((x) => x.id === id).mi].status = 'active'; }, blkWd);

  // A5 Add Member: package BV counts in payout run without an order; duplicate phone allowed
  await pg.goto(B + 'admin.html#add-member'); await pg.waitForTimeout(200);
  for (let k = 0; k < 2; k++) { await pg.goto(B + 'admin.html#add-member'); await pg.waitForTimeout(150); await pg.fill('#amName', 'Probe Dup'); await pg.fill('#amCity', 'Pune'); await pg.fill('#amPhone', '9876543210'); await pg.selectOption('#amPkg', 'vip'); await pg.click('#amForm button'); await pg.waitForTimeout(150); }
  const am = await pg.evaluate(() => { const d = AdminDB.db; const xs = d.members.filter((m) => m.name === 'Probe Dup'); return { n: xs.length, orders: d.orders.filter((o) => xs.some((m) => m.idx === o.mi)).length }; });
  await pg.goto(B + 'admin.html#payout'); await pg.waitForTimeout(250);
  const cyc = await pg.textContent('.kpi-grid');
  rec('A5 Add Member: same mobile twice, package BV paid with no order', am.n === 2 && am.orders === 0, `${am.n} IDs with one mobile, ${am.orders} orders; payout run counts them: ${cyc.replace(/\s+/g, ' ').slice(0, 70)}`);

  // A6 POS: any member code gets the BV, no OTP
  rec('A6 POS credits BV to any member code', true, 'cashier types any active code (e.g. their own) and the walk-in sale BV goes to it; there is no OTP or customer confirmation');

  // A7 Plan settings outside the cap formula
  await pg.goto(B + 'admin.html#settings'); await pg.waitForTimeout(250);
  await pg.fill('[data-bv="lifestyle"]', '100'); await pg.fill('[data-cap="starter"]', '99999999'); await pg.dispatchEvent('[data-bv="lifestyle"]', 'input');
  const can = await pg.locator('#stSave').isEnabled();
  rec('A7 BV ratio 100% and unlimited weekly cap are accepted', can, 'Save stays enabled: the cap check only covers commission rates');

  // A8 Release early is a single-admin action
  rec('A8 early escrow release by one admin', true, 'now needs a written reason and is logged, but there is no second approver (maker-checker)');

  // A9 audit log can be wiped
  await pg.goto(B + 'admin.html#audit'); await pg.waitForTimeout(200);
  rec('A9 audit log is editable and resettable', true, 'stored in localStorage; "Reset demo dataset" deletes it');

  // A10 staff "view as" can be escalated
  const esc2 = await pg.evaluate(() => { ClinicDB.setActor(ClinicDB.db.staff.find((s) => s.role === 'cashier').id); sessionStorage.setItem('trueshop-admin-actor', 'U1'); return ClinicDB.actor().role; });
  rec('A10 acting role is a browser value', esc2 === 'super_admin', `a cashier session becomes ${esc2} by editing sessionStorage`);

  // V1 view-as member forged
  const c3 = await br.newContext(); const p3 = await c3.newPage();
  await p3.goto(B + 'dashboard.html'); await p3.evaluate(() => sessionStorage.setItem('trueshop-view-member', 'TS10297')); await p3.reload(); await p3.waitForTimeout(300);
  rec('V1 forged member view-as without admin session', (await p3.textContent('#mName')) !== 'Aarav Deshmukh', `shows ${await p3.textContent('#mName')}`);

  console.log('page errors:', errs);
  console.log(`\n${R.filter((x) => x.open).length} open, ${R.filter((x) => !x.open).length} closed`);
  await br.close();
})();
