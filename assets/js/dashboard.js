/* Member dashboard: wallets, weekly binary closing, genealogy, generation,
 * ranks, TrueSteps and KYC-gated withdrawal. All state is demo/localStorage. */
(function () {
  'use strict';
  const P = TrueShopPlan, S = () => TS.state, $ = TS.$;

  /* ---------------------------------------------------- demo downline */
  const NAMES = ['Priya K.', 'Rohan M.', 'Sneha P.', 'Vikram J.', 'Anjali S.', 'Kunal T.', 'Meera R.', 'Arjun N.', 'Pooja D.', 'Sahil B.', 'Neha G.', 'Rahul V.', 'Kavya I.', 'Aditya C.'];
  const COLORS = ['#40916c', '#2d6a4f', '#d4a514', '#0284c7', '#a855f7', '#f97316', '#db2777'];
  // Level-order binary tree; null = open slot
  const tree = [
    { name: S().member.name, me: true },
    ...NAMES.map((n, i) => (i === 10 || i === 13 ? null : { name: n, pkg: P.PACKAGES[i % 3].key, active: i % 4 !== 3, bv: 1000 + ((i * 1370) % 4200), city: ['Pune', 'Nagpur', 'Nashik', 'Mumbai', 'Thane', 'Aurangabad'][i % 6] })),
  ];

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
    const m = S().member, b = S().binary;
    const rk = P.rankFor(b.cumLeft, b.cumRight);
    const kycOk = m.kyc.pan && m.kyc.aadhaar && m.kyc.bank;
    $('#mName').textContent = m.name;
    $('#avatar').textContent = m.name[0];
    $('#mChips').innerHTML = `<span class="chip chip-gold">${m.id}</span>
      <span class="chip">${P.PACKAGES.find((p) => p.key === m.package).name}</span>
      <span class="chip" style="background:${rk.current ? rk.current.color : '#64748b'};color:#fff">${rk.current ? rk.current.name : 'Unranked'}</span>
      <span class="chip ${kycOk ? '' : 'chip-warn'}">${kycOk ? '✓ KYC verified' : '⚠ KYC: bank pending'}</span>`;
  }
  function renderWallets() {
    const w = S().wallets;
    $('#wallets').innerHTML = [
      ['💰', 'Main payout wallet', P.inr(w.payout, 2), 'NEFT/IMPS · 5% TDS + 5% admin'],
      ['🔁', 'Auto-repurchase wallet', P.inr(w.repurchase, 2), '10% auto-split · full BV on use'],
      ['🎁', 'Cashback wallet', P.inr(w.cashback, 2), '5% self-purchase · 45-day validity'],
      ['👟', 'TruePoints', P.num(w.points) + ' pts', '= ' + P.inr(w.points) + ' cart discount'],
    ].map(([i, l, v, s]) => `<div class="card stat-tile" data-ico="${i}"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join('');
  }

  /* ---------------------------------------------------- binary */
  function renderBinary() {
    const b = S().binary;
    const proj = P.binaryClosing({ leftBV: b.pendingLeft, rightBV: b.pendingRight, carryLeft: b.carryLeft, carryRight: b.carryRight, packageKey: S().member.package });
    $('#wk').textContent = b.week;
    $('#pl').textContent = P.num(b.pendingLeft) + ' BV';
    $('#pr').textContent = P.num(b.pendingRight) + ' BV';
    $('#cl').textContent = P.num(b.carryLeft);
    $('#cr').textContent = P.num(b.carryRight);
    $('#pm').textContent = P.num(proj.matched) + ' BV';
    $('#pb').textContent = P.inr(proj.paid) + (proj.capped ? ' (capped)' : '');
    $('#pc').textContent = P.inr(proj.weeklyCap);
    $('#pkgName').textContent = P.PACKAGES.find((p) => p.key === S().member.package).name;
  }
  TS.$$('[data-add]').forEach((btn) => (btn.onclick = () => {
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
    const b = S().binary;
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
    const levelBV = [6200, 14800, 22500, 31000, 27400, 18900];
    const g = P.generationIncome(levelBV);
    $('#gen').innerHTML = g.rows.map((r) => `<tr><td>L${r.level}</td><td class="r num">${P.num(r.bv)}</td><td class="r">${P.pct(r.rate)}</td><td class="r num">${P.inr(r.income)}</td></tr>`).join('')
      + `<tr class="total"><td colspan="3">Total generation income</td><td class="r num">${P.inr(g.total)}</td></tr>`;
    const lead = P.leadershipMatch([{ binary: 4800, generation: 1200 }, { binary: 2400, generation: 650 }, { binary: 0, generation: 310 }]);
    $('#lead').textContent = P.inr(lead.income) + ' on ' + P.inr(lead.base);
  }

  /* ---------------------------------------------------- TrueSteps */
  function renderSteps() {
    const st = S().steps;
    const days = [...st.history.slice(-6), st.today];
    const max = Math.max(12000, ...days);
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'];
    $('#stToday').textContent = st.today.toLocaleString('en-IN') + ' steps · ' + P.stepsToPoints(st.today) + ' pts';
    setTimeout(() => ($('#stBar').style.width = Math.min(100, (st.today / 10000) * 100) + '%'), 50);
    $('#stChart').innerHTML = days.map((d, i) => `
      <div class="col"><div class="tiny muted num">${(d / 1000).toFixed(1)}k</div><div class="b ${d >= 10000 ? 'goal' : ''} ${i === 6 ? 'today' : ''}" style="height:0" data-h="${(d / max) * 100}%"></div><div class="tiny muted">${labels[i]}</div></div>`).join('');
    requestAnimationFrame(() => TS.$$('#stChart .b').forEach((b) => (b.style.height = `calc(${b.dataset.h} - 30px)`)));
    $('#claimSteps').disabled = !!st.claimedToday || P.stepsToPoints(st.today) === 0;
    $('#claimSteps').textContent = st.claimedToday ? 'Claimed today ✓' : `Claim ${P.stepsToPoints(st.today)} TruePoints`;
  }
  $('#syncSteps').onclick = () => {
    const st = S().steps; const add = 800 + Math.floor(Math.random() * 2400);
    const before = P.stepsToPoints(st.today);
    if (st.claimedToday) { TS.toast('Already claimed today. New steps count toward tomorrow.'); return; }
    st.today += add; TS.save(); renderSteps();
    TS.toast(`📲 Synced +${add.toLocaleString('en-IN')} steps` + (P.stepsToPoints(st.today) > before ? ' · new TruePoints milestone!' : ''));
  };
  $('#claimSteps').onclick = () => {
    const st = S().steps; const pts = P.stepsToPoints(st.today);
    S().wallets.points += pts; st.claimedToday = true; TS.save(); renderSteps(); renderWallets();
    TS.toast(`👟 +${pts} TruePoints added. Use them in the Shop (max 10% of bill).`);
  };

  /* ---------------------------------------------------- ledger + withdraw */
  function renderLedger() {
    $('#ledger').innerHTML = S().ledger.map((l) => `<tr><td class="small">${new Date(l.t).toLocaleDateString('en-IN')}</td><td><span class="chip ${l.type === 'Withdrawal' ? 'chip-blue' : ''}">${l.type}</span></td><td class="small">${TS.esc(l.note)}</td><td class="r num">${l.type === 'Withdrawal' ? '−' : ''}${P.inr(Math.abs(l.amount), 2)}</td></tr>`).join('');
  }
  $('#withdraw').onclick = () => {
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

  function renderAll() { renderHeader(); renderWallets(); renderBinary(); renderRank(); renderLedger(); renderSteps(); }
  renderTree(); renderGeneration(); renderAll();
})();
