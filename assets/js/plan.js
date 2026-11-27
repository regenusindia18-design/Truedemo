/* =========================================================================
 * TrueShop Compensation Plan Engine
 * Single source of truth for every rule in:
 *   - TrueShop_Master_Business_Plan FFF.pdf
 *   - TrueShop_Legal_And_Developer_BRD FFF.pdf
 *   - TrueShop_Financial_Payout_Simulator FFF.xlsx
 * Pure functions only — no DOM access — so it can be unit-tested or ported
 * to a backend later.
 * ========================================================================= */
(function (global) {
  'use strict';

  const COMPANY = {
    name: 'Regenus India Private Limited',
    brand: 'TrueShop',
    established: 2018,
    state: 'Maharashtra, India',
    tagline: 'Shop Karo | Share Karo | Earn Karo',
  };

  /* 1. Category-wise BV ratio (on DP) */
  const CATEGORIES = {
    health:    { label: 'Health & Wellness Supplements', bvRatio: 0.65, maxDiscount: 0.40, icon: '🌿' },
    personal:  { label: 'Personal Care & Daily FMCG',    bvRatio: 0.40, maxDiscount: 0.25, icon: '🧴' },
    lifestyle: { label: 'Apparel, Accessories & Lifestyle', bvRatio: 0.25, maxDiscount: 0.20, icon: '👕' },
  };

  /* 2. BV distribution — headline vs actual outflow (share of TOTAL BV) */
  const INCOME_STREAMS = [
    { key: 'cashback',   name: 'Smart Shopper Cashback',   phase: 'Self Purchase',  headline: '5% BV',            actual: 0.05, base: 'total',      rule: 'Credited to Cashback Wallet after the 7-day escrow (60-day validity, carried forward once used, 0 BV on use)' },
    { key: 'direct',     name: 'Direct Referral Booster',  phase: 'First Purchase', headline: '10% BV',           actual: 0.10, base: 'first',      rule: 'Instant direct sponsor commission on first order BV' },
    { key: 'binary',     name: 'Flash Binary Matching',    phase: 'First Purchase', headline: '40% Matching BV',  actual: 0.20, base: 'first',      rule: '1:1 pair matching (1000L:1000R = ₹400); power-leg carry forward' },
    { key: 'generation', name: 'Repurchase Generation',    phase: 'Monthly Repeat', headline: '20% BV',           actual: 0.20, base: 'repurchase', rule: '6 levels: L1 7%, L2 4%, L3 3%, L4 2%, L5 2%, L6 2%' },
    { key: 'leadership', name: 'Leadership Check Match',   phase: 'Team Earning',   headline: '10% Downline Income', actual: 0.05, base: 'total',   rule: "10% of direct downline's earned Binary & Generation bonus" },
    { key: 'cto',        name: 'CTO Royalty & Lifestyle',  phase: 'Leadership Pool', headline: '10% CTO BV',      actual: 0.10, base: 'total',      rule: 'Bronze Club 4%, Travel & Car Pool 3%, Crown Royalty 3%' },
  ];
  /* Categorical chart colours, fixed order per stream (validated for CVD
   * separation in light + dark). Company retention uses neutral slate. */
  const STREAM_COLORS = ['#16a34a', '#0284c7', '#ca8a04', '#7c3aed', '#ea580c', '#db2777'];
  const RETAINED_COLOR = '#64748b';
  const HARD_CAP = 0.70;          // 70% of total BV — absolute ceiling
  const HEADLINE_TOTAL = 0.95;    // brochure figure (see compliance note)

  let BINARY_RATE = 0.40;       // on matched weaker-leg BV
  let GENERATION_LEVELS = [0.07, 0.04, 0.03, 0.02, 0.02, 0.02];
  let DIRECT_RATE = 0.10;
  let CASHBACK_RATE = 0.05;
  let LEADERSHIP_RATE = 0.10;
  const CTO_POOLS = [
    { key: 'bronze', name: 'Bronze Club Pool',     share: 0.04 },
    { key: 'travel', name: 'Travel & Car Pool',    share: 0.03 },
    { key: 'crown',  name: 'Crown Royalty Pool',   share: 0.03 },
  ];

  /* Activation slabs & weekly binary capping */
  const PACKAGES = [
    { key: 'starter', name: 'Starter ID',   bv: 1000, weeklyCap: 15000 },
    { key: 'pro',     name: 'Pro ID',       bv: 2500, weeklyCap: 50000 },
    { key: 'vip',     name: 'VIP Prime ID', bv: 5000, weeklyCap: 150000 },
  ];

  /* Wallets (BRD §2) */
  const WALLET_SPLIT = { payout: 0.90, repurchase: 0.10 };
  const DEDUCTIONS = { tds: 0.05, admin: 0.05 };

  /* TrueSteps / TruePoints (BRD §3) */
  const STEPS = { stepsPerBlock: 5000, pointsPerBlock: 10, rupeePerPoint: 1, maxCartShare: 0.10, expiryDays: 60 };
  const ESCROW_DAYS = 7;
  const DAY_MS = 86400000;

  /* Rewards (cashback + TruePoints) validity.
   * Every credit is a "lot". A lot lapses VALIDITY days after it was credited,
   * unless the member has used rewards since: any redemption carries every
   * remaining lot forward, so a lot lapses VALIDITY days after the later of
   * (its credit date, the member's last redemption). A cancelled or returned
   * order gives the rewards back to their original lots and no longer counts
   * as a use, so an order cannot be used to refresh the clock. */
  const REWARDS = { validityDays: 60, kinds: ['points', 'cashback'] };
  const BUYBACK_DAYS = 30;

  /* 3. Ranks */
  const RANKS = [
    { key: 'bronze',  name: 'Bronze Star',      match: 10000,   pool: '4% Bronze CTO Pool',              poolKey: 'bronze', shares: 1, reward: '₹2,500 TrueShop Shopping Voucher', color: '#cd7f32' },
    { key: 'silver',  name: 'Silver Achiever',  match: 50000,   pool: '3% Travel & Car Pool (1× share)',  poolKey: 'travel', shares: 1, reward: 'Domestic Leisure Trip (Goa / Manali)', color: '#9ca3af' },
    { key: 'gold',    name: 'Gold Director',    match: 200000,  pool: '3% Travel & Car Pool (2× shares)', poolKey: 'travel', shares: 2, reward: 'International Thailand Trip + ₹25,000 Cash', color: '#eab308' },
    { key: 'diamond', name: 'Diamond Leader',   match: 1000000, pool: '3% Crown Royalty Pool (1× share)', poolKey: 'crown',  shares: 1, reward: '₹2,50,000 Car Downpayment Fund', color: '#38bdf8' },
    { key: 'crown',   name: 'Crown Ambassador', match: 5000000, pool: '3% Crown Royalty Pool (3× shares)', poolKey: 'crown', shares: 3, reward: '₹15,00,000 Luxury Car / Villa Fund', color: '#a855f7' },
  ];

  /* ------------------------------------------------- admin plan overrides
   * Plan Settings in the admin panel saves overrides to localStorage under
   * OVERRIDE_KEY. They are validated against the 70% hard cap before being
   * saved, and applied here at load so every page uses the same rules.
   */
  const OVERRIDE_KEY = 'trueshop-plan-overrides';
  const DEFAULTS = JSON.parse(JSON.stringify({
    bvRatios: Object.fromEntries(Object.entries(CATEGORIES).map(([k, c]) => [k, c.bvRatio])),
    weeklyCaps: Object.fromEntries(PACKAGES.map((p) => [p.key, p.weeklyCap])),
    binaryRate: BINARY_RATE, directRate: DIRECT_RATE, cashbackRate: CASHBACK_RATE, generation: GENERATION_LEVELS,
  }));

  /** Effective share of total BV implied by a settings object (must be <= HARD_CAP). */
  function effectiveOutflow(cfg) {
    const leadership = INCOME_STREAMS.find((x) => x.key === 'leadership').actual;
    const cto = INCOME_STREAMS.find((x) => x.key === 'cto').actual;
    return cfg.cashbackRate + cfg.directRate + cfg.binaryRate / 2 + cfg.generation.reduce((a, b) => a + b, 0) + leadership + cto;
  }

  function applyOverrides(cfg) {
    Object.entries(cfg.bvRatios || {}).forEach(([k, v]) => CATEGORIES[k] && (CATEGORIES[k].bvRatio = v));
    Object.entries(cfg.weeklyCaps || {}).forEach(([k, v]) => { const p = PACKAGES.find((x) => x.key === k); if (p) p.weeklyCap = v; });
    if (cfg.binaryRate != null) BINARY_RATE = cfg.binaryRate;
    if (cfg.directRate != null) DIRECT_RATE = cfg.directRate;
    if (cfg.cashbackRate != null) CASHBACK_RATE = cfg.cashbackRate;
    if (Array.isArray(cfg.generation) && cfg.generation.length === 6) GENERATION_LEVELS = cfg.generation.slice();
    const set = (key, v) => (INCOME_STREAMS.find((x) => x.key === key).actual = v);
    set('cashback', CASHBACK_RATE); set('direct', DIRECT_RATE); set('binary', BINARY_RATE / 2);
    set('generation', GENERATION_LEVELS.reduce((a, b) => a + b, 0));
  }
  function currentSettings() {
    return JSON.parse(JSON.stringify({
      bvRatios: Object.fromEntries(Object.entries(CATEGORIES).map(([k, c]) => [k, c.bvRatio])),
      weeklyCaps: Object.fromEntries(PACKAGES.map((p) => [p.key, p.weeklyCap])),
      binaryRate: BINARY_RATE, directRate: DIRECT_RATE, cashbackRate: CASHBACK_RATE, generation: GENERATION_LEVELS,
    }));
  }
  try {
    const saved = typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem(OVERRIDE_KEY));
    if (saved && effectiveOutflow({ ...DEFAULTS, ...saved }) <= HARD_CAP + 1e-9) applyOverrides(saved);
  } catch (e) { /* storage unavailable: use defaults */ }

  /* ---------------------------------------------------------------- utils */
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const inr = (n, dp = 0) =>
    '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const num = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const pct = (n, dp = 0) => (n * 100).toFixed(dp) + '%';

  /* ------------------------------------------------------------ BV & cart */
  function productBV(dp, category) {
    return round2(dp * CATEGORIES[category].bvRatio);
  }

  /**
   * Price a cart. BV is generated only on the net INR actually paid
   * (after TruePoints) — the Zero-Leakage rule. TruePoints are capped at
   * 10% of the bill.
   */
  function priceCart(items, availablePoints = 0, requestedPoints = availablePoints) {
    let mrp = 0, dp = 0, grossBV = 0;
    for (const it of items) {
      mrp += it.mrp * it.qty;
      dp += it.dp * it.qty;
      grossBV += productBV(it.dp, it.category) * it.qty;
    }
    const maxPoints = Math.floor(dp * STEPS.maxCartShare);
    const pointsUsed = Math.max(0, Math.min(requestedPoints, availablePoints, maxPoints));
    const discount = pointsUsed * STEPS.rupeePerPoint;
    const netPaid = dp - discount;
    // BV scales down proportionally with the share of bill paid in TruePoints
    const bv = dp > 0 ? round2(grossBV * (netPaid / dp)) : 0;
    return {
      mrp, dp, savings: mrp - dp, maxPoints, pointsUsed, discount, netPaid, grossBV: round2(grossBV), bv,
      cashback: round2(bv * CASHBACK_RATE),
    };
  }

  /* --------------------------------------------------------------- binary */
  /**
   * Weekly binary closing with 1:1 matching, power-leg carry forward and
   * package-based weekly capping. Both legs are reduced by the matched BV;
   * the unmatched surplus on the stronger leg carries forward.
   */
  function binaryClosing({ leftBV, rightBV, carryLeft = 0, carryRight = 0, packageKey = 'starter' }) {
    const pkg = PACKAGES.find((p) => p.key === packageKey) || PACKAGES[0];
    const L = leftBV + carryLeft;
    const R = rightBV + carryRight;
    const matched = Math.min(L, R);
    const gross = round2(matched * BINARY_RATE);
    const paid = Math.min(gross, pkg.weeklyCap);
    return {
      totalLeft: L, totalRight: R, matched, gross, paid,
      flushed: round2(gross - paid),
      capped: gross > pkg.weeklyCap,
      weeklyCap: pkg.weeklyCap,
      carryLeft: L - matched,
      carryRight: R - matched,
      powerLeg: L > R ? 'Left' : R > L ? 'Right' : 'Balanced',
    };
  }

  /* ----------------------------------------------------------- generation */
  function generationIncome(levelBV /* array of 6 BV totals */) {
    const rows = GENERATION_LEVELS.map((rate, i) => {
      const bv = levelBV[i] || 0;
      return { level: i + 1, rate, bv, income: round2(bv * rate) };
    });
    return { rows, total: round2(rows.reduce((s, r) => s + r.income, 0)) };
  }

  /* ----------------------------------------------------------- leadership */
  function leadershipMatch(directsEarnings /* array of {binary, generation} */) {
    const base = directsEarnings.reduce((s, d) => s + (d.binary || 0) + (d.generation || 0), 0);
    return { base, income: round2(base * LEADERSHIP_RATE) };
  }

  /* ---------------------------------------------------------------- ranks */
  function rankFor(cumLeft, cumRight) {
    const weaker = Math.min(cumLeft, cumRight);
    let current = null;
    for (const r of RANKS) if (weaker >= r.match) current = r;
    const next = RANKS.find((r) => weaker < r.match) || null;
    return { current, next, weaker, progress: next ? weaker / next.match : 1 };
  }

  /* ------------------------------------------------------------- wallets */
  /** Split gross commission: 90% payout (minus TDS + admin) / 10% repurchase */
  function splitCommission(gross) {
    const payoutGross = round2(gross * WALLET_SPLIT.payout);
    const repurchase = round2(gross * WALLET_SPLIT.repurchase);
    const tds = round2(payoutGross * DEDUCTIONS.tds);
    const admin = round2(payoutGross * DEDUCTIONS.admin);
    return { gross, payoutGross, repurchase, tds, admin, bankNet: round2(payoutGross - tds - admin) };
  }

  /* --------------------------------------------------------------- steps */
  function stepsToPoints(steps) {
    return Math.floor(steps / STEPS.stepsPerBlock) * STEPS.pointsPerBlock;
  }


  /* -------------------------------------------------------------- rewards */
  const newRewards = () => ({ lots: [], uses: [], log: [] });
  const lastUseAt = (acct) => acct.uses.reduce((a, u) => (u.reversed ? a : Math.max(a, u.t)), 0) || null;
  function lotExpiry(lot, lastUsedAt) { return Math.max(lot.t, lastUsedAt || 0) + REWARDS.validityDays * DAY_MS; }

  /** Lapse every lot whose validity has run out by `now`. Returns lapsed amounts by kind. */
  function sweepRewards(acct, now = Date.now()) {
    const last = lastUseAt(acct), out = { points: 0, cashback: 0 };
    acct.lots.forEach((l) => {
      if (l.remaining <= 0) return;
      const exp = lotExpiry(l, last);
      if (now < exp) return;
      out[l.kind] = round2(out[l.kind] + l.remaining);
      acct.log.unshift({ t: exp, type: 'lapsed', kind: l.kind, amount: l.remaining, note: `Lapsed: unused for ${REWARDS.validityDays} days (${l.note})` });
      l.remaining = 0; l.lapsedAt = exp;
    });
    return out;
  }
  function creditReward(acct, kind, amount, now = Date.now(), note = '', ref = null) {
    amount = round2(amount);
    if (!(amount > 0) || !REWARDS.kinds.includes(kind)) return null;
    sweepRewards(acct, now);
    const lot = { id: 'L' + now.toString(36) + acct.lots.length, kind, amount, remaining: amount, t: now, note, ref };
    acct.lots.push(lot);
    acct.log.unshift({ t: now, type: 'credit', kind, amount, note, ref });
    return lot;
  }
  function rewardBalance(acct, now = Date.now()) {
    const last = lastUseAt(acct), b = { points: 0, cashback: 0 };
    acct.lots.forEach((l) => { if (l.remaining > 0 && now < lotExpiry(l, last)) b[l.kind] = round2(b[l.kind] + l.remaining); });
    return b;
  }
  /**
   * Redeem `amount` (₹, 1 point = ₹1) from rewards: points first, then
   * cashback, oldest lot first. Any redemption counts as a use and carries
   * all remaining lots forward.
   */
  function redeemRewards(acct, amount, now = Date.now(), note = '', ref = null) {
    amount = round2(amount);
    if (!(amount > 0)) return null;
    sweepRewards(acct, now);
    const bal = rewardBalance(acct, now);
    if (amount > round2(bal.points + bal.cashback) + 1e-9) throw new Error('Not enough rewards balance');
    const lots = acct.lots.filter((l) => l.remaining > 0).sort((a, b) => REWARDS.kinds.indexOf(a.kind) - REWARDS.kinds.indexOf(b.kind) || a.t - b.t);
    const alloc = []; let left = amount;
    for (const l of lots) {
      if (left <= 0) break;
      const take = round2(Math.min(l.remaining, left));
      l.remaining = round2(l.remaining - take); left = round2(left - take);
      alloc.push({ lot: l.id, kind: l.kind, amount: take });
    }
    const use = { id: 'U' + now.toString(36) + acct.uses.length, t: now, amount, alloc, note, ref, reversed: false };
    acct.uses.push(use);
    acct.log.unshift({ t: now, type: 'used', kind: alloc.map((a) => a.kind).filter((k, i, a) => a.indexOf(k) === i).join('+'), amount, note, ref });
    return use;
  }
  /** Give back a redemption (order cancelled or returned). It stops counting as a use. */
  function reverseRedemption(acct, ref, now = Date.now()) {
    const use = acct.uses.find((u) => u.ref === ref && !u.reversed);
    if (!use) return 0;
    use.reversed = true;
    let back = 0;
    use.alloc.forEach((a) => { const l = acct.lots.find((x) => x.id === a.lot); if (l && !l.lapsedAt) { l.remaining = round2(l.remaining + a.amount); back = round2(back + a.amount); } });
    acct.log.unshift({ t: now, type: 'restored', kind: use.alloc.map((a) => a.kind).join('+'), amount: back, note: 'Restored: order cancelled or returned', ref });
    sweepRewards(acct, now); // restored lots keep their own dates and may already be past validity
    return back;
  }
  /** Balances plus the next lapse, for display. */
  function rewardSummary(acct, now = Date.now()) {
    const last = lastUseAt(acct), bal = rewardBalance(acct, now);
    const live = acct.lots.filter((l) => l.remaining > 0 && now < lotExpiry(l, last)).map((l) => ({ ...l, expires: lotExpiry(l, last) })).sort((a, b) => a.expires - b.expires);
    const next = live[0] ? { t: live[0].expires, amount: round2(live.filter((l) => l.expires === live[0].expires).reduce((a, l) => a + l.remaining, 0)) } : null;
    return { ...bal, lastUsedAt: last, next, lots: live };
  }

  /* ----------------------------------------------------- company simulator
   * Mirrors the "TrueShop 70% BV Simulator" sheet exactly, then enforces the
   * 70% hard cap (scales every stream pro-rata if inputs ever push above it).
   */
  function companySimulation({ joinings, firstOrderDP, bvRatio, repurchaseMembers, repurchaseDP, rates }) {
    const firstTurnover = joinings * firstOrderDP;
    const firstBV = firstTurnover * bvRatio;
    const repTurnover = repurchaseMembers * repurchaseDP;
    const repBV = repTurnover * bvRatio;
    const totalBV = firstBV + repBV;
    const bases = { total: totalBV, first: firstBV, repurchase: repBV };

    let rows = INCOME_STREAMS.map((s) => {
      const rate = rates && rates[s.key] != null ? rates[s.key] : s.actual;
      const baseBV = bases[s.base];
      return { ...s, rate, baseBV, payout: round2(rate * baseBV) };
    });
    let total = rows.reduce((a, r) => a + r.payout, 0);
    let scaled = false;
    if (totalBV > 0 && total / totalBV > HARD_CAP) {
      const factor = (HARD_CAP * totalBV) / total;
      rows = rows.map((r) => ({ ...r, payout: round2(r.payout * factor) }));
      total = HARD_CAP * totalBV;
      scaled = true;
    }
    return {
      firstTurnover, firstBV, repTurnover, repBV, totalBV, totalTurnover: firstTurnover + repTurnover,
      rows, totalPayout: round2(total),
      payoutRatio: totalBV ? total / totalBV : 0,
      retention: round2(totalBV - total),
      retentionRatio: totalBV ? 1 - total / totalBV : 0,
      scaled,
    };
  }

  global.TrueShopPlan = {
    get BINARY_RATE() { return BINARY_RATE; }, get GENERATION_LEVELS() { return GENERATION_LEVELS; },
    get DIRECT_RATE() { return DIRECT_RATE; }, get CASHBACK_RATE() { return CASHBACK_RATE; },
    OVERRIDE_KEY, DEFAULTS, effectiveOutflow, applyOverrides, currentSettings,
    COMPANY, CATEGORIES, INCOME_STREAMS, STREAM_COLORS, RETAINED_COLOR, HARD_CAP, HEADLINE_TOTAL, LEADERSHIP_RATE, CTO_POOLS, PACKAGES, WALLET_SPLIT, DEDUCTIONS, STEPS,
    ESCROW_DAYS, BUYBACK_DAYS, RANKS, DAY_MS, REWARDS,
    newRewards, lotExpiry, sweepRewards, creditReward, rewardBalance, redeemRewards, reverseRedemption, rewardSummary, lastUseAt,
    round2, inr, num, pct,
    productBV, priceCart, binaryClosing, generationIncome, leadershipMatch, rankFor, splitCommission,
    stepsToPoints, companySimulation,
  };
})(typeof window !== 'undefined' ? window : globalThis);
