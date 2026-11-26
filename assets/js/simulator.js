/* Payout simulator — company model (mirrors the XLSX) + personal calculator */
(function () {
  'use strict';
  const P = TrueShopPlan, $ = TS.$;
  const C = P.STREAM_COLORS;
  const DEFAULTS = { joinings: 500, firstOrderDP: 2000, bvRatio: 50, repurchaseMembers: 1200, repurchaseDP: 1200, growth: 12 };
  const short = (n) => n >= 1e7 ? '₹' + (n / 1e7).toFixed(2) + ' Cr' : n >= 1e5 ? '₹' + (n / 1e5).toFixed(2) + ' L' : P.inr(n);

  /* ---------------------------------------------------------- tabs */
  $('#tabs').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    TS.$$('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
    $('#t-company').classList.toggle('hidden', b.dataset.t !== 'company');
    $('#t-personal').classList.toggle('hidden', b.dataset.t !== 'personal');
  };

  /* ---------------------------------------------------------- company */
  const ids = Object.keys(DEFAULTS);
  const read = () => Object.fromEntries(ids.map((k) => [k, Math.max(0, +$('#' + k).value || 0)]));

  function company() {
    const v = read();
    const sim = P.companySimulation({ ...v, bvRatio: v.bvRatio / 100 });
    $('#kpis').innerHTML = [
      ['Monthly turnover (DP)', short(sim.totalTurnover), `${short(sim.firstTurnover)} first + ${short(sim.repTurnover)} repeat`],
      ['Total monthly BV', P.num(sim.totalBV), `${P.num(sim.firstBV)} first + ${P.num(sim.repBV)} repeat`],
      ['Member payout', short(sim.totalPayout), P.pct(sim.payoutRatio, 1) + ' of total BV'],
      ['Company retention', short(sim.retention), P.pct(sim.retentionRatio, 1) + ' of total BV'],
    ].map(([l, v, s]) => `<div class="card stat-tile"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join('');

    $('#gaugeFill').style.width = Math.min(100, sim.payoutRatio * 100) + '%';
    $('#capChip').className = 'chip ' + (sim.scaled ? 'chip-warn' : '');
    $('#capChip').textContent = sim.scaled ? '⚠ Scaled down to 70% cap' : `✓ ${P.pct(sim.payoutRatio, 1)} within cap`;

    const parts = sim.rows.map((r, i) => ({ name: r.name, v: r.payout, c: C[i] })).concat([{ name: 'Retained by company', v: sim.retention, c: P.RETAINED_COLOR }]);
    $('#stack').innerHTML = parts.map((p) => {
      const f = sim.totalBV ? (p.v / sim.totalBV) * 100 : 0;
      return `<div style="flex-basis:${f}%;background:${p.c}" title="${p.name}: ${P.inr(p.v)} (${f.toFixed(1)}%)">${f >= 6 ? f.toFixed(0) + '%' : ''}</div>`;
    }).join('');
    $('#legend').innerHTML = parts.map((p) => `<span><i style="background:${p.c}"></i>${p.name}</span>`).join('');

    $('#simTable').innerHTML = sim.rows.map((r, i) => `<tr><td><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${C[i]};margin-right:8px"></i>${i + 1}. ${r.name}</td><td>${r.headline}</td><td class="r">${P.pct(r.rate)}</td><td class="r num">${P.num(r.baseBV)}</td><td class="r num">${P.inr(r.payout)}</td></tr>`).join('')
      + `<tr class="total"><td>Total maximum payout</td><td>95% headline*</td><td class="r">${P.pct(sim.payoutRatio, 2)}</td><td class="r num">${P.num(sim.totalBV)}</td><td class="r num">${P.inr(sim.totalPayout)}</td></tr>`
      + `<tr><td colspan="2"><b>Company net BV retention (Regenus India Pvt. Ltd.)</b></td><td class="r"><b>${P.pct(sim.retentionRatio, 2)}</b></td><td></td><td class="r num"><b>${P.inr(sim.retention)}</b></td></tr>`;

    projection(v);
  }

  function projection(v) {
    const g = 1 + v.growth / 100;
    const months = [];
    for (let m = 0; m < 12; m++) {
      const f = Math.pow(g, m);
      const s = P.companySimulation({ joinings: v.joinings * f, firstOrderDP: v.firstOrderDP, bvRatio: v.bvRatio / 100, repurchaseMembers: v.repurchaseMembers * f, repurchaseDP: v.repurchaseDP });
      months.push({ m: m + 1, bv: s.totalBV, pay: s.totalPayout, ret: s.retention, ratio: s.payoutRatio });
    }
    const max = Math.max(1, ...months.map((x) => x.bv));
    const ticks = [0.25, 0.5, 0.75, 1].map((t) => `<div class="yl" style="bottom:${t * 230 + 24}px">${short(max * t)}</div>`).join('');
    $('#projChart').innerHTML = `${ticks}<div class="cols">${months.map((x, i) => `
        <div class="c" data-i="${i}"><i style="height:${(x.pay / max) * 230}px;background:var(--green-500)"></i><i style="height:${(x.ret / max) * 230}px;background:${P.RETAINED_COLOR}"></i></div>`).join('')}</div>
      <div class="xl">${months.map((x) => `<span>M${x.m}</span>`).join('')}</div><div class="tip" id="tip"></div>`;
    const tip = $('#tip'), chart = $('#projChart');
    chart.onmousemove = (e) => {
      const c = e.target.closest('.c'); if (!c) { tip.classList.remove('on'); return; }
      const x = months[+c.dataset.i]; const r = chart.getBoundingClientRect();
      tip.innerHTML = `<b>Month ${x.m}</b><div class="row"><span>Total BV</span><b>${P.num(x.bv)}</b></div><div class="row"><span><i class="k" style="background:var(--green-500)"></i>Payout</span><b>${short(x.pay)}</b></div><div class="row"><span><i class="k" style="background:${P.RETAINED_COLOR}"></i>Retained</span><b>${short(x.ret)}</b></div>`;
      let left = e.clientX - r.left + 14; if (left > r.width - 210) left -= 230;
      tip.style.left = left + 'px'; tip.style.top = Math.max(0, e.clientY - r.top - 60) + 'px'; tip.classList.add('on');
    };
    chart.onmouseleave = () => tip.classList.remove('on');
    const sum = (k) => months.reduce((a, x) => a + x[k], 0);
    $('#p12bv').textContent = P.num(sum('bv')) + ' BV';
    $('#p12pay').textContent = P.inr(sum('pay'));
    $('#p12ret').textContent = P.inr(sum('ret'));
  }

  ids.forEach((k) => $('#' + k).addEventListener('input', company));
  $('#resetSim').onclick = () => { ids.forEach((k) => ($('#' + k).value = DEFAULTS[k])); company(); TS.toast('Reset to workbook defaults'); };

  /* ---------------------------------------------------------- personal */
  $('#pPkg').innerHTML = P.PACKAGES.map((p) => `<option value="${p.key}" ${p.key === 'pro' ? 'selected' : ''}>${p.name} (cap ${P.inr(p.weeklyCap)}/wk)</option>`).join('');
  $('#pCat').innerHTML = Object.entries(P.CATEGORIES).map(([k, c]) => `<option value="${k}">${c.label} (${P.pct(c.bvRatio)})</option>`).join('');

  function personal() {
    const pkg = $('#pPkg').value;
    const selfBV = (+$('#pSelf').value || 0) * P.CATEGORIES[$('#pCat').value].bvRatio;
    const cashback = selfBV * P.CASHBACK_RATE;
    const direct = (+$('#pDirect').value || 0) * P.DIRECT_RATE;
    // 4 weekly closings; carry-forward accumulates on the power leg
    let cl = 0, cr = 0, binary = 0, flushed = 0;
    for (let w = 0; w < 4; w++) {
      const r = P.binaryClosing({ leftBV: +$('#pLeft').value || 0, rightBV: +$('#pRight').value || 0, carryLeft: cl, carryRight: cr, packageKey: pkg });
      binary += r.paid; flushed += r.flushed; cl = r.carryLeft; cr = r.carryRight;
    }
    const gen = P.generationIncome($('#pGen').value.split(',').map((x) => +x.trim() || 0));
    const lead = (+$('#pLead').value || 0) * P.LEADERSHIP_RATE;
    const commission = direct + binary + gen.total + lead;
    const split = P.splitCommission(commission);

    $('#pKpis').innerHTML = [
      ['Gross monthly income', P.inr(commission), 'excl. cashback & CTO'],
      ['Net to bank', P.inr(split.bankNet), 'after 10% repurchase, TDS, admin'],
      ['Shopping cashback', P.inr(cashback, 2), `5% of ${P.num(selfBV)} BV`],
      ['Carry forward', P.num(Math.max(cl, cr)) + ' BV', cl > cr ? 'Left (power leg)' : cr > cl ? 'Right (power leg)' : 'Balanced'],
    ].map(([l, v, s]) => `<div class="card stat-tile"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join('');

    $('#pTable').innerHTML = [
      ['Smart Shopper Cashback', `5% of own BV → cashback wallet`, cashback],
      ['Direct Referral Booster', `10% of ${P.num(+$('#pDirect').value)} BV`, direct],
      ['Flash Binary Matching', `40% of weaker leg × 4 weeks${flushed ? ` · ${P.inr(flushed)} flushed at cap` : ''}`, binary],
      ['Repurchase Generation', gen.rows.map((r) => `L${r.level} ${P.pct(r.rate)}`).join(' · '), gen.total],
      ['Leadership Check Match', `10% of ${P.inr(+$('#pLead').value)}`, lead],
    ].map(([n, h, v], i) => `<tr><td><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${C[i]};margin-right:8px"></i>${n}</td><td class="small muted">${h}</td><td class="r num">${P.inr(v, 2)}</td></tr>`).join('')
      + `<tr class="total"><td colspan="2">Total commission (to wallets)</td><td class="r num">${P.inr(commission, 2)}</td></tr>`;

    $('#pSplit').innerHTML = [
      ['Gross commission', split.gross], ['Auto-repurchase (10%)', split.repurchase], ['TDS + admin (5% + 5%)', split.tds + split.admin], ['Net to bank', split.bankNet],
    ].map(([l, v]) => `<div class="stat-tile card" style="box-shadow:none"><div class="label">${l}</div><div class="value">${P.inr(v)}</div></div>`).join('');
  }
  TS.$$('#t-personal input, #t-personal select').forEach((el) => el.addEventListener('input', personal));

  company(); personal();
})();
