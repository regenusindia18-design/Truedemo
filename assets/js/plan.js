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
    { key: 'cashback',   name: 'Smart Shopper Cashback',   phase: 'Self Purchase',  headline: '5% BV',            actual: 0.05, base: 'total',      rule: 'Credited to Cashback Wallet (45-day validity, 0 BV on use)' },
    { key: 'direct',     name: 'Direct Referral Booster',  phase: 'First Purchase', headline: '10% BV',           actual: 0.10, base: 'first',      rule: 'Instant direct sponsor commission on first order BV' },
    { key: 'binary',     name: 'Flash Binary Matching',    phase: 'First Purchase', headline: '40% Matching BV',  actual: 0.20, base: 'first',      rule: '1:1 pair matching (1000L:1000R = ₹400); power-leg carry forward' },
    { key: 'generation', name: 'Repurchase Generation',    phase: 'Monthly Repeat', headline: '20% BV',           actual: 0.20, base: 'repurchase', rule: '6 levels: L1 7%, L2 4%, L3 3%, L4 2%, L5 2%, L6 2%' },
    { key: 'leadership', name: 'Leadership Check Match',   phase: 'Team Earning',   headline: '10% Downline Income', actual: 0.05, base: 'total',   rule: "10% of direct downline's earned Binary & Generation bonus" },
    { key: 'cto',        name: 'CTO Royalty & Lifestyle',  phase: 'Leadership Pool', headline: '10% CTO BV',      actual: 0.10, base: 'total',      rule: 'Bronze Club 4%, Travel & Car Pool 3%, Crown Royalty 3%' },
  ];
  const HARD_CAP = 0.70;          // 70% of total BV — absolute ceiling
  const HEADLINE_TOTAL = 0.95;    // brochure figure (see compliance note)

  const BINARY_RATE = 0.40;       // on matched weaker-leg BV
  const GENERATION_LEVELS = [0.07, 0.04, 0.03, 0.02, 0.02, 0.02];
  const DIRECT_RATE = 0.10;
  const CASHBACK_RATE = 0.05;
  const LEADERSHIP_RATE = 0.10;
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
  const STEPS = { stepsPerBlock: 5000, pointsPerBlock: 10, rupeePerPoint: 1, maxCartShare: 0.10, expiryDays: 45 };
  const ESCROW_DAYS = 7;
  const BUYBACK_DAYS = 30;

  /* 3. Ranks */
  const RANKS = [
    { key: 'bronze',  name: 'Bronze Star',      match: 10000,   pool: '4% Bronze CTO Pool',              poolKey: 'bronze', shares: 1, reward: '₹2,500 TrueShop Shopping Voucher', color: '#cd7f32' },
    { key: 'silver',  name: 'Silver Achiever',  match: 50000,   pool: '3% Travel & Car Pool (1× share)',  poolKey: 'travel', shares: 1, reward: 'Domestic Leisure Trip (Goa / Manali)', color: '#9ca3af' },
    { key: 'gold',    name: 'Gold Director',    match: 200000,  pool: '3% Travel & Car Pool (2× shares)', poolKey: 'travel', shares: 2, reward: 'International Thailand Trip + ₹25,000 Cash', color: '#eab308' },
    { key: 'diamond', name: 'Diamond Leader',   match: 1000000, pool: '3% Crown Royalty Pool (1× share)', poolKey: 'crown',  shares: 1, reward: '₹2,50,000 Car Downpayment Fund', color: '#38bdf8' },
    { key: 'crown',   name: 'Crown Ambassador', match: 5000000, pool: '3% Crown Royalty Pool (3× shares)', poolKey: 'crown', shares: 3, reward: '₹15,00,000 Luxury Car / Villa Fund', color: '#a855f7' },
  ];

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
    COMPANY, CATEGORIES, INCOME_STREAMS, HARD_CAP, HEADLINE_TOTAL, BINARY_RATE, GENERATION_LEVELS,
    DIRECT_RATE, CASHBACK_RATE, LEADERSHIP_RATE, CTO_POOLS, PACKAGES, WALLET_SPLIT, DEDUCTIONS, STEPS,
    ESCROW_DAYS, BUYBACK_DAYS, RANKS,
    round2, inr, num, pct,
    productBV, priceCart, binaryClosing, generationIncome, leadershipMatch, rankFor, splitCommission,
    stepsToPoints, companySimulation,
  };
})(typeof window !== 'undefined' ? window : globalThis);
