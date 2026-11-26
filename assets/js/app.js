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
      wallets: { payout: 18450, repurchase: 2050, cashback: 312, points: 140 },
      ledger: [
        { t: Date.now() - 6 * DAY, type: 'Binary', note: 'Week 46 closing · 9,500 BV matched', amount: 3800 },
        { t: Date.now() - 9 * DAY, type: 'Direct', note: 'Referral booster · Priya K. first order', amount: 250 },
        { t: Date.now() - 13 * DAY, type: 'Binary', note: 'Week 45 closing · 12,000 BV matched', amount: 4800 },
      ],
      binary: { carryLeft: 4200, carryRight: 0, cumLeft: 62400, cumRight: 54100, week: 47, pendingLeft: 7800, pendingRight: 6300 },
      steps: { today: 3260, history: [8200, 10450, 6100, 12030, 5400, 9800] , lastSync: null },
    };
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s && s.member) return s; } catch (e) {}
    return defaultState();
  }
  let state = load();
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} updateCartBadge(); }
  function reset() { state = defaultState(); save(); }

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
    ['index.html', 'Home'], ['plan.html', 'Business Plan'], ['shop.html', 'Shop'],
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
      <a href="#" id="resetDemo" style="float:right">Reset demo data</a></div>
    </div></footer>`;
  }
  function updateCartBadge() {
    const c = document.getElementById('cartCount');
    if (c) c.textContent = state.cart.reduce((s, i) => s + i.qty, 0);
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('afterbegin', header());
    document.body.insertAdjacentHTML('beforeend', footer());
    $('.menu-btn').onclick = () => $('.nav').classList.toggle('open');
    $('#resetDemo').onclick = (e) => { e.preventDefault(); reset(); toast('Demo data reset'); setTimeout(() => location.reload(), 600); };
    updateCartBadge();
    initReveal();
  });

  window.TS = {
    get state() { return state; }, save, reset, $, $$, esc, toast, modal, animateCount, initReveal, updateCartBadge, DAY,
  };
})();
