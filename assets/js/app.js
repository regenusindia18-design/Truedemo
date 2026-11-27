/* =========================================================================
 * TrueShop shared app shell: header/footer, demo state (localStorage),
 * toasts, modals, scroll-reveal and animated counters.
 * ========================================================================= */
(function () {
  'use strict';
  const P = window.TrueShopPlan;
  const STORE_KEY = 'trueshop-demo-v1';

  /* ------------------------------------------------------------ state */
  const DAY = 86400000;
  function defaultState() {
    return {
      member: { id: 'TS10248', name: 'Aarav Deshmukh', package: 'pro', kyc: { pan: true, aadhaar: true, bank: false }, joined: Date.now() - 120 * DAY },
      cart: [],
      orders: [],
      wallets: { payout: 18450, repurchase: 2050 },
      rewards: seedRewards(),
      ledger: [
        { t: Date.now() - 6 * DAY, type: 'Binary', note: 'Week 46 closing · 9,500 BV matched', amount: 3800 },
        { t: Date.now() - 9 * DAY, type: 'Direct', note: 'Referral booster · Priya K. first order', amount: 250 },
        { t: Date.now() - 13 * DAY, type: 'Binary', note: 'Week 45 closing · 12,000 BV matched', amount: 4800 },
      ],
      binary: { carryLeft: 4200, carryRight: 0, cumLeft: 62400, cumRight: 54100, week: 47, pendingLeft: 7800, pendingRight: 6300 },
      steps: { today: 3260, history: [8200, 10450, 6100, 12030, 5400, 9800] , lastSync: null },
    };
  }
  // Cashback + TruePoints are kept as dated lots (see TrueShopPlan rewards engine)
  function seedRewards() {
    const r = P.newRewards(), now = Date.now();
    P.creditReward(r, 'points', 40, now - 56 * DAY, 'TrueSteps: 20,000 steps');
    P.creditReward(r, 'cashback', 180, now - 52 * DAY, '5% cashback on ORD8841207');
    P.creditReward(r, 'points', 100, now - 9 * DAY, 'TrueSteps: 50,000 steps');
    P.creditReward(r, 'cashback', 132, now - 12 * DAY, '5% cashback on ORD8842391');
    return r;
  }
  function migrate(s) {
    if (!s.rewards) { // older saves held plain balances: keep them as fresh lots
      s.rewards = P.newRewards();
      P.creditReward(s.rewards, 'points', s.wallets.points || 0, Date.now(), 'Balance carried over');
      P.creditReward(s.rewards, 'cashback', s.wallets.cashback || 0, Date.now(), 'Balance carried over');
      delete s.wallets.points; delete s.wallets.cashback;
    }
    if (s.steps.claimedOn == null && s.steps.claimedToday) s.steps.claimedOn = new Date().toDateString();
    delete s.steps.claimedToday;
    return s;
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s && s.member) return migrate(s); } catch (e) {}
    return defaultState();
  }
  let state = load();
  P.sweepRewards(state.rewards); // lapse anything past its validity
  window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) state = load(); });
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} updateCartBadge(); }
  const rewards = () => { P.sweepRewards(state.rewards); return P.rewardSummary(state.rewards); };

  /* ------------------------------------------------------------ admin "view as member"
   * Set only from the admin panel (after its permission check) and only
   * honoured inside a signed-in admin browser session. Read-only. */
  const VIEW_KEY = 'trueshop-view-member';
  function viewAs() {
    try {
      const id = sessionStorage.getItem(VIEW_KEY);
      if (!id) return null;
      if (sessionStorage.getItem('trueshop-admin-session') !== '1') { sessionStorage.removeItem(VIEW_KEY); return null; }
      return id;
    } catch (e) { return null; }
  }
  function setViewAs(id) { try { id ? sessionStorage.setItem(VIEW_KEY, id) : sessionStorage.removeItem(VIEW_KEY); } catch (e) {} }
  function reset() { state = defaultState(); save(); try { localStorage.removeItem('trueshop-admin-v1'); } catch (e) {} } // admin data holds this member's orders too

  /* ------------------------------------------------------------ helpers */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg, ms = 2800) {
    let host = $('.toast-host');
    if (!host) { host = document.createElement('div'); host.className = 'toast-host'; document.body.appendChild(host); }
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = msg; host.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  }

  function modal(title, bodyHTML, onMount) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${title}<button class="x" aria-label="Close">×</button></h3><div class="modal-body">${bodyHTML}</div></div>`;
    const close = () => back.remove();
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    $('.x', back).onclick = close;
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
    document.body.appendChild(back);
    onMount && onMount($('.modal-body', back), close);
    return close;
  }

  /** Animate numbers in elements with [data-count] (value) and optional data-prefix/suffix */
  function animateCount(el, to, { prefix = '', suffix = '', dur = 1200, fmt } = {}) {
    const from = 0; const start = performance.now();
    const format = fmt || ((v) => prefix + Math.round(v).toLocaleString('en-IN') + suffix);
    function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = format(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function initReveal() {
    const els = $$('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target; el.classList.add('in');
        if (el.dataset.count != null) animateCount(el, +el.dataset.count, { prefix: el.dataset.prefix || '', suffix: el.dataset.suffix || '' });
        $$('[data-count]', el).forEach((c) => animateCount(c, +c.dataset.count, { prefix: c.dataset.prefix || '', suffix: c.dataset.suffix || '' }));
        $$('.bar > i[data-w]', el).forEach((b) => (b.style.width = b.dataset.w));
        io.unobserve(el);
      });
    }, { threshold: 0.15 });
    els.forEach((e) => io.observe(e));
  }

  /* ------------------------------------------------------------ chrome */
  const NAV = [
    ['index.html', 'Home'], ['plan.html', 'Business Plan'], ['shop.html', 'Shop'], ['clinics.html', 'Stores & Doctors'],
    ['dashboard.html', 'My Dashboard'], ['simulator.html', 'Simulator'], ['compliance.html', 'Compliance'],
  ];
  function header() {
    const here = (location.pathname.split('/').pop() || 'index.html');
    const links = NAV.map(([h, l]) => `<a href="${h}" class="${h === here ? 'active' : ''}">${l}</a>`).join('');
    return `<header class="topbar"><div class="container">
      <a class="logo" href="index.html"><span class="logo-mark">T</span>TRUESHOP</a>
      <button class="menu-btn" aria-label="Menu">☰</button>
      <nav class="nav">${links}<a href="shop.html#cart" class="nav-cart" aria-label="Cart">🛒<span class="badge-count" id="cartCount">0</span></a></nav>
    </div></header>`;
  }
  function footer() {
    return `<footer class="site"><div class="container">
      <div class="cols">
        <div><div class="logo" style="margin-bottom:10px"><span class="logo-mark">T</span>TRUESHOP</div>
          <p>${P.COMPANY.tagline}. E-commerce + direct selling platform by <b>${P.COMPANY.name}</b>, established ${P.COMPANY.established}, ${P.COMPANY.state}.</p></div>
        <div><b style="color:#fff">Explore</b><br>${NAV.map(([h, l]) => `<a href="${h}">${l}</a>`).join('<br>')}</div>
        <div><b style="color:#fff">Member promise</b><br>Free registration · Zero joining fee<br>KYC before payout<br>7-day return escrow<br>30-day buyback</div>
      </div>
      <div class="legal">Demo prototype — all figures, members and transactions are simulated for illustration. Earnings depend entirely on genuine product sales; no income is guaranteed. Total payout is capped at 70% of BV in line with the Consumer Protection (Direct Selling) Rules, 2021.
      <span style="float:right"><a href="admin.html">Admin panel (demo)</a> · <a href="#" id="resetDemo">Reset demo data</a></span></div>
    </div></footer>`;
  }
  function updateCartBadge() {
    const c = document.getElementById('cartCount');
    if (c) c.textContent = state.cart.reduce((s, i) => s + i.qty, 0);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.classList.contains('admin')) return; // admin panel has its own chrome
    document.body.insertAdjacentHTML('afterbegin', header());
    const va = viewAs();
    if (va) {
      const m = window.AdminDB && AdminDB.db.members.find((x) => x.id === va);
      $('.topbar').insertAdjacentHTML('afterend', `<div class="viewas-bar"><div class="container"><span>👁 Admin view as <b>${esc(m ? m.name : va)}</b> (${esc(va)}) · read-only. My Dashboard and My orders show this member.</span><button class="btn btn-sm" id="exitViewAs">Exit view as</button></div></div>`);
      $('#exitViewAs').onclick = () => { if (window.AdminDB) AdminDB.log(`Stopped viewing as member ${va}`); setViewAs(null); location.href = 'admin.html#members'; };
    }
    document.body.insertAdjacentHTML('beforeend', footer());
    $('.menu-btn').onclick = () => $('.nav').classList.toggle('open');
    $('#resetDemo').onclick = (e) => { e.preventDefault(); reset(); toast('Demo data reset'); setTimeout(() => location.reload(), 600); };
    updateCartBadge();
    initReveal();
  });

  window.TS = {
    get state() { return state; }, save, reset, $, $$, esc, toast, modal, animateCount, initReveal, updateCartBadge, DAY,
    rewards, viewAs, setViewAs,
  };
})();
