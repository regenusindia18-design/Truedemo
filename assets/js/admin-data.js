/* =========================================================================
 * Admin demo dataset: deterministic (seeded) members, binary placement,
 * orders, withdrawals, tickets. Persisted in localStorage so admin actions
 * survive reloads. Replace with API calls when a backend exists.
 * ========================================================================= */
(function (root) {
  'use strict';
  const P = root.TrueShopPlan;
  const KEY = 'trueshop-admin-v1';
  const DAY = 86400000;

  function rng(seed) { // mulberry32
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const FIRST = ['Aarav', 'Priya', 'Rohan', 'Sneha', 'Vikram', 'Anjali', 'Kunal', 'Meera', 'Arjun', 'Pooja', 'Sahil', 'Neha', 'Rahul', 'Kavya', 'Aditya', 'Isha', 'Omkar', 'Tanvi', 'Siddharth', 'Riya', 'Yash', 'Gauri', 'Nikhil', 'Shruti', 'Pranav', 'Ananya', 'Varun', 'Sakshi', 'Harsh', 'Divya', 'Mihir', 'Komal'];
  const LAST = ['Deshmukh', 'Kulkarni', 'Patil', 'Joshi', 'Shinde', 'Pawar', 'Jadhav', 'More', 'Gaikwad', 'Sharma', 'Verma', 'Iyer', 'Nair', 'Mehta', 'Shah', 'Chavan', 'Bhosale', 'Rao', 'Gupta', 'Kadam'];
  const CITIES = ['Pune', 'Mumbai', 'Nagpur', 'Nashik', 'Thane', 'Aurangabad', 'Kolhapur', 'Solapur', 'Satara', 'Amravati', 'Indore', 'Surat'];

  function generate() {
    const r = rng(2018);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const now = Date.now();
    const N = 180;
    const members = [];
    const L = [], R = [];

    for (let i = 0; i < N; i++) {
      // Growth curve: later members cluster in recent weeks
      const joined = i === 0 ? now - 400 * DAY : now - Math.floor(150 * DAY * Math.pow(1 - i / N, 1.6)) - Math.floor(r() * DAY);
      const m = {
        idx: i,
        id: 'TS' + (10000 + i * 7 + (i ? 241 : 0)),
        name: i === 0 ? 'Regenus India (Company)' : `${pick(FIRST)} ${pick(LAST)}`,
        city: i === 0 ? 'Pune' : pick(CITIES),
        phone: '+91 9' + String(Math.floor(r() * 1e9)).padStart(9, '0').replace(/^(\d{2})\d{5}/, '$1•••••'),
        pkg: i === 0 ? 'vip' : r() < 0.55 ? 'starter' : r() < 0.7 ? 'pro' : 'vip',
        joined,
        status: i === 0 ? 'active' : r() < 0.82 ? 'active' : 'inactive',
        kyc: i === 0 ? 'verified' : r() < 0.68 ? 'verified' : r() < 0.6 ? 'pending' : r() < 0.4 ? 'rejected' : 'not_submitted',
        parent: null, leg: null, sponsor: null,
        monthBV: 0,
        earned: { direct: 0, binary: 0, generation: 0, leadership: 0, cto: 0 },
        wallet: { payout: 0, repurchase: 0 },
        carryL: 0, carryR: 0,
      };
      if (i > 0) {
        // Sponsor: biased toward early/leader members; placement: extreme leg spillover
        const sponsor = Math.floor(Math.pow(r(), 2.2) * i);
        let leg = r() < 0.5 ? 'L' : 'R';
        let node = sponsor;
        const kids = leg === 'L' ? L : R;
        while (kids[node] != null) node = kids[node];
        kids[node] = i;
        m.parent = node; m.leg = leg; m.sponsor = sponsor;
      }
      m.monthBV = m.status === 'active' ? Math.round((300 + r() * 1500) / 10) * 10 : 0;
      members.push(m);
    }
    // Historic earnings (pre-demo weeks), derived from the generated network
    const bvOf = (m) => P.PACKAGES.find((p) => p.key === m.pkg).bv;
    const sub = new Array(N).fill(0);
    for (let i = N - 1; i >= 0; i--) sub[i] = bvOf(members[i]) + (L[i] != null ? sub[L[i]] : 0) + (R[i] != null ? sub[R[i]] : 0);
    members.forEach((m, i) => {
      if (m.sponsor != null) members[m.sponsor].earned.direct += bvOf(m) * P.DIRECT_RATE;
      const weaker = Math.min(L[i] != null ? sub[L[i]] : 0, R[i] != null ? sub[R[i]] : 0);
      // binary history after the pro-rata ceiling (~25% of gross in past cycles)
      m.earned.binary = i ? Math.round(weaker * P.BINARY_RATE * 0.25) : 0;
      m.earned.generation = i && m.status === 'active' ? Math.round((sub[i] - bvOf(m)) * 0.012 * (0.6 + r() * 0.8)) : 0;
      m.wallet.payout = i ? Math.round((m.earned.binary + m.earned.direct) * 0.9 * r() * 0.4) : 0;
      m.wallet.repurchase = i ? Math.round((m.earned.binary + m.earned.direct) * 0.1) : 0;
    });
    members.forEach((m) => { if (m.sponsor) members[m.sponsor].earned.leadership += Math.round((m.earned.binary + m.earned.generation) * P.LEADERSHIP_RATE); });
    members.forEach((m) => { m.earned.direct = Math.round(m.earned.direct); });

    // Orders over the last 20 days
    const prods = root.TS_PRODUCTS;
    const orders = [];
    for (let k = 0; k < 70; k++) {
      const mi = 1 + Math.floor(r() * (N - 1));
      const items = Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ pid: pick(prods).id, qty: 1 + Math.floor(r() * 2) }));
      const lines = items.map((it) => ({ ...prods.find((p) => p.id === it.pid), qty: it.qty }));
      const q = P.priceCart(lines, Math.floor(r() * 120));
      const t = now - Math.floor(r() * 20 * DAY);
      const age = (now - t) / DAY;
      orders.push({
        id: 'ORD' + (884200 + k * 13), mi, t, items, paid: q.netPaid, bv: q.bv, pointsUsed: q.pointsUsed,
        pay: pick(['UPI', 'UPI', 'Card', 'NetBanking']),
        status: age > P.ESCROW_DAYS ? (r() < 0.06 ? 'Returned' : 'Confirmed') : r() < 0.08 ? 'Returned' : 'Pending_Escrow',
      });
    }
    orders.sort((a, b) => b.t - a.t);

    const withdrawals = [];
    for (let k = 0; k < 16; k++) {
      const mi = 1 + Math.floor(r() * (N - 1));
      withdrawals.push({ id: 'WD' + (5100 + k), mi, t: now - Math.floor(r() * 9 * DAY), amount: Math.round((800 + r() * 18000) / 50) * 50, status: k < 9 ? 'pending' : r() < 0.85 ? 'approved' : 'rejected' });
    }
    withdrawals.sort((a, b) => b.t - a.t);

    const SUBJ = ['Binary income not reflecting for last week', 'KYC document re-upload', 'Order delivered damaged — return request', 'TrueSteps not syncing with phone', 'Change placement leg request', 'Bank account update', 'TruePoints expired early?', 'Invoice copy needed for GST'];
    const tickets = SUBJ.map((s, k) => ({ id: 'TK' + (301 + k), mi: 1 + Math.floor(r() * (N - 1)), t: now - Math.floor(r() * 6 * DAY), subject: s, priority: pick(['Low', 'Medium', 'High']), status: k < 5 ? 'open' : 'closed', replies: [] }));

    return {
      v: 2, members, L, R, orders, withdrawals, tickets,
      week: 47, payoutRuns: [], ctoRuns: [],
      audit: [{ t: now - 2 * DAY, msg: 'System: demo dataset generated (180 members)' }],
    };
  }


  /* ======================================================= linked member
   * The storefront demo user (TS.state, app.js) IS one of these members
   * (TS10248). Orders, BV, rewards, wallet credits and KYC are shared, so
   * whatever the member does shows in the admin and vice versa. */
  const linked = () => (root.TS && root.TS.state && root.TS.state.member ? root.TS : null);
  const linkedIdx = (d) => { const T = linked(); return T ? d.members.findIndex((m) => m.id === T.state.member.id) : -1; };
  const isLinked = (d, m) => m.idx === linkedIdx(d);
  /** Rewards account (cashback + TruePoints lots) of a member. */
  function rewardsOf(d, m) {
    if (isLinked(d, m)) return linked().state.rewards;
    if (!m.rewards) m.rewards = P.newRewards();
    return m.rewards;
  }
  const touch = (d, m) => { if (isLinked(d, m)) linked().save(); };
  function wallets(d, m, now = Date.now()) {
    const b = P.rewardSummary(rewardsOf(d, m), now);
    const w = isLinked(d, m) ? linked().state.wallets : m.wallet;
    return { payout: w.payout, repurchase: w.repurchase, cashback: b.cashback, points: b.points, next: b.next, lastUsedAt: b.lastUsedAt };
  }
  /** Credit a released commission: 90% payout wallet, 10% auto-repurchase wallet. */
  function creditWallet(d, m, gross, type, note, now = Date.now()) {
    const s = P.splitCommission(gross);
    m.wallet.payout = P.round2(m.wallet.payout + s.payoutGross); m.wallet.repurchase = P.round2(m.wallet.repurchase + s.repurchase);
    (m.ledger = m.ledger || []).unshift({ t: now, type, note, amount: P.round2(gross) });
    const T = isLinked(d, m) && linked();
    if (T) {
      T.state.wallets.payout = P.round2(T.state.wallets.payout + s.payoutGross); T.state.wallets.repurchase = P.round2(T.state.wallets.repurchase + s.repurchase);
      T.state.ledger.unshift({ t: now, type, note, amount: P.round2(gross) }); T.save();
    }
    return s;
  }
  function setKyc(d, m, status) {
    m.kyc = status;
    const T = isLinked(d, m) && linked();
    if (T) { const k = T.state.member.kyc; if (status === 'verified') { k.pan = k.aadhaar = k.bank = true; } else if (status === 'rejected') k.bank = false; T.state.member.kycStatus = status; T.save(); }
  }
  function syncLinked(d) {
    const T = linked(), i = linkedIdx(d); if (!T || i < 0) return;
    const m = d.members[i], s = T.state, k = s.member.kyc;
    m.name = s.member.name; m.pkg = s.member.package; m.city = m.city || 'Pune';
    m.wallet = { payout: s.wallets.payout, repurchase: s.wallets.repurchase };
    m.kyc = k.pan && k.aadhaar && k.bank ? 'verified' : s.member.kycStatus === 'rejected' ? 'rejected' : 'pending'; // the storefront account is the source of truth
  }

  /* ======================================================= orders: tracking + escrow
   * Order status: Pending_Escrow → Confirmed, or Cancelled / Returned.
   * Fulfilment stage (track.events): placed → packed → shipped →
   * out_for_delivery → delivered. The 7-day return window (escrow) starts at
   * delivery. BV and cashback are credited only when the order is Confirmed. */
  const STAGES = ['placed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
  const STAGE_LABEL = { placed: 'Order placed', packed: 'Packed', shipped: 'Shipped', out_for_delivery: 'Out for delivery', delivered: 'Delivered' };
  const COURIERS = ['Delhivery', 'Blue Dart', 'Ecom Express', 'India Post'];
  const HOUR = 3600000;
  const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const stageOf = (o) => { const ev = o.track.events.filter((e) => STAGES.includes(e.stage)); return ev.length ? ev[ev.length - 1].stage : 'placed'; };
  const stageIdx = (o) => STAGES.indexOf(stageOf(o));
  const escrowLeft = (o, now = Date.now()) => (o.deliveredAt ? Math.max(0, o.escrowEndsAt - now) : null);
  const assignAwb = (o) => { if (!o.track.awb) { const h = hash(o.id); o.track.courier = COURIERS[h % COURIERS.length]; o.track.awb = String(h % 9000000000 + 1000000000); } };
  function deliver(o, t, note) {
    o.track.events.push({ stage: 'delivered', t, note });
    o.deliveredAt = t; o.escrowEndsAt = t + P.ESCROW_DAYS * DAY;
  }
  /** Seeded timeline for demo orders: packed +4h, shipped +18h, out for delivery +40h, delivered +2 days. */
  function seedTrack(o, now) {
    o.track = { courier: null, awb: null, events: [{ stage: 'placed', t: o.t, note: o.channel === 'offline_store' ? 'Billed at store counter' : 'Payment received' }] };
    if (o.channel === 'offline_store') { deliver(o, o.t, 'Handed over at the store'); return; }
    const steps = [['packed', 4 * HOUR, 'Packed at Pune warehouse'], ['shipped', 18 * HOUR, 'Handed to courier'], ['out_for_delivery', 40 * HOUR, 'Out for delivery'], ['delivered', 48 * HOUR, 'Delivered, signed by customer']];
    for (const [stage, dt, note] of steps) {
      const t = o.t + dt; if (t > now) break;
      if (stage === 'shipped') assignAwb(o);
      if (stage === 'delivered') deliver(o, t, note); else o.track.events.push({ stage, t, note });
    }
  }
  const memberOf = (d, o) => d.members[o.mi];
  function placeOrder(d, { mi, items, quote, pay, channel = 'online', storeId = null, id }, now = Date.now()) {
    if (d.members[mi].status === 'blocked') throw new Error('This account is on hold. Please contact support.');
    const o = { id: id || 'ORD' + String(now).slice(-7), mi, t: now, items: items.map((x) => ({ pid: x.pid, qty: x.qty })), paid: quote.netPaid, bv: quote.bv,
      pointsUsed: quote.pointsUsed || 0, cashback: P.round2(quote.cashback != null ? quote.cashback : quote.bv * P.CASHBACK_RATE), pay, status: 'Pending_Escrow', channel, storeId };
    o.track = { courier: null, awb: null, events: [{ stage: 'placed', t: now, note: channel === 'offline_store' ? 'Billed at store counter' : 'Payment received' }] };
    if (channel === 'offline_store') deliver(o, now, 'Handed over at the store');
    d.orders.unshift(o);
    return o;
  }
  function advance(d, o, now = Date.now(), note) {
    if (o.status !== 'Pending_Escrow') throw new Error(`${o.id} is ${o.status}`);
    const i = stageIdx(o); if (i >= STAGES.length - 1) throw new Error(`${o.id} is already delivered`);
    const next = STAGES[i + 1];
    if (next === 'shipped') assignAwb(o);
    if (next === 'delivered') deliver(o, now, note || 'Delivered'); else o.track.events.push({ stage: next, t: now, note: note || STAGE_LABEL[next] });
    return next;
  }
  function refundRewards(d, o, now) { const m = memberOf(d, o); const back = o.pointsUsed ? P.reverseRedemption(rewardsOf(d, m), o.id, now) : 0; touch(d, m); return back; }
  /** Cancel before it ships. */
  function cancel(d, o, now = Date.now(), reason = 'Cancelled') {
    if (o.status !== 'Pending_Escrow') throw new Error(`${o.id} is ${o.status}`);
    if (stageIdx(o) >= STAGES.indexOf('shipped')) throw new Error('Already shipped. It can be returned after delivery.');
    o.status = 'Cancelled'; o.track.events.push({ stage: 'cancelled', t: now, note: reason });
    return refundRewards(d, o, now);
  }
  /** Return inside the 7-day window after delivery. Nothing was credited yet, so nothing has to be clawed back. */
  function returnOrder(d, o, now = Date.now(), reason = 'Returned') {
    if (o.status !== 'Pending_Escrow') throw new Error(`${o.id} is ${o.status}`);
    if (!o.deliveredAt) throw new Error('Not delivered yet. Cancel it instead, or refuse it at the door.');
    if (now >= o.escrowEndsAt) throw new Error('The 7-day return window has closed.');
    o.status = 'Returned'; o.track.events.push({ stage: 'returned', t: now, note: reason });
    return refundRewards(d, o, now);
  }
  /** Release from escrow: credit BV and cashback. Early release needs a reason (it ends the member's return window). */
  function confirm(d, o, now = Date.now(), reason = '') {
    if (o.status !== 'Pending_Escrow') throw new Error(`${o.id} is ${o.status}`);
    if (!o.deliveredAt) throw new Error('Not delivered yet. BV stays in escrow until delivery + 7 days.');
    if (memberOf(d, o).status === 'blocked') throw new Error('Member is blocked. The BV stays in escrow until the account is unblocked.');
    const early = now < o.escrowEndsAt;
    if (early && !String(reason).trim()) throw new Error('The return window is still open. Give a reason to release early.');
    o.status = 'Confirmed'; o.confirmedAt = now;
    o.track.events.push({ stage: 'confirmed', t: now, note: early ? `Released early: ${reason}` : 'Return window closed, BV confirmed' });
    creditOrder(d, o, now);
    return o;
  }
  function creditOrder(d, o, now) {
    if (o.bvCredited) return;
    const m = memberOf(d, o);
    m.bv = m.bv || { lifetime: 0, log: [] };
    const mk = monthKey(now);
    if (m.bv.monthKey && m.bv.monthKey !== mk) m.monthBV = 0; // a new month starts from zero
    m.bv.monthKey = mk;
    m.bv.lifetime = P.round2(m.bv.lifetime + o.bv); m.monthBV = P.round2((m.monthBV || 0) + o.bv);
    m.bv.log.unshift({ t: now, ref: o.id, bv: o.bv, note: 'Order confirmed' });
    o.bvCredited = true;
    if (!o.cashbackCredited && o.cashback > 0) { P.creditReward(rewardsOf(d, m), 'cashback', o.cashback, now, `5% cashback on ${o.id}`, o.id); o.cashbackCredited = true; }
    touch(d, m);
  }
  /** Scheduled job: confirm every delivered order whose return window has closed. */
  function settle(d, now = Date.now()) {
    let n = 0;
    d.orders.forEach((o) => { if (o.status === 'Pending_Escrow' && o.deliveredAt && now >= o.escrowEndsAt && memberOf(d, o).status !== 'blocked') { confirm(d, o, Math.max(o.escrowEndsAt, o.track.events.at(-1).t)); n++; } });
    return n;
  }
  const monthKey = (t) => new Date(t + 5.5 * HOUR).toISOString().slice(0, 7); // IST calendar month
  /** Personal order BV of a member. */
  function orderBV(d, m, now = Date.now()) {
    const os = d.orders.filter((o) => o.mi === m.idx);
    const sum = (f) => P.round2(os.filter(f).reduce((a, o) => a + o.bv, 0));
    const month = m.bv && m.bv.monthKey && m.bv.monthKey !== monthKey(now) ? 0 : P.round2(m.monthBV || 0);
    return { escrow: sum((o) => o.status === 'Pending_Escrow'), month, lifetime: m.bv ? m.bv.lifetime : 0, orders: os.length, log: m.bv ? m.bv.log : [] };
  }

  /* ======================================================= network (shared by admin + member view) */
  const pkgOf = (k) => P.PACKAGES.find((p) => p.key === k);
  const lastRunAt = (d) => { const r = d.payoutRuns[0]; return r ? r.t : Date.now() - 7 * DAY; };
  function network(d) {
    const { members, L, R } = d, n = members.length, since = lastRunAt(d);
    const sub = new Array(n).fill(0), cnt = new Array(n).fill(0), wsub = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { // children always have a higher index than their parent
      const m = members[i], own = m.status === 'blocked' ? 0 : pkgOf(m.pkg).bv, l = L[i], r = R[i];
      sub[i] = own + (l != null ? sub[l] : 0) + (r != null ? sub[r] : 0);
      cnt[i] = 1 + (l != null ? cnt[l] : 0) + (r != null ? cnt[r] : 0);
      wsub[i] = (m.joined > since ? own : 0) + (l != null ? wsub[l] : 0) + (r != null ? wsub[r] : 0);
    }
    const NET = members.map((m, i) => {
      const lb = L[i] != null ? sub[L[i]] : 0, rb = R[i] != null ? sub[R[i]] : 0;
      return { left: lb, right: rb, team: cnt[i] - 1, leftCount: L[i] != null ? cnt[L[i]] : 0, rightCount: R[i] != null ? cnt[R[i]] : 0,
        weekL: L[i] != null ? wsub[L[i]] : 0, weekR: R[i] != null ? wsub[R[i]] : 0, rank: P.rankFor(lb, rb).current, directs: 0 };
    });
    members.forEach((m) => { if (m.sponsor != null) NET[m.sponsor].directs++; });
    return NET;
  }
  /** Monthly repurchase BV by sponsor generation, levels 1–6. */
  function generationBV(d, idx) {
    const out = []; let level = [idx];
    for (let g = 0; g < 6; g++) {
      level = d.members.filter((m) => level.includes(m.sponsor)).map((m) => m.idx);
      out.push(level.reduce((a, i) => a + (d.members[i].status === 'active' ? d.members[i].monthBV || 0 : 0), 0));
    }
    return out;
  }

  /* ======================================================= load + migrate */
  function migrate(d, now = Date.now(), fresh = false) {
    if (d.v === 3) return d;
    const T = linked(), li = T ? d.members.findIndex((m) => m.id === T.state.member.id) : -1;
    d.orders.forEach((o) => {
      if (o.cashback == null) o.cashback = P.round2(o.bv * P.CASHBACK_RATE);
      if (!o.track) seedTrack(o, now);
      const done = o.deliveredAt && now >= o.escrowEndsAt;
      if (fresh && o.status !== 'Returned') o.status = done ? 'Confirmed' : 'Pending_Escrow';
      if (o.status === 'Returned') o.track.events.push({ stage: 'returned', t: Math.min(now, (o.deliveredAt || o.t) + DAY), note: 'Returned by customer' });
      if (o.status === 'Confirmed') { o.confirmedAt = Math.min(now, o.escrowEndsAt || now); o.track.events.push({ stage: 'confirmed', t: o.confirmedAt, note: 'Return window closed, BV confirmed' }); }
    });
    // seeded history: monthBV is personal BV already confirmed this month; add confirmed orders' BV and cashback on top
    d.members.forEach((m) => { if (!m.bv) m.bv = { lifetime: m.monthBV || 0, log: [], monthKey: monthKey(now) }; });
    d.orders.slice().sort((a, b) => (a.confirmedAt || 0) - (b.confirmedAt || 0)).forEach((o) => {
      if (o.status !== 'Confirmed') return;
      const m = d.members[o.mi]; m.bv = m.bv || { lifetime: 0, log: [] };
      m.bv.lifetime = P.round2(m.bv.lifetime + o.bv); m.bv.log.unshift({ t: o.confirmedAt, ref: o.id, bv: o.bv, note: 'Order confirmed' });
      o.bvCredited = true;
      if (o.mi !== li) { m.rewards = m.rewards || P.newRewards(); P.creditReward(m.rewards, 'cashback', o.cashback, o.confirmedAt, `5% cashback on ${o.id}`, o.id); }
      o.cashbackCredited = true;
    });
    if (li >= 0) { // storefront orders placed before orders were shared: move them in (their BV and cashback were already credited)
      const s = T.state, byName = (n) => (root.TS_PRODUCTS.find((p) => p.name === n) || root.TS_PRODUCTS[0]).id;
      (s.orders || []).slice().reverse().forEach((x) => {
        if (d.orders.some((o) => o.id === x.id)) return;
        const o = { id: x.id, mi: li, t: x.t, items: x.items.map((it) => ({ pid: it.pid || byName(it.name), qty: it.qty })), paid: x.paid, bv: x.bv, pointsUsed: 0, cashback: x.cashback || 0, pay: 'UPI', status: x.status === 'Returned' ? 'Returned' : 'Pending_Escrow', channel: 'online', bvCredited: true, cashbackCredited: true };
        seedTrack(o, now); d.orders.unshift(o);
      });
      s.orders = []; T.save();
    }
    d.orders.sort((a, b) => b.t - a.t);
    d.v = 3;
    return d;
  }
  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (d && (d.v === 2 || d.v === 3)) return migrate(d);
    d = migrate(generate(), Date.now(), true); persist(d); return d;
  }
  function persist(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function boot(d) { syncLinked(d); settle(d); persist(d); return d; }

  let db = boot(load());
  // another tab (shop, dashboard) changed the data: reload in memory only, never write back (no ping-pong)
  if (root.addEventListener) root.addEventListener('storage', (e) => { if (e.key === KEY || e.key === 'trueshop-demo-v1') { const x = load(); syncLinked(x); db = x; } });
  root.AdminDB = {
    get db() { return db; },
    save() { persist(db); },
    reset() { db = boot(migrate(generate(), Date.now(), true)); },
    log(msg) { db.audit.unshift({ t: Date.now(), msg }); persist(db); },
    DAY, STAGES, STAGE_LABEL,
    generate, migrate, seedTrack, placeOrder, advance, cancel, returnOrder, confirm, settle, stageOf, stageIdx, escrowLeft, orderBV: (m, now) => orderBV(db, m, now), monthKey,
    network, generationBV, lastRunAt, pkgOf,
    linkedIdx: () => linkedIdx(db), isLinked: (m) => isLinked(db, m), rewardsOf: (m) => rewardsOf(db, m), wallets: (m, now) => wallets(db, m, now),
    creditWallet: (m, gross, type, note) => creditWallet(db, m, gross, type, note), setKyc: (m, st) => setKyc(db, m, st), touch: (m) => touch(db, m),
  };
})(typeof window !== 'undefined' ? window : globalThis);
