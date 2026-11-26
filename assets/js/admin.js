/* =========================================================================
 * TrueShop Admin Panel
 * Hash-routed single page: dashboard, members, network, KYC, commerce,
 * payout run (with 70% cap ceiling), withdrawals, reports, ranks/CTO,
 * plan settings, support and audit log. Data: AdminDB (admin-data.js).
 * ========================================================================= */
(function () {
  'use strict';
  const P = TrueShopPlan, A = AdminDB, $ = TS.$, $$ = TS.$$, esc = TS.esc, DAY = A.DAY;
  const db = () => A.db;
  const COLORS = ['#40916c', '#2d6a4f', '#0284c7', '#7c3aed', '#ea580c', '#db2777', '#ca8a04'];
  const pkgOf = (k) => P.PACKAGES.find((p) => p.key === k);
  const fmtDate = (t) => new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const fmtDT = (t) => new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const initials = (n) => n.split(' ').map((x) => x[0]).join('').slice(0, 2);
  const avatar = (m) => `<span class="mini-av" style="background:${COLORS[m.idx % COLORS.length]}">${esc(initials(m.name))}</span>`;
  const STATUS_CHIP = { active: 'chip', inactive: 'chip chip-grey', blocked: 'chip chip-red', verified: 'chip', pending: 'chip chip-warn', rejected: 'chip chip-red', not_submitted: 'chip chip-grey',
    Pending_Escrow: 'chip chip-warn', Confirmed: 'chip', Returned: 'chip chip-red', approved: 'chip', open: 'chip chip-warn', closed: 'chip chip-grey' };
  const chip = (s) => `<span class="${STATUS_CHIP[s] || 'chip'}">${esc(String(s).replace('_', ' '))}</span>`;

  /* ======================================================= derived network */
  let NET = null;
  function computeNetwork() {
    const { members, L, R } = db();
    const n = members.length;
    const sub = new Array(n).fill(0), cnt = new Array(n).fill(0);
    const since = lastRunAt();
    const wsub = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { // children always have a higher index than their parent
      const m = members[i];
      const own = m.status === 'blocked' ? 0 : pkgOf(m.pkg).bv;
      const l = L[i], r = R[i];
      sub[i] = own + (l != null ? sub[l] : 0) + (r != null ? sub[r] : 0);
      cnt[i] = 1 + (l != null ? cnt[l] : 0) + (r != null ? cnt[r] : 0);
      wsub[i] = (m.joined > since ? own : 0) + (l != null ? wsub[l] : 0) + (r != null ? wsub[r] : 0);
    }
    NET = members.map((m, i) => {
      const lb = L[i] != null ? sub[L[i]] : 0, rb = R[i] != null ? sub[R[i]] : 0;
      return {
        left: lb, right: rb, team: cnt[i] - 1,
        leftCount: L[i] != null ? cnt[L[i]] : 0, rightCount: R[i] != null ? cnt[R[i]] : 0,
        weekL: L[i] != null ? wsub[L[i]] : 0, weekR: R[i] != null ? wsub[R[i]] : 0,
        rank: P.rankFor(lb, rb).current,
        directs: 0,
      };
    });
    members.forEach((m) => { if (m.sponsor != null) NET[m.sponsor].directs++; });
    return NET;
  }
  const lastRunAt = () => { const r = db().payoutRuns[0]; return r ? r.t : Date.now() - 7 * DAY; };
  const byId = (id) => db().members.find((m) => m.id.toLowerCase() === String(id).trim().toLowerCase());
  const totalEarned = (m) => Object.values(m.earned).reduce((a, b) => a + b, 0);

  /* ======================================================= tooltip */
  const tt = document.createElement('div'); tt.className = 'ttip'; tt.hidden = true; document.body.appendChild(tt);
  document.addEventListener('mouseover', (e) => { const el = e.target.closest('[data-tip]'); if (!el) { tt.hidden = true; return; } tt.innerHTML = el.dataset.tip; tt.hidden = false; });
  document.addEventListener('mousemove', (e) => { if (tt.hidden) return; const x = Math.min(e.clientX + 14, innerWidth - tt.offsetWidth - 8); tt.style.left = x + 'px'; tt.style.top = e.clientY - tt.offsetHeight - 10 + 'px'; });

  /* ======================================================= routing & chrome */
  const NAV = [
    ['Overview'],
    ['dashboard', '📊', 'Dashboard'],
    ['Network'],
    ['members', '👥', 'Members'],
    ['add-member', '➕', 'Add Member'],
    ['genealogy', '🌳', 'Genealogy Tree'],
    ['kyc', '🪪', 'KYC Approvals', () => db().members.filter((m) => m.kyc === 'pending').length],
    ['Commerce'],
    ['orders', '📦', 'Orders & Escrow', () => db().orders.filter((o) => o.status === 'Pending_Escrow').length],
    ['products', '🏷️', 'Products & BV'],
    ['Finance'],
    ['payout', '⚡', 'Weekly Payout Run'],
    ['withdrawals', '🏦', 'Withdrawals', () => db().withdrawals.filter((w) => w.status === 'pending').length],
    ['reports', '📈', 'Income Reports'],
    ['ranks', '🏆', 'Ranks & CTO Pools'],
    ['System'],
    ['settings', '⚙️', 'Plan Settings'],
    ['tickets', '💬', 'Support Tickets', () => db().tickets.filter((t) => t.status === 'open').length],
    ['audit', '🧾', 'Audit Log'],
  ];
  const VIEWS = {};
  function renderNav(active) {
    $('#sideNav').innerHTML = NAV.map(([k, ic, label, count]) => {
      if (!ic) return `<div class="grp">${k}</div>`;
      const c = count ? count() : 0;
      return `<a href="#${k}" class="${k === active ? 'active' : ''}"><span class="ic">${ic}</span>${label}${c ? `<span class="cnt">${c}</span>` : ''}</a>`;
    }).join('');
    const pend = db().members.filter((m) => m.kyc === 'pending').length + db().withdrawals.filter((w) => w.status === 'pending').length + db().tickets.filter((t) => t.status === 'open').length;
    $('#notifCount').textContent = pend || '';
  }
  function route() {
    const key = (location.hash.slice(1) || 'dashboard').split('?')[0];
    const view = VIEWS[key] || VIEWS.dashboard;
    computeNetwork();
    renderNav(VIEWS[key] ? key : 'dashboard');
    const item = NAV.find((n) => n[0] === key) || NAV[1];
    $('#crumbs').textContent = item[2];
    const fresh = document.createElement('main'); // fresh element so view handlers never leak between routes
    fresh.className = 'content'; fresh.id = 'view';
    $('#view').replaceWith(fresh);
    view(fresh);
    $('#side').classList.remove('open'); $('#scrim').classList.remove('open');
    window.scrollTo(0, 0);
  }
  const rerender = () => route();
  const head = (title, sub, actions = '') => `<div class="card-h" style="margin-bottom:0"><h1>${title}</h1><div class="acts">${actions}</div></div><p class="page-sub">${sub}</p>`;
  const kpi = (icon, label, value, sub = '', cls = '') => `<div class="card stat-tile kpi"><div class="ic">${icon}</div><div class="label">${label}</div><div class="value">${value}</div><div class="sub ${cls}">${sub}</div></div>`;

  function downloadCSV(name, rows) {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    TS.toast('⬇️ ' + name + ' exported');
  }

  /* ======================================================= DASHBOARD */
  VIEWS.dashboard = (el) => {
    const d = db(), now = Date.now(), ms = d.members;
    const active = ms.filter((m) => m.status === 'active').length;
    const newWeek = ms.filter((m) => m.joined > now - 7 * DAY).length;
    const prevWeek = ms.filter((m) => m.joined > now - 14 * DAY && m.joined <= now - 7 * DAY).length;
    const o30 = d.orders.filter((o) => o.t > now - 30 * DAY && o.status !== 'Returned');
    const turnover = o30.reduce((a, o) => a + o.paid, 0);
    const bv30 = o30.reduce((a, o) => a + o.bv, 0);
    const escrowBV = d.orders.filter((o) => o.status === 'Pending_Escrow').reduce((a, o) => a + o.bv, 0);
    const wdPending = d.withdrawals.filter((w) => w.status === 'pending');
    const paidOut = ms.reduce((a, m) => a + totalEarned(m), 0);
    const delta = prevWeek ? Math.round(((newWeek - prevWeek) / prevWeek) * 100) : 100;

    // joinings per day, last 30 days
    const days = Array.from({ length: 30 }, (_, i) => { const s = new Date(now - (29 - i) * DAY); s.setHours(0, 0, 0, 0); return { t: s.getTime(), n: 0 }; });
    ms.forEach((m) => { const k = days.findIndex((x) => m.joined >= x.t && m.joined < x.t + DAY); if (k >= 0) days[k].n++; });
    const maxJ = Math.max(4, ...days.map((x) => x.n)), top = Math.ceil(maxJ / 4) * 4;

    const streams = ['direct', 'binary', 'generation', 'leadership', 'cto'].map((k) => [k, ms.reduce((a, m) => a + m.earned[k], 0)]);
    const maxS = Math.max(1, ...streams.map((s) => s[1]));
    const pkgMix = P.PACKAGES.map((p) => [p.name, ms.filter((m) => m.pkg === p.key).length]);
    const topEarners = ms.slice(1).sort((a, b) => totalEarned(b) - totalEarned(a)).slice(0, 6);
    const recent = ms.slice().sort((a, b) => b.joined - a.joined).slice(0, 7);

    el.innerHTML = head('Dashboard', `Live overview of the TrueShop network · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
      `<a href="#payout" class="btn btn-gold btn-sm">⚡ Run weekly payout</a>`) + `
      <div class="kpi-grid">
        ${kpi('👥', 'Total members', P.num(ms.length), `${P.num(active)} active · ${P.num(ms.length - active)} inactive`)}
        ${kpi('🆕', 'New this week', P.num(newWeek), `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs last week`, delta >= 0 ? 'up' : 'down')}
        ${kpi('💰', 'Turnover (30 days)', P.inr(turnover), `${P.num(o30.length)} orders`)}
        ${kpi('📊', 'BV generated (30 days)', P.num(bv30), `${P.num(escrowBV)} BV still in escrow`)}
        ${kpi('🪪', 'KYC pending', P.num(ms.filter((m) => m.kyc === 'pending').length), '<a href="#kyc">Review queue →</a>')}
        ${kpi('🏦', 'Withdrawals pending', P.inr(wdPending.reduce((a, w) => a + w.amount, 0)), `${wdPending.length} requests · <a href="#withdrawals">review</a>`)}
        ${kpi('🎯', 'Commissions to date', P.inr(paidOut), 'all streams, all members')}
        ${kpi('💬', 'Open tickets', P.num(d.tickets.filter((t) => t.status === 'open').length), '<a href="#tickets">Support desk →</a>')}
      </div>

      <div class="panel-grid">
        <div class="card">
          <div class="card-h"><h3>New joinings: last 30 days</h3><span class="small muted">${P.num(days.reduce((a, x) => a + x.n, 0))} total</span></div>
          <div class="vbars">${[0.5, 1].map((f) => `<div class="gl" style="bottom:${f * 100}%"><span>${top * f}</span></div>`).join('')}
            ${days.map((x) => `<div class="b" style="height:${(x.n / top) * 100}%" data-tip="<b>${fmtDate(x.t)}</b><br>${x.n} new member${x.n === 1 ? '' : 's'}"></div>`).join('')}</div>
          <div class="vx">${days.map((x, i) => `<span>${i % 5 === 0 ? fmtDate(x.t) : ''}</span>`).join('')}</div>
        </div>
        <div class="card">
          <h3>Package mix</h3>
          ${pkgMix.map(([n, c], i) => `<div class="hbar"><span>${n}</span><div class="track"><i style="width:${(c / ms.length) * 100}%;background:${['#40916c', '#0284c7', '#ca8a04'][i]}"></i></div><b class="num" style="text-align:right">${c} · ${Math.round((c / ms.length) * 100)}%</b></div>`).join('')}
          <h3 style="margin-top:18px">KYC status</h3>
          ${['verified', 'pending', 'rejected', 'not_submitted'].map((k) => { const c = ms.filter((m) => m.kyc === k).length; return `<div class="row"><span>${chip(k)}</span><b>${c}</b></div>`; }).join('')}
        </div>
      </div>

      <div class="panel-grid even">
        <div class="card">
          <div class="card-h"><h3>Commissions by income stream</h3><a href="#reports" class="small">Reports →</a></div>
          ${streams.map(([k, v]) => { const s = P.INCOME_STREAMS.find((x) => x.key === k); const i = P.INCOME_STREAMS.indexOf(s); return `<div class="hbar"><span>${s.name}</span><div class="track"><i style="width:${(v / maxS) * 100}%;background:${P.STREAM_COLORS[i]}"></i></div><b class="num" style="text-align:right">${P.inr(v)}</b></div>`; }).join('')}
        </div>
        <div class="card">
          <div class="card-h"><h3>Top earners</h3><a href="#reports" class="small">All →</a></div>
          <div class="table-wrap" style="box-shadow:none"><table class="dt"><tbody>${topEarners.map((m) => `<tr><td>${avatar(m)}<a href="#" data-prof="${m.id}">${esc(m.name)}</a><div class="tiny muted" style="margin-left:38px">${m.id} · ${NET[m.idx].rank ? NET[m.idx].rank.name : 'Unranked'}</div></td><td class="r num"><b>${P.inr(totalEarned(m))}</b></td></tr>`).join('')}</tbody></table></div>
        </div>
      </div>

      <div class="panel-grid">
        <div class="card">
          <div class="card-h"><h3>Recent joinings</h3><a href="#members" class="small">All members →</a></div>
          <div class="table-wrap" style="box-shadow:none"><table class="dt"><thead><tr><th>Member</th><th>Sponsor</th><th>Placement</th><th>Package</th><th>Joined</th></tr></thead><tbody>
          ${recent.map((m) => `<tr><td>${avatar(m)}<a href="#" data-prof="${m.id}">${esc(m.name)}</a></td><td class="small">${m.sponsor != null ? db().members[m.sponsor].id : '—'}</td><td class="small">${m.parent != null ? `${db().members[m.parent].id} · ${m.leg === 'L' ? 'Left' : 'Right'}` : '—'}</td><td>${pkgOf(m.pkg).name}</td><td class="small">${fmtDT(m.joined)}</td></tr>`).join('')}
          </tbody></table></div>
        </div>
        <div class="card">
          <div class="card-h"><h3>Recent activity</h3><a href="#audit" class="small">Audit log →</a></div>
          <div class="timeline-log">${d.audit.slice(0, 7).map((a) => `<div><time>${fmtDT(a.t)}</time><span>${esc(a.msg)}</span></div>`).join('')}</div>
        </div>
      </div>`;
  };

  /* ======================================================= MEMBER PROFILE */
  function profile(m) {
    const n = NET[m.idx], sp = m.sponsor != null ? db().members[m.sponsor] : null, pa = m.parent != null ? db().members[m.parent] : null;
    TS.modal(`${esc(m.name)} <span class="chip chip-gold" style="margin-left:8px">${m.id}</span>`, `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${chip(m.status)} ${chip(m.kyc)} <span class="chip chip-blue">${pkgOf(m.pkg).name}</span> ${n.rank ? `<span class="chip" style="background:${n.rank.color};color:#fff">${n.rank.name}</span>` : ''}</div>
      <div class="row"><span>City · Phone</span><b>${esc(m.city)} · ${esc(m.phone)}</b></div>
      <div class="row"><span>Joined</span><b>${fmtDT(m.joined)}</b></div>
      <div class="row"><span>Sponsor</span><b>${sp ? `${esc(sp.name)} (${sp.id})` : '—'}</b></div>
      <div class="row"><span>Placement</span><b>${pa ? `${pa.id} · ${m.leg === 'L' ? 'Left' : 'Right'} leg` : 'Root'}</b></div>
      <div class="row"><span>Team · Directs</span><b>${n.team} (${n.leftCount} L / ${n.rightCount} R) · ${n.directs} directs</b></div>
      <div class="row"><span>Cumulative BV L : R</span><b>${P.num(n.left)} : ${P.num(n.right)}</b></div>
      <div class="row"><span>Carry forward L : R</span><b>${P.num(m.carryL)} : ${P.num(m.carryR)}</b></div>
      <div class="row"><span>Total earned</span><b>${P.inr(totalEarned(m))}</b></div>
      <div class="row"><span>Payout · Repurchase wallet</span><b>${P.inr(m.wallet.payout)} · ${P.inr(m.wallet.repurchase)}</b></div>
      <div class="acts" style="margin-top:14px">
        <button class="btn btn-green btn-sm" id="pfTree">🌳 View tree</button>
        ${m.idx ? `<button class="btn btn-ghost btn-sm" id="pfBlock">${m.status === 'blocked' ? 'Unblock' : '⛔ Block'}</button>` : ''}
        ${m.idx && m.kyc === 'pending' ? '<button class="btn btn-gold btn-sm" id="pfKyc">Approve KYC</button>' : ''}
      </div>`, (body, close) => {
      $('#pfTree', body).onclick = () => { close(); treeRoot = m.idx; location.hash = 'genealogy'; if (location.hash === '#genealogy') rerender(); };
      const b = $('#pfBlock', body);
      if (b) b.onclick = () => { m.status = m.status === 'blocked' ? 'active' : 'blocked'; A.log(`Admin ${m.status === 'blocked' ? 'blocked' : 'unblocked'} ${m.id}`); A.save(); close(); TS.toast(`${m.id} ${m.status}`); rerender(); };
      const k = $('#pfKyc', body);
      if (k) k.onclick = () => { m.kyc = 'verified'; A.log(`KYC approved for ${m.id}`); A.save(); close(); TS.toast('✅ KYC approved'); rerender(); };
    });
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-prof]'); if (!a) return;
    e.preventDefault(); const m = byId(a.dataset.prof); if (m) { computeNetwork(); profile(m); }
  });

  /* ======================================================= MEMBERS */
  const mf = { q: '', status: '', kyc: '', pkg: '', page: 0, sort: 'joined' };
  VIEWS.members = (el) => {
    el.innerHTML = head('Members', 'Search, filter and manage every distributor and customer ID.', '<button class="btn btn-ghost btn-sm" id="mCsv">⬇ Export CSV</button><a href="#add-member" class="btn btn-green btn-sm">➕ Add member</a>') + `
      <div class="toolbar">
        <input class="input grow" id="mq" placeholder="Search ID, name or city" value="${esc(mf.q)}">
        <select class="input" id="mstatus"><option value="">All statuses</option><option>active</option><option>inactive</option><option>blocked</option></select>
        <select class="input" id="mkyc"><option value="">All KYC</option><option value="verified">verified</option><option value="pending">pending</option><option value="rejected">rejected</option><option value="not_submitted">not submitted</option></select>
        <select class="input" id="mpkg"><option value="">All packages</option>${P.PACKAGES.map((p) => `<option value="${p.key}">${p.name}</option>`).join('')}</select>
        <select class="input" id="msort"><option value="joined">Newest first</option><option value="team">Largest team</option><option value="earned">Top earners</option></select>
      </div>
      <div class="table-wrap"><table class="dt"><thead><tr><th>Member</th><th>Sponsor</th><th>Package</th><th class="r">Team</th><th class="r">BV L : R</th><th>Rank</th><th>KYC</th><th>Status</th><th class="r">Earned</th><th></th></tr></thead><tbody id="mbody"></tbody></table></div>
      <div class="pager" id="mpager"></div>`;
    ['status', 'kyc', 'pkg', 'sort'].forEach((k) => { $('#m' + k).value = mf[k]; $('#m' + k).onchange = (e) => { mf[k] = e.target.value; mf.page = 0; draw(); }; });
    $('#mq').oninput = (e) => { mf.q = e.target.value; mf.page = 0; draw(); };
    const filtered = () => {
      const q = mf.q.toLowerCase();
      let rows = db().members.filter((m) => (!q || (m.id + ' ' + m.name + ' ' + m.city).toLowerCase().includes(q)) && (!mf.status || m.status === mf.status) && (!mf.kyc || m.kyc === mf.kyc) && (!mf.pkg || m.pkg === mf.pkg));
      const key = { joined: (m) => -m.joined, team: (m) => -NET[m.idx].team, earned: (m) => -totalEarned(m) }[mf.sort];
      return rows.sort((a, b) => key(a) - key(b));
    };
    $('#mCsv').onclick = () => downloadCSV('trueshop-members.csv', [['ID', 'Name', 'City', 'Sponsor', 'Package', 'Team', 'Left BV', 'Right BV', 'Rank', 'KYC', 'Status', 'Earned', 'Joined']]
      .concat(filtered().map((m) => [m.id, m.name, m.city, m.sponsor != null ? db().members[m.sponsor].id : '', pkgOf(m.pkg).name, NET[m.idx].team, NET[m.idx].left, NET[m.idx].right, NET[m.idx].rank ? NET[m.idx].rank.name : '', m.kyc, m.status, totalEarned(m), new Date(m.joined).toISOString()])));
    function draw() {
      const rows = filtered(), per = 15, pages = Math.max(1, Math.ceil(rows.length / per));
      mf.page = Math.min(mf.page, pages - 1);
      const slice = rows.slice(mf.page * per, mf.page * per + per);
      $('#mbody').innerHTML = slice.length ? slice.map((m) => { const n = NET[m.idx]; return `<tr>
        <td style="white-space:nowrap">${avatar(m)}<a href="#" data-prof="${m.id}"><b>${esc(m.name)}</b></a><div class="tiny muted" style="margin-left:38px">${m.id} · ${esc(m.city)}</div></td>
        <td class="small">${m.sponsor != null ? db().members[m.sponsor].id : '—'}</td><td class="small">${pkgOf(m.pkg).name}</td>
        <td class="r num">${n.team}</td><td class="r num small">${P.num(n.left)} : ${P.num(n.right)}</td>
        <td class="small">${n.rank ? `<span style="color:${n.rank.color};font-weight:700">●</span> ${n.rank.name}` : '<span class="muted">—</span>'}</td>
        <td>${chip(m.kyc)}</td><td>${chip(m.status)}</td><td class="r num">${P.inr(totalEarned(m))}</td>
        <td><button class="btn btn-ghost btn-sm" data-prof="${m.id}">View</button></td></tr>`; }).join('') : '<tr><td colspan="10" class="empty">No members match these filters.</td></tr>';
      $('#mpager').innerHTML = `<span>Showing ${rows.length ? mf.page * per + 1 : 0}–${Math.min(rows.length, (mf.page + 1) * per)} of ${rows.length}</span>
        <span class="acts"><button class="btn btn-ghost btn-sm" id="pv" ${mf.page ? '' : 'disabled'}>← Prev</button><span style="padding:6px">Page ${mf.page + 1} / ${pages}</span><button class="btn btn-ghost btn-sm" id="nx" ${mf.page < pages - 1 ? '' : 'disabled'}>Next →</button></span>`;
      $('#pv').onclick = () => { mf.page--; draw(); }; $('#nx').onclick = () => { mf.page++; draw(); };
    }
    draw();
  };

  /* ======================================================= ADD MEMBER */
  VIEWS['add-member'] = (el) => {
    el.innerHTML = head('Add Member', 'Register a new ID under a sponsor. Placement follows the extreme-leg spillover rule: the new member goes to the first open slot at the bottom of the chosen leg.') + `
      <div class="panel-grid">
        <form class="card" id="amForm">
          <div class="set-grid">
            <label class="field">Full name<input required id="amName" placeholder="e.g. Kavya Kulkarni"></label>
            <label class="field">City<input required id="amCity" placeholder="Pune"></label>
            <label class="field">Mobile<input required id="amPhone" placeholder="98XXXXXXXX" pattern="[6-9][0-9]{9}" title="10-digit Indian mobile"></label>
            <label class="field">Sponsor ID<input required id="amSp" value="${db().members[0].id}"><span class="tiny" id="amSpName"></span></label>
            <label class="field">Placement leg<select id="amLeg"><option value="L">Left</option><option value="R">Right</option></select></label>
            <label class="field">Activation package<select id="amPkg">${P.PACKAGES.map((p) => `<option value="${p.key}">${p.name}: ${P.num(p.bv)} BV (cap ${P.inr(p.weeklyCap)}/wk)</option>`).join('')}</select></label>
          </div>
          <div class="disclaimer" style="margin:6px 0 14px">Registration is free. The package is activated only by a real product order worth the BV shown.</div>
          <button class="btn btn-gold">Create member</button>
        </form>
        <div class="card"><h3>Placement preview</h3><div id="amPrev" class="small muted">Enter a sponsor ID to preview placement.</div></div>
      </div>`;
    const findSlot = (spIdx, leg) => { const K = leg === 'L' ? db().L : db().R; let node = spIdx; while (K[node] != null) node = K[node]; return node; };
    function preview() {
      const sp = byId($('#amSp').value);
      $('#amSpName').textContent = sp ? '✓ ' + sp.name : '✗ Sponsor not found';
      $('#amSpName').style.color = sp ? 'var(--green-500)' : 'var(--danger)';
      if (!sp) { $('#amPrev').textContent = 'Sponsor not found.'; return; }
      const slot = db().members[findSlot(sp.idx, $('#amLeg').value)];
      const pk = pkgOf($('#amPkg').value);
      $('#amPrev').innerHTML = `<div class="row"><span>Sponsor</span><b>${esc(sp.name)} (${sp.id})</b></div>
        <div class="row"><span>Placed under</span><b>${esc(slot.name)} (${slot.id})</b></div>
        <div class="row"><span>Position</span><b>${$('#amLeg').value === 'L' ? 'Left' : 'Right'} leg</b></div>
        <div class="row"><span>Direct referral booster to sponsor</span><b>${P.inr(pk.bv * P.DIRECT_RATE)}</b></div>
        <div class="row"><span>BV added to every upline's ${$('#amLeg').value === 'L' ? 'left' : 'right'} leg chain</span><b>${P.num(pk.bv)} BV</b></div>`;
    }
    ['amSp', 'amLeg', 'amPkg'].forEach((id) => $('#' + id).addEventListener('input', preview));
    preview();
    $('#amForm').onsubmit = (e) => {
      e.preventDefault();
      const sp = byId($('#amSp').value); if (!sp) { TS.toast('Sponsor ID not found'); return; }
      const d = db(), leg = $('#amLeg').value, parent = findSlot(sp.idx, leg), i = d.members.length;
      const m = { idx: i, id: 'TS' + (10000 + i * 7 + 241), name: $('#amName').value.trim(), city: $('#amCity').value.trim(), phone: '+91 ' + $('#amPhone').value.replace(/^(\d{2})\d{5}/, '$1•••••'),
        pkg: $('#amPkg').value, joined: Date.now(), status: 'active', kyc: 'not_submitted', parent, leg, sponsor: sp.idx, monthBV: 0,
        earned: { direct: 0, binary: 0, generation: 0, leadership: 0, cto: 0 }, wallet: { payout: 0, repurchase: 0 }, carryL: 0, carryR: 0 };
      d.members.push(m); (leg === 'L' ? d.L : d.R)[parent] = i;
      A.log(`New member ${m.id} (${m.name}) sponsored by ${sp.id}, placed ${leg === 'L' ? 'left' : 'right'} of ${d.members[parent].id}`);
      A.save(); TS.toast(`✅ ${m.id} created. Their BV will be included in the next weekly payout run.`, 4000);
      location.hash = 'members'; mf.q = m.id;
    };
  };

  /* ======================================================= GENEALOGY */
  let treeRoot = 0;
  VIEWS.genealogy = (el) => {
    const d = db(), root = d.members[treeRoot];
    el.innerHTML = head('Genealogy Tree', 'Binary placement tree, 4 levels at a time. Click a member to drill down.',
      `<input class="input" id="gtId" placeholder="Member ID" value="${root.id}" style="width:140px;margin:0"><button class="btn btn-green btn-sm" id="gtGo">Go</button>
       <button class="btn btn-ghost btn-sm" id="gtUp" ${root.parent == null ? 'disabled' : ''}>↑ Up one level</button><button class="btn btn-ghost btn-sm" id="gtTop">⤒ Top</button>`) + `
      <div class="card"><div class="tree-wrap"><ul class="tree" id="gtree"></ul></div>
      <div class="legend"><span><i style="background:var(--gold)"></i>Viewing root</span><span><i style="background:#94a3b8"></i>Inactive / blocked</span><span>Numbers: cumulative left : right BV</span></div></div>`;
    function node(i, depth) {
      if (depth > 3) return '';
      if (i == null) return `<li><span class="node empty">＋<br>Open</span></li>`;
      const m = d.members[i], n = NET[i];
      const kids = depth < 3 ? `<ul>${node(d.L[i], depth + 1)}${node(d.R[i], depth + 1)}</ul>` : '';
      return `<li><span class="node ${i === treeRoot ? 'me' : ''} ${m.status !== 'active' ? 'inactive' : ''}" data-node="${i}" data-tip="<b>${esc(m.name)}</b><br>${pkgOf(m.pkg).name} · ${n.rank ? n.rank.name : 'Unranked'}<br>Team ${n.team} · Directs ${n.directs}">
        <div class="av" style="background:${i === treeRoot ? 'var(--gold)' : COLORS[i % COLORS.length]}">${esc(initials(m.name))}</div>
        <b>${m.id}</b><div class="tiny muted">${esc(m.name.split(' ')[0])}</div><div class="tiny num">${P.num(n.left)} : ${P.num(n.right)}</div></span>${kids}</li>`;
    }
    $('#gtree').innerHTML = node(treeRoot, 0);
    const wrap = $('.tree-wrap', el); wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2; // start centred on the root
    $('#gtree').onclick = (e) => { const n = e.target.closest('[data-node]'); if (!n) return; const i = +n.dataset.node; if (i === treeRoot) { profile(d.members[i]); return; } treeRoot = i; rerender(); };
    $('#gtGo').onclick = () => { const m = byId($('#gtId').value); if (!m) { TS.toast('Member not found'); return; } treeRoot = m.idx; rerender(); };
    $('#gtUp').onclick = () => { treeRoot = root.parent; rerender(); };
    $('#gtTop').onclick = () => { treeRoot = 0; rerender(); };
  };

  /* ======================================================= KYC */
  let kycTab = 'pending';
  VIEWS.kyc = (el) => {
    const ms = db().members.slice(1);
    const list = ms.filter((m) => m.kyc === kycTab).sort((a, b) => b.joined - a.joined);
    el.innerHTML = head('KYC Approvals', 'PAN, Aadhaar and bank verification are mandatory before any payout is released (Direct Selling Rules 2021).') + `
      <div class="tabs">${['pending', 'rejected', 'not_submitted', 'verified'].map((k) => `<button data-k="${k}" class="${k === kycTab ? 'active' : ''}">${k.replace('_', ' ')} (${ms.filter((m) => m.kyc === k).length})</button>`).join('')}</div>
      <div class="table-wrap"><table class="dt"><thead><tr><th>Member</th><th>PAN</th><th>Aadhaar</th><th>Bank (penny drop)</th><th>Wallet held</th><th></th></tr></thead><tbody>
      ${list.length ? list.slice(0, 40).map((m) => { const ok = m.kyc === 'verified', pend = m.kyc === 'pending'; return `<tr>
        <td>${avatar(m)}<a href="#" data-prof="${m.id}">${esc(m.name)}</a><div class="tiny muted" style="margin-left:38px">${m.id}</div></td>
        <td class="small">${ok || pend ? `ABCPK${(m.idx * 37) % 9000 + 1000}${'DEFGH'[m.idx % 5]} ${ok ? '✅' : '📄'}` : '—'}</td>
        <td class="small">${ok || pend ? `XXXX XXXX ${String(1000 + ((m.idx * 7919) % 9000))} ${ok ? '✅' : '📄'}` : '—'}</td>
        <td class="small">${ok ? 'Verified ✅' : pend ? 'Name match 96% 🟡' : '—'}</td>
        <td class="num">${P.inr(m.wallet.payout)}</td>
        <td><div class="acts">${pend || m.kyc === 'rejected' ? `<button class="btn btn-green btn-sm" data-ok="${m.idx}">Approve</button>` : ''}${pend ? `<button class="btn btn-ghost btn-sm" data-no="${m.idx}">Reject</button>` : ''}</div></td></tr>`; }).join('') : '<tr><td colspan="6" class="empty">Queue is empty 🎉</td></tr>'}
      </tbody></table></div>`;
    $$('.tabs button', el).forEach((b) => (b.onclick = () => { kycTab = b.dataset.k; rerender(); }));
    el.onclick = (e) => {
      const ok = e.target.closest('[data-ok]'), no = e.target.closest('[data-no]');
      if (ok) { const m = db().members[+ok.dataset.ok]; m.kyc = 'verified'; A.log(`KYC approved for ${m.id}`); A.save(); TS.toast(`✅ ${m.id} verified`); rerender(); }
      if (no) {
        const m = db().members[+no.dataset.no];
        TS.modal('Reject KYC: ' + m.id, `<label class="field">Reason<select class="input" id="rr"><option>PAN name mismatch</option><option>Aadhaar image unclear</option><option>Bank account holder mismatch</option><option>Duplicate PAN</option></select></label><button class="btn btn-gold" id="rrGo" style="width:100%">Reject &amp; notify member</button>`, (b, close) => {
          $('#rrGo', b).onclick = () => { m.kyc = 'rejected'; A.log(`KYC rejected for ${m.id}: ${$('#rr', b).value}`); A.save(); close(); TS.toast('KYC rejected, member notified'); rerender(); };
        });
      }
    };
  };

  /* ======================================================= ORDERS */
  let ordTab = 'Pending_Escrow';
  VIEWS.orders = (el) => {
    const d = db(), prods = window.TS_PRODUCTS;
    const list = d.orders.filter((o) => ordTab === 'all' || o.status === ordTab);
    el.innerHTML = head('Orders & Escrow', `Order BV is held in Pending_Escrow for ${P.ESCROW_DAYS} days after delivery. Returns reverse the BV and any linked commission before payout closing.`) + `
      <div class="tabs">${['Pending_Escrow', 'Confirmed', 'Returned', 'all'].map((k) => `<button data-k="${k}" class="${k === ordTab ? 'active' : ''}">${k.replace('_', ' ')} (${k === 'all' ? d.orders.length : d.orders.filter((o) => o.status === k).length})</button>`).join('')}</div>
      <div class="table-wrap"><table class="dt"><thead><tr><th>Order</th><th>Member</th><th>Items</th><th>Payment</th><th class="r">Paid</th><th class="r">TruePoints</th><th class="r">BV</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map((o) => { const m = d.members[o.mi]; const left = Math.max(0, P.ESCROW_DAYS - (Date.now() - o.t) / DAY); return `<tr>
        <td><b>${o.id}</b><div class="tiny muted">${fmtDT(o.t)}</div></td>
        <td class="small"><a href="#" data-prof="${m.id}">${m.id}</a><div class="tiny muted">${esc(m.name)}</div></td>
        <td class="small">${o.items.map((it) => { const p = prods.find((x) => x.id === it.pid); return `${p.emoji} ${esc(p.name.split(' ').slice(0, 3).join(' '))} ×${it.qty}`; }).join('<br>')}</td>
        <td class="small">${o.pay}</td><td class="r num">${P.inr(o.paid)}</td><td class="r num">${o.pointsUsed || 0}</td><td class="r num">${P.num(o.bv)}</td>
        <td>${chip(o.status)}${o.status === 'Pending_Escrow' ? `<div class="tiny muted">${Math.ceil(left)}d left</div>` : ''}</td>
        <td><div class="acts">${o.status === 'Pending_Escrow' ? `<button class="btn btn-green btn-sm" data-rel="${o.id}">Release</button><button class="btn btn-ghost btn-sm" data-ret="${o.id}">Return</button>` : ''}</div></td></tr>`; }).join('') || '<tr><td colspan="9" class="empty">No orders</td></tr>'}
      </tbody></table></div>`;
    $$('.tabs button', el).forEach((b) => (b.onclick = () => { ordTab = b.dataset.k; rerender(); }));
    el.onclick = (e) => {
      const rel = e.target.closest('[data-rel]'), ret = e.target.closest('[data-ret]');
      const id = rel ? rel.dataset.rel : ret ? ret.dataset.ret : null;
      const o = d.orders.find((x) => x.id === id);
      if (!o) return;
      if (rel) { o.status = 'Confirmed'; A.log(`${o.id} released from escrow (${P.num(o.bv)} BV confirmed)`); TS.toast(`${o.id} confirmed, BV eligible for payout`); }
      else { o.status = 'Returned'; A.log(`${o.id} returned; ${P.num(o.bv)} BV and linked commissions reversed`); TS.toast(`↩️ ${o.id} returned, ${P.num(o.bv)} BV reversed`); }
      A.save(); rerender();
    };
  };

  /* ======================================================= PRODUCTS */
  VIEWS.products = (el) => {
    const prods = window.TS_PRODUCTS;
    el.innerHTML = head('Products & BV', 'Catalogue pricing. DP must stay within each category\'s maximum discount band; BV is calculated automatically from the category ratio.') + `
      <div class="kpi-grid" style="margin-bottom:18px">${Object.entries(P.CATEGORIES).map(([k, c]) => kpi(c.icon, c.label, P.pct(c.bvRatio) + ' BV', `Max ${P.pct(c.maxDiscount)} off MRP · ${prods.filter((p) => p.category === k).length} products`)).join('')}</div>
      <div class="table-wrap"><table class="dt"><thead><tr><th>Product</th><th>Category</th><th class="r">MRP</th><th class="r">DP</th><th class="r">Discount</th><th class="r">BV</th><th class="r">Units sold</th><th></th></tr></thead><tbody>
      ${prods.map((p) => { const off = 1 - p.dp / p.mrp; const sold = db().orders.reduce((a, o) => a + o.items.filter((i) => i.pid === p.id).reduce((s, i) => s + i.qty, 0), 0); return `<tr>
        <td>${p.emoji} <b>${esc(p.name)}</b>${p.tag ? ` <span class="chip chip-gold">${esc(p.tag)}</span>` : ''}</td><td class="small">${P.CATEGORIES[p.category].label}</td>
        <td class="r num">${P.inr(p.mrp)}</td><td class="r num">${P.inr(p.dp)}</td>
        <td class="r ${off > P.CATEGORIES[p.category].maxDiscount + 1e-9 ? 'down' : ''}">${(off * 100).toFixed(1)}%</td>
        <td class="r num">${P.num(P.productBV(p.dp, p.category))}</td><td class="r num">${sold}</td>
        <td><button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button></td></tr>`; }).join('')}
      </tbody></table></div>`;
    el.onclick = (e) => {
      const b = e.target.closest('[data-edit]'); if (!b) return;
      const p = prods.find((x) => x.id === b.dataset.edit), cat = P.CATEGORIES[p.category];
      TS.modal('Edit ' + esc(p.name), `
        <label class="field">MRP (₹)<input type="number" id="peM" value="${p.mrp}"></label>
        <label class="field">DP: member price (₹)<input type="number" id="peD" value="${p.dp}"></label>
        <div id="peInfo" class="small"></div>
        <button class="btn btn-gold" id="peGo" style="width:100%;margin-top:12px">Save price</button>`, (body, close) => {
        const info = () => { const m = +$('#peM', body).value, dp = +$('#peD', body).value, off = 1 - dp / m, ok = m > 0 && dp > 0 && dp <= m && off <= cat.maxDiscount + 1e-9;
          $('#peInfo', body).innerHTML = `Discount <b>${(off * 100).toFixed(1)}%</b> (max ${P.pct(cat.maxDiscount)}) · BV <b>${P.num(P.productBV(dp, p.category))}</b> ${ok ? '✅' : '<span class="down">✗ outside allowed band</span>'}`;
          $('#peGo', body).disabled = !ok; };
        $('#peM', body).oninput = info; $('#peD', body).oninput = info; info();
        $('#peGo', body).onclick = () => {
          p.mrp = +$('#peM', body).value; p.dp = +$('#peD', body).value;
          const ov = JSON.parse(localStorage.getItem('trueshop-product-overrides') || '{}'); ov[p.id] = { mrp: p.mrp, dp: p.dp };
          try { localStorage.setItem('trueshop-product-overrides', JSON.stringify(ov)); } catch (err) {}
          A.log(`Price updated: ${p.name} MRP ${P.inr(p.mrp)} / DP ${P.inr(p.dp)}`); close(); TS.toast('Price saved. The storefront uses it immediately.'); rerender();
        };
      });
    };
  };

  /* ======================================================= PAYOUT RUN */
  function computeRun() {
    const d = db(), since = lastRunAt();
    const newbies = d.members.filter((m) => m.joined > since && m.status !== 'blocked');
    const cycleBV = newbies.reduce((a, m) => a + pkgOf(m.pkg).bv, 0);
    const rows = [];
    let grossBinary = 0;
    d.members.forEach((m, i) => {
      if (m.status === 'blocked') return;
      const n = NET[i];
      if (!n.weekL && !n.weekR && !m.carryL && !m.carryR) return;
      const r = P.binaryClosing({ leftBV: n.weekL, rightBV: n.weekR, carryLeft: m.carryL, carryRight: m.carryR, packageKey: m.pkg });
      const direct = newbies.filter((x) => x.sponsor === i).reduce((a, x) => a + pkgOf(x.pkg).bv * P.DIRECT_RATE, 0);
      grossBinary += r.paid;
      rows.push({ m, r, direct });
    });
    const budget = cycleBV * (P.BINARY_RATE / 2); // binary's share of the 70% cap
    const factor = grossBinary > budget ? (grossBinary ? budget / grossBinary : 0) : 1;
    rows.forEach((x) => { x.binary = P.round2(x.r.paid * factor); x.total = P.round2(x.binary + x.direct); });
    rows.sort((a, b) => b.total - a.total);
    const totBinary = rows.reduce((a, x) => a + x.binary, 0), totDirect = rows.reduce((a, x) => a + x.direct, 0);
    return { since, newbies, cycleBV, rows: rows.filter((x) => x.total > 0 || x.r.matched > 0 || x.r.carryLeft || x.r.carryRight), grossBinary, budget, factor, totBinary, totDirect,
      capped: rows.filter((x) => x.r.capped).length, ratio: cycleBV ? (totBinary + totDirect) / cycleBV : 0 };
  }
  VIEWS.payout = (el) => {
    const d = db(), run = computeRun();
    const pct = (v) => (v * 100).toFixed(1) + '%';
    el.innerHTML = head(`Weekly Payout Run: Week ${d.week}`, `Cycle since ${fmtDT(run.since)}. Binary pairs are matched 1:1 per member with carry-forward and package caps; total binary is then held within its ${pct(P.BINARY_RATE / 2)} share of cycle BV so the 70% cap is never breached.`,
      `<button class="btn btn-ghost btn-sm" id="prCsv">⬇ Export</button><button class="btn btn-gold btn-sm" id="prGo" ${run.rows.length && run.cycleBV ? '' : 'disabled'}>✅ Approve &amp; release</button>`) + `
      <div class="kpi-grid">
        ${kpi('🆕', 'New activations', P.num(run.newbies.length), `${P.num(run.cycleBV)} first-purchase BV`)}
        ${kpi('🤝', 'Direct referral (10%)', P.inr(run.totDirect), `${pct(run.cycleBV ? run.totDirect / run.cycleBV : 0)} of cycle BV`)}
        ${kpi('⚡', 'Binary demand (gross)', P.inr(run.grossBinary), `after package caps · ${run.capped} IDs capped`)}
        ${kpi('🧢', 'Binary payable', P.inr(run.totBinary), run.factor < 1 ? `ceiling ×${run.factor.toFixed(3)} applied` : 'within budget', run.factor < 1 ? 'down' : 'up')}
      </div>
      <div class="card" style="margin-top:18px">
        <div class="card-h"><h3>Cap compliance</h3>${run.factor < 1 ? '<span class="chip chip-warn">Ceiling applied</span>' : '<span class="chip">Within budget</span>'}</div>
        <div class="row"><span>Binary budget (${pct(P.BINARY_RATE / 2)} of ${P.num(run.cycleBV)} BV)</span><b>${P.inr(run.budget)}</b></div>
        <div class="row"><span>Gross binary demand across all uplines</span><b>${P.inr(run.grossBinary)}</b></div>
        <div class="row"><span>Pro-rata ceiling factor</span><b>${run.factor < 1 ? '×' + run.factor.toFixed(4) : '×1 (none)'}</b></div>
        <div class="row"><span>Direct + binary payout as share of cycle BV</span><b>${pct(run.ratio)}</b></div>
        <p class="tiny muted" style="margin:8px 0 0">Why a ceiling? In a binary tree, each new BV counts in the leg of <b>every</b> upline, so raw matching demand can be many times the BV that came in. The ceiling scales every member's binary down by the same factor so total outflow stays inside the plan's cap. Cashback, generation, leadership and CTO pools close monthly.</p>
      </div>
      <div class="table-wrap" style="margin-top:18px"><table class="dt"><thead><tr><th>Member</th><th>Package</th><th class="r">Left (new + carry)</th><th class="r">Right (new + carry)</th><th class="r">Matched</th><th class="r">Binary @40%</th><th class="r">After ceiling</th><th class="r">Direct</th><th class="r">Total</th><th class="r">Carry → L : R</th></tr></thead><tbody>
      ${run.rows.filter((x) => x.total > 0).slice(0, 60).map((x) => `<tr><td class="small"><a href="#" data-prof="${x.m.id}">${x.m.id}</a> ${esc(x.m.name)}</td><td class="small">${pkgOf(x.m.pkg).name}</td>
        <td class="r num">${P.num(x.r.totalLeft)}</td><td class="r num">${P.num(x.r.totalRight)}</td><td class="r num">${P.num(x.r.matched)}</td>
        <td class="r num">${P.inr(x.r.paid)}${x.r.capped ? ' <span class="chip chip-warn">cap</span>' : ''}</td><td class="r num">${P.inr(x.binary)}</td><td class="r num">${P.inr(x.direct)}</td>
        <td class="r num"><b>${P.inr(x.total)}</b></td><td class="r num small">${P.num(x.r.carryLeft)} : ${P.num(x.r.carryRight)}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">No new BV since the last run. Add a member to create a new cycle.</td></tr>'}
      </tbody></table></div>
      <p class="small muted">${run.rows.filter((x) => x.total > 0).length} members earn this cycle${run.rows.filter((x) => x.total > 0).length > 60 ? ' (top 60 shown)' : ''}. ${run.rows.filter((x) => !x.total).length} more carry unmatched BV forward with no payout. Export for the full list.</p>
      <h3 style="margin-top:24px">Previous runs</h3>
      <div class="table-wrap"><table class="dt"><thead><tr><th>Week</th><th>Released</th><th class="r">Cycle BV</th><th class="r">Binary</th><th class="r">Direct</th><th class="r">Ceiling</th><th class="r">Members paid</th></tr></thead><tbody>
      ${d.payoutRuns.map((r) => `<tr><td>Week ${r.week}</td><td class="small">${fmtDT(r.t)}</td><td class="r num">${P.num(r.cycleBV)}</td><td class="r num">${P.inr(r.binary)}</td><td class="r num">${P.inr(r.direct)}</td><td class="r">×${r.factor.toFixed(3)}</td><td class="r">${r.paid}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No runs released yet</td></tr>'}
      </tbody></table></div>`;
    $('#prCsv').onclick = () => downloadCSV(`payout-week-${d.week}.csv`, [['Member', 'Name', 'Package', 'Left', 'Right', 'Matched', 'Binary gross', 'Binary payable', 'Direct', 'Total', 'Carry L', 'Carry R']]
      .concat(run.rows.map((x) => [x.m.id, x.m.name, pkgOf(x.m.pkg).name, x.r.totalLeft, x.r.totalRight, x.r.matched, x.r.paid, x.binary, x.direct, x.total, x.r.carryLeft, x.r.carryRight])));
    $('#prGo').onclick = () => {
      TS.modal('Release week ' + d.week + ' payout?', `
        <div class="row"><span>Members paid</span><b>${run.rows.filter((x) => x.total > 0).length}</b></div>
        <div class="row"><span>Total commission</span><b>${P.inr(run.totBinary + run.totDirect)}</b></div>
        <div class="row"><span>→ Payout wallets (90%)</span><b>${P.inr((run.totBinary + run.totDirect) * P.WALLET_SPLIT.payout)}</b></div>
        <div class="row"><span>→ Auto-repurchase wallets (10%)</span><b>${P.inr((run.totBinary + run.totDirect) * P.WALLET_SPLIT.repurchase)}</b></div>
        <button class="btn btn-gold" id="prOk" style="width:100%;margin-top:12px">Approve &amp; release</button>`, (b, close) => {
        $('#prOk', b).onclick = () => {
          run.rows.forEach((x) => {
            const s = P.splitCommission(x.total);
            x.m.wallet.payout = P.round2(x.m.wallet.payout + s.payoutGross); x.m.wallet.repurchase = P.round2(x.m.wallet.repurchase + s.repurchase);
            x.m.earned.binary = P.round2(x.m.earned.binary + x.binary); x.m.earned.direct = P.round2(x.m.earned.direct + x.direct);
            x.m.carryL = x.r.carryLeft; x.m.carryR = x.r.carryRight;
          });
          d.payoutRuns.unshift({ week: d.week, t: Date.now(), cycleBV: run.cycleBV, binary: run.totBinary, direct: run.totDirect, factor: run.factor, paid: run.rows.filter((x) => x.total > 0).length });
          A.log(`Week ${d.week} payout released: ${P.inr(run.totBinary + run.totDirect)} to ${run.rows.filter((x) => x.total > 0).length} members (ceiling ×${run.factor.toFixed(3)})`);
          d.week++; A.save(); close(); TS.toast('⚡ Payout released to wallets', 3500); rerender();
        };
      });
    };
  };

  /* ======================================================= WITHDRAWALS */
  VIEWS.withdrawals = (el) => {
    const d = db();
    el.innerHTML = head('Withdrawal Requests', 'Bank transfers from the Main Payout Wallet. 5% TDS and 5% admin charge are deducted. Only KYC-verified members can be paid.') + `
      <div class="table-wrap"><table class="dt"><thead><tr><th>Request</th><th>Member</th><th>KYC</th><th class="r">Amount</th><th class="r">TDS 5%</th><th class="r">Admin 5%</th><th class="r">Net (IMPS)</th><th>Status</th><th></th></tr></thead><tbody>
      ${d.withdrawals.map((w) => { const m = d.members[w.mi]; const tds = w.amount * P.DEDUCTIONS.tds, adm = w.amount * P.DEDUCTIONS.admin; const kycOk = m.kyc === 'verified'; return `<tr>
        <td><b>${w.id}</b><div class="tiny muted">${fmtDT(w.t)}</div></td><td class="small"><a href="#" data-prof="${m.id}">${m.id}</a><div class="tiny muted">${esc(m.name)}</div></td>
        <td>${chip(m.kyc)}</td><td class="r num">${P.inr(w.amount)}</td><td class="r num">${P.inr(tds, 2)}</td><td class="r num">${P.inr(adm, 2)}</td><td class="r num"><b>${P.inr(w.amount - tds - adm, 2)}</b></td>
        <td>${chip(w.status)}</td>
        <td>${w.status === 'pending' ? `<div class="acts"><button class="btn btn-green btn-sm" data-ap="${w.id}" ${kycOk ? '' : 'disabled data-tip="KYC must be verified first"'}>Approve</button><button class="btn btn-ghost btn-sm" data-rj="${w.id}">Reject</button></div>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>`;
    el.onclick = (e) => {
      const ap = e.target.closest('[data-ap]'), rj = e.target.closest('[data-rj]');
      const w = d.withdrawals.find((x) => x.id === (ap ? ap.dataset.ap : rj ? rj.dataset.rj : ''));
      if (!w) return;
      w.status = ap ? 'approved' : 'rejected';
      A.log(`Withdrawal ${w.id} ${w.status} (${P.inr(w.amount)} for ${d.members[w.mi].id})`); A.save();
      TS.toast(ap ? `🏦 ${w.id} approved and queued for IMPS` : `${w.id} rejected, amount returned to wallet`); rerender();
    };
  };

  /* ======================================================= REPORTS */
  let repQ = '';
  VIEWS.reports = (el) => {
    const ms = db().members.slice(1);
    const keys = ['direct', 'binary', 'generation', 'leadership', 'cto'];
    const tot = Object.fromEntries(keys.map((k) => [k, ms.reduce((a, m) => a + m.earned[k], 0)]));
    const grand = Object.values(tot).reduce((a, b) => a + b, 0);
    const rows = ms.filter((m) => !repQ || (m.id + m.name).toLowerCase().includes(repQ.toLowerCase())).sort((a, b) => totalEarned(b) - totalEarned(a));
    el.innerHTML = head('Income Reports', 'Commission earned per member and per income stream since launch.', '<button class="btn btn-ghost btn-sm" id="rCsv">⬇ Export CSV</button>') + `
      <div class="kpi-grid">${keys.map((k) => { const s = P.INCOME_STREAMS.find((x) => x.key === k); return kpi(['🤝', '⚡', '🔁', '🧭', '👑'][keys.indexOf(k)], s.name, P.inr(tot[k]), grand ? ((tot[k] / grand) * 100).toFixed(1) + '% of commissions' : ''); }).join('')}</div>
      <div class="toolbar" style="margin-top:18px"><input class="input grow" id="rq" placeholder="Filter by member ID or name" value="${esc(repQ)}"></div>
      <div class="table-wrap"><table class="dt"><thead><tr><th>Member</th>${keys.map((k) => `<th class="r">${P.INCOME_STREAMS.find((x) => x.key === k).name.split(' ').slice(0, 2).join(' ')}</th>`).join('')}<th class="r">Total</th></tr></thead><tbody>
      ${rows.slice(0, 50).map((m) => `<tr><td class="small"><a href="#" data-prof="${m.id}">${m.id}</a> ${esc(m.name)}</td>${keys.map((k) => `<td class="r num">${m.earned[k] ? P.inr(m.earned[k]) : '<span class="muted">—</span>'}</td>`).join('')}<td class="r num"><b>${P.inr(totalEarned(m))}</b></td></tr>`).join('')}
      <tr class="total"><td>All members</td>${keys.map((k) => `<td class="r num">${P.inr(tot[k])}</td>`).join('')}<td class="r num">${P.inr(grand)}</td></tr>
      </tbody></table></div>`;
    $('#rq').oninput = (e) => { repQ = e.target.value; const pos = e.target.selectionStart; rerender(); const i = $('#rq'); i.focus(); i.setSelectionRange(pos, pos); };
    $('#rCsv').onclick = () => downloadCSV('trueshop-income-report.csv', [['ID', 'Name', ...keys, 'Total']].concat(rows.map((m) => [m.id, m.name, ...keys.map((k) => m.earned[k]), totalEarned(m)])));
  };

  /* ======================================================= RANKS & CTO */
  VIEWS.ranks = (el) => {
    const d = db(), ms = d.members.slice(1), now = Date.now();
    const holders = P.RANKS.map((r) => ({ r, list: ms.filter((m) => NET[m.idx].rank && NET[m.idx].rank.match >= r.match) }));
    const exact = P.RANKS.map((r) => ms.filter((m) => NET[m.idx].rank && NET[m.idx].rank.key === r.key));
    const monthBV = d.orders.filter((o) => o.t > now - 30 * DAY && o.status !== 'Returned').reduce((a, o) => a + o.bv, 0) + ms.reduce((a, m) => a + m.monthBV, 0);
    const pools = P.CTO_POOLS.map((pool) => {
      const ranks = P.RANKS.filter((r) => r.poolKey === pool.key);
      const elig = ms.map((m) => { const rk = NET[m.idx].rank; const best = rk ? ranks.filter((r) => rk.match >= r.match).pop() : null; return best ? { m, shares: best.shares } : null; }).filter(Boolean);
      const shares = elig.reduce((a, x) => a + x.shares, 0), amount = monthBV * pool.share;
      return { pool, elig, shares, amount, perShare: shares ? amount / shares : 0 };
    });
    el.innerHTML = head('Ranks & CTO Pools', 'Ranks use cumulative 1:1 matched BV. 10% of monthly company BV funds three leadership pools, shared among qualified rank holders.', `<button class="btn btn-gold btn-sm" id="ctoGo">👑 Distribute this month's pools</button>`) + `
      <div class="kpi-grid">${P.RANKS.map((r, i) => kpi(['🥉', '🥈', '🥇', '💎', '👑'][i], r.name, P.num(exact[i].length), `${P.num(r.match)} : ${P.num(r.match)} BV`)).join('')}</div>
      <div class="card" style="margin-top:18px">
        <div class="card-h"><h3>CTO pool calculator</h3><span class="small muted">Monthly company BV: <b>${P.num(monthBV)}</b></span></div>
        <div class="table-wrap" style="box-shadow:none"><table class="dt"><thead><tr><th>Pool</th><th class="r">Share of BV</th><th class="r">Pool amount</th><th class="r">Qualified IDs</th><th class="r">Total shares</th><th class="r">Value per share</th></tr></thead><tbody>
        ${pools.map((p) => `<tr><td><b>${p.pool.name}</b></td><td class="r">${P.pct(p.pool.share)}</td><td class="r num">${P.inr(p.amount)}</td><td class="r">${p.elig.length}</td><td class="r">${p.shares}</td><td class="r num"><b>${p.shares ? P.inr(p.perShare) : '—'}</b></td></tr>`).join('')}
        </tbody></table></div>
        <p class="tiny muted">If a pool has no qualified rank holders, its amount stays with the company that month.</p>
      </div>
      <h3 style="margin-top:22px">Rank achievers</h3>
      <div class="table-wrap"><table class="dt"><thead><tr><th>Member</th><th>Rank</th><th class="r">Left BV</th><th class="r">Right BV</th><th>Lifestyle reward</th><th>Next rank</th></tr></thead><tbody>
      ${ms.filter((m) => NET[m.idx].rank).sort((a, b) => Math.min(NET[b.idx].left, NET[b.idx].right) - Math.min(NET[a.idx].left, NET[a.idx].right)).map((m) => { const n = NET[m.idx], rk = P.rankFor(n.left, n.right); return `<tr>
        <td class="small">${avatar(m)}<a href="#" data-prof="${m.id}">${esc(m.name)}</a> <span class="muted">${m.id}</span></td>
        <td><span class="chip" style="background:${n.rank.color};color:#fff">${n.rank.name}</span></td><td class="r num">${P.num(n.left)}</td><td class="r num">${P.num(n.right)}</td>
        <td class="small">${n.rank.reward}</td><td class="small" style="min-width:160px">${rk.next ? `${rk.next.name}<div class="bar" style="margin-top:4px"><i style="width:${(rk.progress * 100).toFixed(0)}%"></i></div>` : '👑 Top'}</td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">No rank holders yet</td></tr>'}
      </tbody></table></div>`;
    $('#ctoGo').onclick = () => {
      const tot = pools.reduce((a, p) => a + (p.shares ? p.amount : 0), 0);
      if (!tot) { TS.toast('No qualified rank holders this month'); return; }
      pools.forEach((p) => p.elig.forEach((x) => { const amt = P.round2(p.perShare * x.shares), s = P.splitCommission(amt); x.m.earned.cto = P.round2(x.m.earned.cto + amt); x.m.wallet.payout += s.payoutGross; x.m.wallet.repurchase += s.repurchase; }));
      d.ctoRuns.unshift({ t: now, monthBV, total: tot });
      A.log(`CTO pools distributed: ${P.inr(tot)} from ${P.num(monthBV)} monthly BV`); A.save(); TS.toast(`👑 ${P.inr(tot)} distributed to rank holders`); rerender();
    };
  };

  /* ======================================================= PLAN SETTINGS */
  VIEWS.settings = (el) => {
    const cur = P.currentSettings();
    el.innerHTML = head('Plan Settings', 'Change compensation parameters. Every change is checked against the 70% hard cap before saving and applies to the whole site: storefront, member dashboard and simulators.',
      '<button class="btn btn-ghost btn-sm" id="stReset">Restore plan defaults</button><button class="btn btn-gold btn-sm" id="stSave">💾 Save settings</button>') + `
      <div class="card"><div class="card-h"><h3>Effective payout vs 70% cap</h3><b id="stPct"></b></div><div class="cap-meter" id="stMeter"><i></i><b></b></div>
      <p class="tiny muted" style="margin:0">Effective = cashback + direct + binary ÷ 2 + Σ generation + 5% leadership + 10% CTO. Leadership and CTO are fixed by the plan.</p></div>
      <div class="set-grid" style="margin-top:18px">
        <div class="card"><h3>BV ratio by category (% of DP)</h3>${Object.entries(P.CATEGORIES).map(([k, c]) => `<label class="field">${c.icon} ${c.label}<input type="number" step="1" min="0" max="100" data-bv="${k}" value="${Math.round(cur.bvRatios[k] * 100)}"></label>`).join('')}</div>
        <div class="card"><h3>Weekly binary caps (₹)</h3>${P.PACKAGES.map((p) => `<label class="field">${p.name} (${P.num(p.bv)} BV)<input type="number" step="500" min="0" data-cap="${p.key}" value="${cur.weeklyCaps[p.key]}"></label>`).join('')}</div>
        <div class="card"><h3>Commission rates (%)</h3>
          <label class="field">Smart Shopper cashback<input type="number" step="0.5" min="0" id="stCb" value="${cur.cashbackRate * 100}"></label>
          <label class="field">Direct referral booster<input type="number" step="0.5" min="0" id="stDr" value="${cur.directRate * 100}"></label>
          <label class="field">Binary matching (on weaker leg)<input type="number" step="1" min="0" id="stBn" value="${cur.binaryRate * 100}"></label></div>
        <div class="card"><h3>Generation levels (%)</h3>${cur.generation.map((g, i) => `<label class="field">Level ${i + 1}<input type="number" step="0.5" min="0" data-gen="${i}" value="${+(g * 100).toFixed(2)}"></label>`).join('')}</div>
      </div>`;
    const read = () => ({
      bvRatios: Object.fromEntries($$('[data-bv]', el).map((i) => [i.dataset.bv, (+i.value || 0) / 100])),
      weeklyCaps: Object.fromEntries($$('[data-cap]', el).map((i) => [i.dataset.cap, +i.value || 0])),
      cashbackRate: (+$('#stCb').value || 0) / 100, directRate: (+$('#stDr').value || 0) / 100, binaryRate: (+$('#stBn').value || 0) / 100,
      generation: $$('[data-gen]', el).map((i) => (+i.value || 0) / 100),
    });
    function meter() {
      const v = P.effectiveOutflow(read()), over = v > P.HARD_CAP + 1e-9;
      $('#stPct').innerHTML = `<span class="${over ? 'down' : 'up'}">${(v * 100).toFixed(1)}% ${over ? '✗ exceeds cap' : '✓ within cap'}</span>`;
      $('#stMeter').classList.toggle('over', over); $('#stMeter i').style.width = Math.min(100, v * 100) + '%';
      $('#stSave').disabled = over;
    }
    el.addEventListener('input', meter); meter();
    $('#stSave').onclick = () => {
      const cfg = read();
      if (P.effectiveOutflow(cfg) > P.HARD_CAP + 1e-9) return;
      try { localStorage.setItem(P.OVERRIDE_KEY, JSON.stringify(cfg)); } catch (e) {}
      P.applyOverrides(cfg); A.log(`Plan settings updated (effective payout ${(P.effectiveOutflow(cfg) * 100).toFixed(1)}%)`);
      TS.toast('💾 Plan settings saved and applied across the site'); rerender();
    };
    $('#stReset').onclick = () => {
      try { localStorage.removeItem(P.OVERRIDE_KEY); } catch (e) {}
      P.applyOverrides(P.DEFAULTS); A.log('Plan settings restored to business plan defaults'); TS.toast('Defaults restored'); rerender();
    };
  };

  /* ======================================================= TICKETS */
  VIEWS.tickets = (el) => {
    const d = db();
    el.innerHTML = head('Support Tickets', 'Member grievances. Acknowledge within 48 hours and resolve within 30 days, per the Direct Selling Rules.') + `
      <div class="table-wrap"><table class="dt"><thead><tr><th>Ticket</th><th>Subject</th><th>Member</th><th>Priority</th><th>Status</th><th>Opened</th><th></th></tr></thead><tbody>
      ${d.tickets.map((t) => { const m = d.members[t.mi]; return `<tr><td><b>${t.id}</b></td><td>${esc(t.subject)}${t.replies.length ? ` <span class="chip chip-blue">${t.replies.length} repl${t.replies.length > 1 ? 'ies' : 'y'}</span>` : ''}</td>
        <td class="small"><a href="#" data-prof="${m.id}">${m.id}</a></td><td><span class="chip ${t.priority === 'High' ? 'chip-red' : t.priority === 'Medium' ? 'chip-warn' : 'chip-grey'}">${t.priority}</span></td>
        <td>${chip(t.status)}</td><td class="small">${fmtDT(t.t)}</td><td><button class="btn btn-ghost btn-sm" data-tk="${t.id}">Open</button></td></tr>`; }).join('')}
      </tbody></table></div>`;
    el.onclick = (e) => {
      const b = e.target.closest('[data-tk]'); if (!b) return;
      const t = d.tickets.find((x) => x.id === b.dataset.tk), m = d.members[t.mi];
      TS.modal(`${t.id}: ${esc(t.subject)}`, `
        <div class="small muted">From ${esc(m.name)} (${m.id}) · ${fmtDT(t.t)}</div>
        <div class="timeline-log" style="margin:10px 0">${t.replies.map((r) => `<div><time>${fmtDT(r.t)}</time><span><b>Admin:</b> ${esc(r.text)}</span></div>`).join('') || '<div class="muted">No replies yet.</div>'}</div>
        <label class="field">Reply<textarea id="tkR" class="input" rows="3" style="width:100%;font:inherit;padding:10px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink)"></textarea></label>
        <div class="acts"><button class="btn btn-green btn-sm" id="tkSend">Send reply</button>${t.status === 'open' ? '<button class="btn btn-ghost btn-sm" id="tkClose">Mark resolved</button>' : ''}</div>`, (body, close) => {
        $('#tkSend', body).onclick = () => { const v = $('#tkR', body).value.trim(); if (!v) return; t.replies.push({ t: Date.now(), text: v }); A.log(`Replied to ${t.id}`); A.save(); close(); TS.toast('Reply sent'); rerender(); };
        const c = $('#tkClose', body); if (c) c.onclick = () => { t.status = 'closed'; A.log(`${t.id} resolved`); A.save(); close(); TS.toast('Ticket resolved'); rerender(); };
      });
    };
  };

  /* ======================================================= AUDIT */
  VIEWS.audit = (el) => {
    el.innerHTML = head('Audit Log', 'Every admin action is recorded with a timestamp.', '<button class="btn btn-ghost btn-sm" id="auReset">↺ Reset demo dataset</button>') + `
      <div class="card"><div class="timeline-log">${db().audit.map((a) => `<div><time>${fmtDT(a.t)}</time><span>${esc(a.msg)}</span></div>`).join('')}</div></div>`;
    $('#auReset').onclick = () => TS.modal('Reset demo dataset?', '<p class="muted">This regenerates all 180 demo members, orders and requests. Your admin changes will be lost.</p><button class="btn btn-gold" id="auOk" style="width:100%">Reset</button>', (b, close) => {
      $('#auOk', b).onclick = () => { A.reset(); close(); TS.toast('Demo dataset regenerated'); rerender(); };
    });
  };

  /* ======================================================= global search */
  $('#gsearch').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase(), box = $('#gres');
    if (q.length < 2) { box.hidden = true; return; }
    const hits = db().members.filter((m) => (m.id + ' ' + m.name).toLowerCase().includes(q)).slice(0, 8);
    box.innerHTML = hits.length ? hits.map((m) => `<a href="#" data-prof="${m.id}"><b>${m.id}</b> · ${esc(m.name)} <span class="tiny muted">${esc(m.city)}</span></a>`).join('') : '<div class="empty">No match</div>';
    box.hidden = false;
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search')) $('#gres').hidden = true; });

  /* ======================================================= auth & boot */
  const AUTH = 'trueshop-admin-session';
  function boot() {
    let authed = false; try { authed = sessionStorage.getItem(AUTH) === '1'; } catch (e) {}
    $('#login').hidden = authed; $('#app').hidden = !authed;
    if (authed) route();
  }
  $('#lp').addEventListener('keyup', (e) => { $('#capsWarn').textContent = e.getModifierState && e.getModifierState('CapsLock') ? '⚠ Caps Lock is on' : ''; });
  $('#loginForm').onsubmit = (e) => {
    e.preventDefault();
    if ($('#lu').value.trim() === 'admin' && $('#lp').value === 'trueshop@2026') {
      try { sessionStorage.setItem(AUTH, '1'); } catch (err) {}
      A.log('Admin signed in'); boot();
    } else { $('#capsWarn').textContent = '✗ Invalid admin ID or password'; }
  };
  $('#logout').onclick = () => { try { sessionStorage.removeItem(AUTH); } catch (e) {} boot(); };
  $('#burger').onclick = () => { $('#side').classList.toggle('open'); $('#scrim').classList.toggle('open'); };
  $('#scrim').onclick = () => { $('#side').classList.remove('open'); $('#scrim').classList.remove('open'); };
  $('#notifBtn').onclick = () => { location.hash = db().members.some((m) => m.kyc === 'pending') ? 'kyc' : 'withdrawals'; };
  $('#themeBtn').onclick = () => {
    const r = document.documentElement, dark = r.dataset.theme === 'dark' || (!r.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    r.dataset.theme = dark ? 'light' : 'dark'; try { localStorage.setItem('trueshop-theme', r.dataset.theme); } catch (e) {}
  };
  try { const th = localStorage.getItem('trueshop-theme'); if (th) document.documentElement.dataset.theme = th; } catch (e) {}
  window.addEventListener('hashchange', () => { if (!$('#app').hidden) route(); });
  boot();
})();
