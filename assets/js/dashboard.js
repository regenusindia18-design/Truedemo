/* Member dashboard: wallets, weekly binary closing, genealogy, generation,
 * ranks, TrueSteps and KYC-gated withdrawal. All state is demo/localStorage. */
(function () {
  'use strict';
  const P = TrueShopPlan, $ = TS.$, A = window.AdminDB;
  const COLORS = ['#40916c', '#2d6a4f', '#d4a514', '#0284c7', '#a855f7', '#f97316', '#db2777'];
  const fmtD = (t) => new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  /* ---------------------------------------------------- whose dashboard?
   * Normally the signed-in demo member (TS.state, editable). When an admin
   * uses "View as" on a member, the same page renders that member's record
   * from the admin dataset, read-only. */
  const viewId = TS.viewAs();
  const adminM = A && viewId ? A.db.members.find((m) => m.id === viewId) : null;
  const own = !adminM || A.isLinked(adminM);
  const readOnly = !!viewId;

  // the signed-in member's demo downline
  const NAMES = ['Priya K.', 'Rohan M.', 'Sneha P.', 'Vikram J.', 'Anjali S.', 'Kunal T.', 'Meera R.', 'Arjun N.', 'Pooja D.', 'Sahil B.', 'Neha G.', 'Rahul V.', 'Kavya I.', 'Aditya C.'];
  const ownTree = () => [
    { name: TS.state.member.name, me: true },
    ...NAMES.map((n, i) => (i === 10 || i === 13 ? null : { name: n, pkg: P.PACKAGES[i % 3].key, active: i % 4 !== 3, bv: 1000 + ((i * 1370) % 4200), city: ['Pune', 'Nagpur', 'Nashik', 'Mumbai', 'Thane', 'Aurangabad'][i % 6] })),
  ];
  const linkedM = () => (A && A.linkedIdx() >= 0 ? A.db.members[A.linkedIdx()] : null);

  function model() {
    if (own) {
      const s = TS.state, r = TS.rewards(), lm = linkedM();
      return {
        member: s.member, wallets: { ...s.wallets, cashback: r.cashback, points: r.points }, rewards: r, binary: s.binary, ledger: s.ledger,
        tree: ownTree(), levelBV: [6200, 14800, 22500, 31000, 27400, 18900],
        directs: [{ binary: 4800, generation: 1200 }, { binary: 2400, generation: 650 }, { binary: 0, generation: 310 }],
        steps: s.steps, bv: lm ? A.orderBV(lm) : null,
      };
    }
    // another member, from the admin dataset
    const d = A.db, m = adminM, NET = A.network(d), n = NET[m.idx];
    const order = [m.idx]; // level order: children of slot j are 2j+1 (left) and 2j+2 (right)
    for (let j = 1; j < 15; j++) { const p = order[(j - 1) >> 1]; order.push(p == null ? null : ((j % 2 ? d.L : d.R)[p] ?? null)); }
    const tree = order.map((i, j) => (i == null ? null : j === 0 ? { name: m.name, me: true } : { name: d.members[i].name, pkg: d.members[i].pkg, active: d.members[i].status === 'active', bv: d.members[i].monthBV || 0, city: d.members[i].city }));
    const w = A.wallets(m), r = P.rewardSummary(A.rewardsOf(m));
    const k = m.kyc === 'verified';
    const ledger = [...(m.ledger || []),
      ...d.withdrawals.filter((x) => x.mi === m.idx).map((x) => ({ t: x.t, type: 'Withdrawal', note: `${x.id} · ${x.status}`, amount: x.amount })),
      ...['direct', 'binary', 'generation', 'leadership', 'cto'].filter((s) => m.earned[s]).map((s) => ({ t: m.joined, type: 'To date', note: `${P.INCOME_STREAMS.find((x) => x.key === s).name}: all closings so far`, amount: m.earned[s] }))]
      .sort((a, b) => b.t - a.t);
    return {
      member: { id: m.id, name: m.name, package: m.pkg, kyc: { pan: k || m.kyc === 'pending', aadhaar: k || m.kyc === 'pending', bank: k } },
      wallets: { payout: w.payout, repurchase: w.repurchase, cashback: r.cashback, points: r.points }, rewards: r,
      binary: { carryLeft: m.carryL, carryRight: m.carryR, cumLeft: n.left, cumRight: n.right, week: d.week, pendingLeft: n.weekL, pendingRight: n.weekR },
      ledger, tree, levelBV: A.generationBV(d, m.idx),
      directs: d.members.filter((x) => x.sponsor === m.idx).map((x) => ({ binary: x.earned.binary, generation: x.earned.generation })),
      steps: null, bv: A.orderBV(m), status: m.status,
      kycLabel: { pending: 'KYC: under review', rejected: 'KYC: rejected', not_submitted: 'KYC: not submitted' }[m.kyc],
    };
  }
  let M = model();
  const S = () => TS.state;
  const tree = M.tree;

  function renderTree() {
    function node(i, depth) {
      if (depth > 3) return '';
      const n = tree[i];
      const kids = depth < 3 ? `<ul>${node(2 * i + 1, depth + 1)}${node(2 * i + 2, depth + 1)}</ul>` : '';
      if (!n) return `<li><span class="node empty">＋<br>Open slot</span></li>`;
      const init = n.name.split(' ').map((x) => x[0]).join('');
      return `<li><span class="node ${n.me ? 'me' : ''} ${n.active === false ? 'inactive' : ''}" data-i="${i}">
        <div class="av" style="background:${n.me ? 'var(--gold)' : COLORS[i % COLORS.length]};${n.me ? 'color:var(--green-900)' : ''}">${init}</div>
        <b>${TS.esc(n.me ? 'You' : n.name)}</b><div class="tiny muted">${i === 0 ? 'Root' : i % 2 ? 'Left' : 'Right'}</div></span>${kids}</li>`;
    }
    $('#tree').innerHTML = node(0, 0);
    const wrap = $('.tree-wrap'); wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2;
  }
  $('#tree').addEventListener('click', (e) => {
    const el = e.target.closest('.node'); if (!el) return;
    if (el.classList.contains('empty')) { TS.modal('Open slot', '<p class="muted">Share your referral link to place a new customer here. Registration is free and there is no joining fee.</p><input class="input" readonly value="https://trueshop.example/join?ref=' + S().member.id + '">'); return; }
    const n = tree[+el.dataset.i];
    if (n.me) return;
    const pkg = P.PACKAGES.find((p) => p.key === n.pkg);
    TS.modal(TS.esc(n.name), `
      <div class="row"><span>City</span><b>${n.city}</b></div>
      <div class="row"><span>ID type</span><b>${pkg.name}</b></div>
      <div class="row"><span>Status</span><b>${n.active ? '<span class="chip">Active repurchase</span>' : '<span class="chip chip-grey">No repurchase this month</span>'}</b></div>
      <div class="row"><span>Personal BV this month</span><b>${P.num(n.bv)} BV</b></div>`);
  });

  /* ---------------------------------------------------- header + wallets */
  function renderHeader() {
    const m = M.member, b = M.binary;
    const rk = P.rankFor(b.cumLeft, b.cumRight);
    const kycOk = m.kyc.pan && m.kyc.aadhaar && m.kyc.bank;
    $('#mName').textContent = m.name;
    $('#avatar').textContent = m.name[0];
    $('#mChips').innerHTML = `<span class="chip chip-gold">${m.id}</span>
      <span class="chip">${P.PACKAGES.find((p) => p.key === m.package).name}</span>
      <span class="chip" style="background:${rk.current ? rk.current.color : '#64748b'};color:#fff">${rk.current ? rk.current.name : 'Unranked'}</span>
      <span class="chip ${kycOk ? '' : 'chip-warn'}">${kycOk ? '✓ KYC verified' : '⚠ ' + (M.kycLabel || 'KYC: bank pending')}</span>${M.status && M.status !== 'active' ? ` <span class="chip chip-red">${M.status}</span>` : ''}`;
  }
  function renderWallets() {
    const w = M.wallets, r = M.rewards;
    const nextLapse = r.next ? `${P.inr(r.next.amount, 2)} lapses ${fmtD(r.next.t)}` : 'nothing due to lapse';
    $('#wallets').innerHTML = [
      ['💰', 'Main payout wallet', P.inr(w.payout, 2), 'NEFT/IMPS · 5% TDS + 5% admin'],
      ['🔁', 'Auto-repurchase wallet', P.inr(w.repurchase, 2), '10% auto-split · full BV on use'],
      ['🎁', 'Cashback wallet', P.inr(w.cashback, 2), 'credited after 7-day escrow · 60-day validity'],
      ['👟', 'TruePoints', P.num(w.points) + ' pts', '= ' + P.inr(w.points) + ' cart discount · 60-day validity'],
    ].map(([i, l, v, s]) => `<div class="card stat-tile" data-ico="${i}"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join('');
    const bv = M.bv;
    $('#bvBox').innerHTML = (bv ? `
      <div class="row" style="padding-top:0"><span>In escrow <span class="tiny muted">(not yet counted)</span></span><b>${P.num(bv.escrow)} BV</b></div>
      <div class="row"><span>Confirmed this month</span><b style="color:var(--green-500)">${P.num(bv.month)} BV</b></div>
      <div class="row"><span>Lifetime confirmed order BV</span><b>${P.num(bv.lifetime)} BV</b></div>
      <div class="tiny muted" style="margin:4px 0 8px">Order BV is held for ${P.ESCROW_DAYS} days after delivery. It counts, and its 5% cashback is credited, only once the return window closes. <a href="shop.html#orders-h">Track orders →</a></div>
      ${bv.log.slice(0, 3).map((l) => `<div class="row small"><span>${fmtD(l.t)} · ${TS.esc(l.ref)}</span><b>+${P.num(l.bv)} BV</b></div>`).join('')}` : '<p class="muted small">Order BV is not available.</p>') + `
      <h4 style="margin:16px 0 6px">🎁 Rewards validity</h4>
      <div class="row small" style="padding-top:0"><span>Next lapse</span><b>${nextLapse}</b></div>
      <div class="row small"><span>Last redeemed</span><b>${r.lastUsedAt ? fmtD(r.lastUsedAt) : 'never'}</b></div>
      <div class="tiny muted">Rewards lapse ${P.REWARDS.validityDays} days after they are credited. Redeem any amount and everything left is carried forward for another ${P.REWARDS.validityDays} days from that day.</div>
      ${r.lots.length ? `<div class="table-wrap" style="box-shadow:none;margin-top:8px"><table><thead><tr><th>Credit</th><th class="r">Left</th><th class="r">Valid until</th></tr></thead><tbody>
        ${r.lots.slice(0, 6).map((l) => `<tr><td class="small">${l.kind === 'points' ? '👟' : '🎁'} ${TS.esc(l.note)}<div class="tiny muted">${fmtD(l.t)}</div></td><td class="r num">${l.kind === 'points' ? P.num(l.remaining) + ' pts' : P.inr(l.remaining, 2)}</td><td class="r small">${fmtD(l.expires)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  }

  /* ---------------------------------------------------- binary */
  function renderBinary() {
    const b = M.binary;
    const proj = P.binaryClosing({ leftBV: b.pendingLeft, rightBV: b.pendingRight, carryLeft: b.carryLeft, carryRight: b.carryRight, packageKey: M.member.package });
    $('#wk').textContent = b.week;
    $('#pl').textContent = P.num(b.pendingLeft) + ' BV';
    $('#pr').textContent = P.num(b.pendingRight) + ' BV';
    $('#cl').textContent = P.num(b.carryLeft);
    $('#cr').textContent = P.num(b.carryRight);
    $('#pm').textContent = P.num(proj.matched) + ' BV';
    $('#pb').textContent = P.inr(proj.paid) + (proj.capped ? ' (capped)' : '');
    $('#pc').textContent = P.inr(proj.weeklyCap);
    $('#pkgName').textContent = P.PACKAGES.find((p) => p.key === M.member.package).name;
  }
  TS.$$('[data-add]').forEach((btn) => (btn.onclick = () => {
    if (readOnly) return;
    const b = S().binary; btn.dataset.add === 'L' ? (b.pendingLeft += 2500) : (b.pendingRight += 2500);
    TS.save(); renderBinary();
  }));

  function confetti() {
    const cols = ['#f5c842', '#40916c', '#38bdf8', '#a855f7', '#f97316'];
    for (let i = 0; i < 90; i++) {
      const c = document.createElement('div'); c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length];
      c.style.animationDuration = 1.8 + Math.random() * 1.8 + 's'; c.style.animationDelay = Math.random() * 0.4 + 's';
      document.body.appendChild(c); setTimeout(() => c.remove(), 4200);
    }
  }

  $('#closeWeek').onclick = () => {
    if (readOnly) return;
    const s = S(), b = s.binary;
    const prevRank = P.rankFor(b.cumLeft, b.cumRight).current;
    const r = P.binaryClosing({ leftBV: b.pendingLeft, rightBV: b.pendingRight, carryLeft: b.carryLeft, carryRight: b.carryRight, packageKey: s.member.package });
    if (r.matched === 0) { TS.toast('Nothing to match this week. Add BV to both legs first.'); return; }
    // confirmed escrow orders: everything older than 7 days stays; demo treats closing as post-escrow
    b.cumLeft += b.pendingLeft; b.cumRight += b.pendingRight;
    b.carryLeft = r.carryLeft; b.carryRight = r.carryRight;
    b.pendingLeft = 0; b.pendingRight = 0;
    const split = P.splitCommission(r.paid);
    s.wallets.payout = P.round2(s.wallets.payout + split.payoutGross);
    s.wallets.repurchase = P.round2(s.wallets.repurchase + split.repurchase);
    s.ledger.unshift({ t: Date.now(), type: 'Binary', note: `Week ${b.week} closing · ${P.num(r.matched)} BV matched${r.capped ? ` · ${P.inr(r.flushed)} flushed at cap` : ''}`, amount: r.paid });
    b.week++;
    TS.save(); renderAll();
    $('#binaryCard').classList.add('closing-anim'); setTimeout(() => $('#binaryCard').classList.remove('closing-anim'), 2000);
    TS.toast(`⚡ Week closed: <b>${P.inr(r.paid)}</b> binary → ${P.inr(split.payoutGross)} payout + ${P.inr(split.repurchase)} repurchase wallet`, 4500);
    const newRank = P.rankFor(b.cumLeft, b.cumRight).current;
    if (newRank && (!prevRank || newRank.match > prevRank.match)) {
      confetti();
      setTimeout(() => TS.modal('🎉 Rank achieved!', `<p style="font-size:1.1rem">You are now a <b style="color:${newRank.color}">${newRank.name}</b>.</p><div class="row"><span>CTO pool</span><b>${newRank.pool}</b></div><div class="row"><span>Lifestyle reward</span><b>${newRank.reward}</b></div>`), 700);
    }
  };

  /* ---------------------------------------------------- ranks */
  function renderRank() {
    const b = M.binary;
    const rk = P.rankFor(b.cumLeft, b.cumRight);
    $('#rankBox').innerHTML = `
      <div class="row" style="padding-top:0"><span>Cumulative left</span><b>${P.num(b.cumLeft)} BV</b></div>
      <div class="row"><span>Cumulative right</span><b>${P.num(b.cumRight)} BV</b></div>
      ${rk.next ? `<div style="margin:12px 0 6px" class="small">Next: <b style="color:${rk.next.color}">${rk.next.name}</b> at ${P.num(rk.next.match)} : ${P.num(rk.next.match)} BV</div>
      <div class="bar"><i style="width:${Math.min(100, rk.progress * 100).toFixed(1)}%"></i></div>
      <div class="tiny muted" style="margin-top:6px">${P.num(rk.next.match - rk.weaker)} more BV needed on your weaker leg · unlocks ${rk.next.reward}</div>` : '<p>👑 Highest rank achieved!</p>'}
      <div style="display:flex;gap:6px;margin-top:14px;flex-wrap:wrap">${P.RANKS.map((r) => `<span class="chip" style="${rk.weaker >= r.match ? `background:${r.color};color:#fff` : ''}">${rk.weaker >= r.match ? '✓ ' : ''}${r.name}</span>`).join('')}</div>`;
  }

  /* ---------------------------------------------------- generation + leadership */
  function renderGeneration() {
    const g = P.generationIncome(M.levelBV);
    $('#gen').innerHTML = g.rows.map((r) => `<tr><td>L${r.level}</td><td class="r num">${P.num(r.bv)}</td><td class="r">${P.pct(r.rate)}</td><td class="r num">${P.inr(r.income)}</td></tr>`).join('')
      + `<tr class="total"><td colspan="3">Total generation income</td><td class="r num">${P.inr(g.total)}</td></tr>`;
    const lead = P.leadershipMatch(M.directs);
    $('#lead').textContent = P.inr(lead.income) + ' on ' + P.inr(lead.base);
  }

  /* ---------------------------------------------------- TrueSteps */
  const today = () => new Date().toDateString();
  function renderSteps() {
    const st = M.steps;
    if (!st) { $('#steps').innerHTML = '<h3>👟 TrueSteps</h3><p class="muted small">Step counts stay on the member\'s phone and are not visible to the admin. TruePoints already credited show in the wallets above.</p>'; return; }
    const claimed = st.claimedOn === today();
    const days = [...st.history.slice(-6), st.today];
    const max = Math.max(12000, ...days);
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'];
    $('#stToday').textContent = st.today.toLocaleString('en-IN') + ' steps · ' + P.stepsToPoints(st.today) + ' pts';
    setTimeout(() => ($('#stBar').style.width = Math.min(100, (st.today / 10000) * 100) + '%'), 50);
    $('#stChart').innerHTML = days.map((d, i) => `
      <div class="col"><div class="tiny muted num">${(d / 1000).toFixed(1)}k</div><div class="b ${d >= 10000 ? 'goal' : ''} ${i === 6 ? 'today' : ''}" style="height:0" data-h="${(d / max) * 100}%"></div><div class="tiny muted">${labels[i]}</div></div>`).join('');
    requestAnimationFrame(() => TS.$$('#stChart .b').forEach((b) => (b.style.height = `calc(${b.dataset.h} - 30px)`)));
    $('#claimSteps').disabled = readOnly || claimed || P.stepsToPoints(st.today) === 0;
    $('#claimSteps').textContent = claimed ? 'Claimed today ✓' : `Claim ${P.stepsToPoints(st.today)} TruePoints`;
  }
  $('#syncSteps').onclick = () => {
    if (readOnly) return;
    const st = S().steps; const add = 800 + Math.floor(Math.random() * 2400);
    if (st.claimedOn && st.claimedOn !== today()) { st.history.push(st.today); st.today = 0; st.claimedOn = null; } // new day
    const before = P.stepsToPoints(st.today);
    if (st.claimedOn === today()) { TS.toast('Already claimed today. New steps count toward tomorrow.'); return; }
    st.today += add; TS.save(); renderSteps();
    TS.toast(`📲 Synced +${add.toLocaleString('en-IN')} steps` + (P.stepsToPoints(st.today) > before ? ' · new TruePoints milestone!' : ''));
  };
  $('#claimSteps').onclick = () => {
    if (readOnly) return;
    const st = S().steps; const pts = P.stepsToPoints(st.today);
    if (!pts || st.claimedOn === today()) return;
    P.creditReward(S().rewards, 'points', pts, Date.now(), `TrueSteps: ${st.today.toLocaleString('en-IN')} steps`);
    st.claimedOn = today(); TS.save(); M = model(); renderSteps(); renderWallets();
    TS.toast(`👟 +${pts} TruePoints added, valid ${P.REWARDS.validityDays} days. Use them in the Shop (max 10% of bill).`);
  };

  /* ---------------------------------------------------- ledger + withdraw */
  function renderLedger() {
    $('#ledger').innerHTML = M.ledger.map((l) => `<tr><td class="small">${new Date(l.t).toLocaleDateString('en-IN')}</td><td><span class="chip ${l.type === 'Withdrawal' ? 'chip-blue' : ''}">${l.type}</span></td><td class="small">${TS.esc(l.note)}</td><td class="r num">${l.type === 'Withdrawal' ? '−' : ''}${P.inr(Math.abs(l.amount), 2)}</td></tr>`).join('');
  }
  $('#withdraw').onclick = () => {
    if (readOnly) return;
    const s = S(), k = s.member.kyc;
    if (!(k.pan && k.aadhaar && k.bank)) {
      TS.modal('Complete KYC to withdraw', `
        <p class="muted small">As required by the Direct Selling Rules, payouts are released only after full KYC.</p>
        <div class="row"><span>PAN</span><b>${k.pan ? '✅ Verified' : '❌'}</b></div>
        <div class="row"><span>Aadhaar</span><b>${k.aadhaar ? '✅ Verified' : '❌'}</b></div>
        <div class="row"><span>Bank account</span><b>${k.bank ? '✅ Verified' : '⏳ Pending'}</b></div>
        <label class="field" style="margin-top:12px">Account number<input placeholder="XXXXXXXX1234" id="acc"></label>
        <label class="field">IFSC<input placeholder="SBIN0001234" id="ifsc"></label>
        <button class="btn btn-green" id="verify" style="width:100%">Verify via penny-drop (demo)</button>`, (body, close) => {
        $('#verify', body).onclick = () => { k.bank = true; TS.save(); close(); renderHeader(); TS.toast('✅ Bank verified. You can now withdraw.'); };
      });
      return;
    }
    const amt = s.wallets.payout;
    if (amt < 500) { TS.toast('Minimum withdrawal is ₹500.'); return; }
    const tds = P.round2(amt * P.DEDUCTIONS.tds), admin = P.round2(amt * P.DEDUCTIONS.admin), net = P.round2(amt - tds - admin);
    TS.modal('Withdraw to bank', `
      <div class="row"><span>Payout wallet balance</span><b>${P.inr(amt, 2)}</b></div>
      <div class="row"><span>TDS (5%)</span><b>−${P.inr(tds, 2)}</b></div>
      <div class="row"><span>Admin charge (5%)</span><b>−${P.inr(admin, 2)}</b></div>
      <div class="row"><span><b>Net to bank (IMPS)</b></span><b style="font-size:1.25rem;color:var(--green-500)">${P.inr(net, 2)}</b></div>
      <button class="btn btn-gold" id="wd" style="width:100%;margin-top:14px">Confirm withdrawal</button>`, (body, close) => {
      $('#wd', body).onclick = () => {
        s.wallets.payout = 0;
        s.ledger.unshift({ t: Date.now(), type: 'Withdrawal', note: `IMPS to bank · net ${P.inr(net, 2)} after TDS ${P.inr(tds, 2)} + admin ${P.inr(admin, 2)}`, amount: amt });
        TS.save(); close(); renderAll(); TS.toast(`🏦 ${P.inr(net, 2)} sent to your bank (demo).`);
      };
    });
  };

  function renderAll() { M = model(); renderHeader(); renderWallets(); renderBinary(); renderRank(); renderLedger(); renderSteps(); }
  if (readOnly) { // admin "view as": hide every action
    ['#closeWeek', '#withdraw', '#syncSteps', '#claimSteps'].forEach((q) => { const e = $(q); if (e) e.hidden = true; });
    TS.$$('[data-add]').forEach((e) => (e.hidden = true));
    $('#teamTip').textContent = 'Read-only view for the admin. Actions are hidden.';
  }
  renderTree(); renderGeneration(); renderAll();
})();
