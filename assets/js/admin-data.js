/* =========================================================================
 * Admin demo dataset: deterministic (seeded) members, binary placement,
 * orders, withdrawals, tickets. Persisted in localStorage so admin actions
 * survive reloads. Replace with API calls when a backend exists.
 * ========================================================================= */
(function () {
  'use strict';
  const P = TrueShopPlan;
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
    const prods = window.TS_PRODUCTS;
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

  function load() {
    try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.v === 2) return d; } catch (e) {}
    const d = generate(); persist(d); return d;
  }
  function persist(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }

  let db = load();
  window.AdminDB = {
    get db() { return db; },
    save() { persist(db); },
    reset() { db = generate(); persist(db); },
    log(msg) { db.audit.unshift({ t: Date.now(), msg }); persist(db); },
    DAY,
  };
})();
