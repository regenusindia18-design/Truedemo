/* =========================================================================
 * Admin modules: Stores & Inventory, POS, Clinics & Doctors, Appointments,
 * Store & Clinic Reports, Staff & Roles. Registered into admin.js through
 * window.AdminModules. Every screen is filtered by the acting staff user's
 * role permissions and scope (ClinicDB.can / storeIds / clinicIds).
 * ========================================================================= */
(function () {
  'use strict';
  const C = ClinicDB, P = TrueShopPlan, A = AdminDB, $ = TS.$, $$ = TS.$$, esc = TS.esc, inr = P.inr;
  const db = () => C.db;
  const me = () => C.actor();
  const can = (p) => C.can(me(), p);
  const role = (u) => C.ROLES[u.role].label;
  const prod = (pid) => window.TS_PRODUCTS.find((p) => p.id === pid);
  const log = (msg) => A.log(`${me().name} (${role(me())}): ${msg}`);
  const save = () => C.save();
  const err = (e) => TS.toast('⚠️ ' + esc(e.message || e));
  const ui = { store: null, posStore: null, cart: [], member: '', apptTab: 'today' };
  const today = () => C.istDate(Date.now());
  const dt = (t) => new Date(t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const ST = {
    pending_payment: 'chip chip-warn', confirmed: 'chip', checked_in: 'chip chip-blue', completed: 'chip chip-grey',
    cancelled_by_patient: 'chip chip-red', cancelled_by_clinic: 'chip chip-red', no_show: 'chip chip-red', expired: 'chip chip-grey',
    requested: 'chip chip-warn', dispatched: 'chip chip-blue', received: 'chip', active: 'chip', inactive: 'chip chip-grey',
  };
  const chip = (s) => `<span class="${ST[s] || 'chip'}">${esc(s.replace(/_/g, ' '))}</span>`;
  const myStores = () => db().stores.filter((s) => C.storeIds(db(), me()).includes(s.id));
  const storeTabs = (list, cur, attr) => `<div class="tabs">${list.map((s) => `<button data-${attr}="${s.id}" class="${s.id === cur ? 'active' : ''}">${esc(s.name)}</button>`).join('')}</div>`;

  const nav = [
    ['Stores & Clinics'],
    ['stores', '🏬', 'Stores & Inventory', () => db().transfers.filter((t) => t.status !== 'received' && C.storeIds(db(), me()).includes(t.storeId)).length, 'stores.view'],
    ['pos', '🧾', 'POS Counter', null, 'pos.sell'],
    ['appointments', '📅', 'Appointments', () => db().appointments.filter((a) => C.apptVisible(db(), me(), a) && C.istDate(a.start) === today() && ['confirmed', 'checked_in'].includes(a.status)).length, 'appointments.read'],
    ['clinics', '🩺', 'Clinics & Doctors', () => (can('doctors.verify') ? db().doctors.filter((d) => !d.verified).length : 0), 'doctors.view'],
    ['clinic-reports', '📊', 'Store & Clinic Reports', null, 'reports.view'],
    ['staff', '🛡️', 'Staff & Roles', null, 'staff.view'],
  ];
  const views = {};

  /* ======================================================= STORES & INVENTORY */
  views.stores = (el, h) => {
    const d = db(), stores = myStores();
    if (!stores.find((s) => s.id === ui.store)) ui.store = stores[0] && stores[0].id;
    const s = C.byId(d.stores, ui.store);
    const fr = d.franchises.filter((f) => me().scope.type === 'global' || (me().scope.type === 'franchise' && me().scope.id === f.id));
    const inv = d.inventory.filter((i) => i.storeId === ui.store).sort((a, b) => a.pid.localeCompare(b.pid) || a.expiry.localeCompare(b.expiry));
    const soon = (e) => (new Date(e) - Date.now()) / 86400000 < 90;
    const trs = d.transfers.filter((t) => C.storeIds(d, me()).includes(t.storeId)).sort((a, b) => b.t - a.t);
    el.innerHTML = h.head('Stores & Inventory', `Scope: <b>${esc(C.scopeLabel(d, me().scope))}</b>. Store stock is tracked per batch with expiry. Warehouse → store transfers go requested → dispatched → received.`,
      can('franchise.manage') ? '<button class="btn btn-green btn-sm" id="addStore">＋ Add store</button>' : '') + `
      ${fr.map((f) => `<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>🤝 ${esc(f.name)}</h3>${chip(f.status)}</div>
        <div class="grid grid-4 small">
          <div><span class="muted">Owner</span><br><b>${esc(f.owner)}</b></div>
          <div><span class="muted">GSTIN</span><br><b>${esc(f.gstin)}</b></div>
          <div><span class="muted">Territory</span><br><b>${esc(f.territory)}</b></div>
          <div><span class="muted">Agreement</span><br><b>${f.agreementStart} → ${f.agreementEnd}</b></div>
        </div><p class="tiny muted" style="margin:10px 0 0">Franchise margin: <b>not configured</b>. TODO: set the rate once Regenus approves it.</p></div>`).join('')}
      <div class="table-wrap" style="margin-bottom:18px"><table class="dt"><thead><tr><th>Store</th><th>City</th><th>Clinic</th><th class="r">Stock units</th><th class="r">Sales today</th><th>Status</th><th></th></tr></thead><tbody>
      ${stores.map((x) => { const cl = d.clinics.find((c) => c.storeId === x.id); const st = d.sales.filter((y) => y.storeId === x.id && C.istDate(y.t) === today());
        return `<tr><td><b>${esc(x.name)}</b><div class="tiny muted">${x.code} · ${esc(x.phone)}</div></td><td class="small">${esc(x.city)}</td><td class="small">${cl ? esc(cl.name) : '<span class="muted">-</span>'}</td>
        <td class="r num">${P.num(d.inventory.filter((i) => i.storeId === x.id).reduce((a, i) => a + i.qty, 0))}</td><td class="r num">${st.length} · ${inr(st.reduce((a, y) => a + y.total, 0))}</td><td>${chip(x.status)}</td>
        <td>${can('franchise.manage') ? `<button class="btn btn-ghost btn-sm" data-toggle="${x.id}">${x.status === 'active' ? 'Deactivate' : 'Activate'}</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">No stores in your scope</td></tr>'}
      </tbody></table></div>
      ${s ? `<h3 style="margin:8px 0 10px">Inventory</h3>${storeTabs(stores, ui.store, 'st')}
      <div class="table-wrap"><table class="dt"><thead><tr><th>Product</th><th>Batch</th><th>Expiry</th><th class="r">Qty</th><th></th></tr></thead><tbody>
      ${inv.map((i) => { const p = prod(i.pid); return `<tr><td>${p.emoji} ${esc(p.name)}</td><td class="small">${esc(i.batch)}</td>
        <td class="small">${i.expiry === '2099-12-31' ? '<span class="muted">n/a</span>' : esc(i.expiry)} ${soon(i.expiry) ? '<span class="chip chip-warn">expiring</span>' : ''}</td>
        <td class="r num">${i.qty <= 5 ? `<span class="chip chip-red">${i.qty}</span>` : i.qty}</td>
        <td>${can('inventory.adjust') ? `<button class="btn btn-ghost btn-sm" data-adj="${i.id}">Adjust</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">No stock</td></tr>'}
      </tbody></table></div>` : ''}
      <div class="card-h" style="margin:22px 0 10px"><h3>🚚 Stock transfers (warehouse → store)</h3>${can('transfers.manage') && s ? '<button class="btn btn-green btn-sm" id="reqTr">＋ Request stock</button>' : ''}</div>
      <div class="table-wrap"><table class="dt"><thead><tr><th>Transfer</th><th>Store</th><th>Items</th><th>Status</th><th></th></tr></thead><tbody>
      ${trs.map((t) => `<tr><td><b>${t.id}</b><div class="tiny muted">${dt(t.t)}</div></td><td class="small">${esc(C.byId(d.stores, t.storeId).name)}</td>
        <td class="small">${t.items.map((it) => `${prod(it.pid).emoji} ${esc(prod(it.pid).name.split(' ').slice(0, 3).join(' '))} ×${it.qty}`).join('<br>')}</td><td>${chip(t.status)}</td>
        <td>${t.status === 'requested' && can('transfers.dispatch') ? `<button class="btn btn-green btn-sm" data-disp="${t.id}">Dispatch</button>` : ''}
            ${t.status === 'dispatched' && can('transfers.manage') ? `<button class="btn btn-green btn-sm" data-recv="${t.id}">Mark received</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No transfers</td></tr>'}
      </tbody></table></div>`;

    el.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.st) { ui.store = b.dataset.st; h.rerender(); }
      if (b.dataset.toggle) { const x = C.byId(d.stores, b.dataset.toggle); x.status = x.status === 'active' ? 'inactive' : 'active'; save(); log(`Store ${x.code} set ${x.status}`); h.rerender(); }
      if (b.dataset.adj) adjust(C.byId(d.inventory, b.dataset.adj), h);
      if (b.dataset.disp) { const t = C.byId(d.transfers, b.dataset.disp); t.status = 'dispatched'; t.log.push({ s: 'dispatched', t: Date.now() }); save(); log(`Transfer ${t.id} dispatched from warehouse`); TS.toast(`🚚 ${t.id} dispatched`); h.rerender(); }
      if (b.dataset.recv) {
        const t = C.byId(d.transfers, b.dataset.recv), batch = 'WH' + today().replace(/-/g, '').slice(2);
        t.items.forEach((it) => d.inventory.push({ id: 'I' + Date.now() + it.pid, storeId: t.storeId, pid: it.pid, batch, expiry: C.addDays(today(), 540), qty: it.qty }));
        t.status = 'received'; t.log.push({ s: 'received', t: Date.now() }); save(); log(`Transfer ${t.id} received at ${C.byId(d.stores, t.storeId).code}`); TS.toast(`✅ ${t.id} received into stock`); h.rerender();
      }
      if (b.id === 'reqTr') requestStock(h);
      if (b.id === 'addStore') addStore(h);
    };
  };

  function adjust(i, h) {
    const p = prod(i.pid);
    TS.modal('Adjust stock', `<p class="small">${p.emoji} <b>${esc(p.name)}</b> · batch ${esc(i.batch)} · now <b>${i.qty}</b></p>
      <label class="field">New quantity<input id="aq" type="number" min="0" value="${i.qty}"></label>
      <label class="field">Reason<select id="ar"><option>Physical count correction</option><option>Damaged</option><option>Expired, removed</option><option>Sample / display</option></select></label>
      <button class="btn btn-gold" id="aok" style="width:100%">Save</button>`, (b, close) => {
      $('#aok', b).onclick = () => {
        const q = Math.max(0, Math.floor(+$('#aq', b).value || 0)), was = i.qty;
        i.qty = q; save(); log(`Inventory ${p.name} batch ${i.batch} at ${C.byId(db().stores, i.storeId).code}: ${was} → ${q} (${$('#ar', b).value})`);
        close(); TS.toast('Stock updated'); h.rerender();
      };
    });
  }
  function requestStock(h) {
    TS.modal('Request stock from warehouse', `<p class="small muted">For ${esc(C.byId(db().stores, ui.store).name)}</p>
      <label class="field">Product<select id="rp">${window.TS_PRODUCTS.map((p) => `<option value="${p.id}">${p.emoji} ${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field">Quantity<input id="rq" type="number" min="1" value="10"></label>
      <button class="btn btn-gold" id="rok" style="width:100%">Send request</button>`, (b, close) => {
      $('#rok', b).onclick = () => {
        const qty = Math.floor(+$('#rq', b).value); if (!(qty > 0)) return;
        const t = { id: 'TR' + (1000 + db().transfers.length + 1), storeId: ui.store, items: [{ pid: $('#rp', b).value, qty }], status: 'requested', t: Date.now(), log: [{ s: 'requested', t: Date.now() }] };
        db().transfers.push(t); save(); log(`Stock transfer ${t.id} requested for ${C.byId(db().stores, ui.store).code}`); close(); TS.toast(`📦 ${t.id} requested`); h.rerender();
      };
    });
  }
  function addStore(h) {
    const d = db();
    TS.modal('Add store', `
      <label class="field">Franchise<select id="sf">${d.franchises.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select></label>
      <label class="field">Store name<input id="sn" value="TrueShop "></label>
      <label class="field">Store code<input id="sc" placeholder="PUN-HDP-01"></label>
      <label class="field">City<input id="sy" value="Pune"></label>
      <label class="field">Address<input id="sa"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px"><label class="field">Latitude<input id="sla" value="18.52"></label><label class="field">Longitude<input id="slo" value="73.85"></label></div>
      <label class="field">Phone<input id="sp" value="+91 "></label>
      <label class="field">Opening hours<input id="sh" value="Mon–Sat 10:00–21:00"></label>
      <div class="small" id="se" style="color:var(--danger);min-height:1.2em"></div>
      <button class="btn btn-gold" id="sok" style="width:100%">Create store</button>`, (b, close) => {
      $('#sok', b).onclick = () => {
        const v = (id) => $('#' + id, b).value.trim();
        if (!v('sn') || !v('sc') || !v('sa')) { $('#se', b).textContent = 'Name, code and address are required.'; return; }
        if (d.stores.some((x) => x.code.toLowerCase() === v('sc').toLowerCase())) { $('#se', b).textContent = 'That store code already exists.'; return; }
        const s = { id: 'S' + (d.stores.length + 1) + Date.now().toString(36).slice(-3), franchiseId: v('sf'), code: v('sc').toUpperCase(), name: v('sn'), city: v('sy'), address: v('sa'), lat: +v('sla'), lng: +v('slo'), phone: v('sp'), hours: v('sh'), status: 'active' };
        d.stores.push(s); save(); log(`Store ${s.code} (${s.name}) created`); close(); TS.toast('🏬 Store created. It now shows on the public store finder.'); ui.store = s.id; h.rerender();
      };
    });
  }

  /* ======================================================= POS */
  views.pos = (el, h) => {
    const d = db(), stores = myStores().filter((s) => s.status === 'active');
    if (!stores.find((s) => s.id === ui.posStore)) { ui.posStore = stores[0] && stores[0].id; ui.cart = []; }
    if (!ui.posStore) { el.innerHTML = h.head('POS Counter', 'No active store in your scope.'); return; }
    const sid = ui.posStore;
    const lines = ui.cart.map((l) => { const p = prod(l.pid); return { ...l, p, amt: p.dp * l.qty, bv: P.productBV(p.dp, p.category) * l.qty }; });
    const total = lines.reduce((a, l) => a + l.amt, 0);
    const lineBV = P.round2(lines.reduce((a, l) => a + l.bv, 0));
    const who = (code) => {
      const member = code ? A.db.members.find((m) => m.id.toLowerCase() === code.toLowerCase()) : null;
      const doctorCode = C.isDoctorMemberCode(d, code);
      const credit = !!member && member.status !== 'blocked' && !doctorCode;
      const hint = !code ? '<span class="muted">Walk-in customer: no BV.</span>'
        : doctorCode ? '<span style="color:var(--danger)">Doctors cannot earn BV on product sales. Sell as walk-in.</span>'
        : member ? (member.status === 'blocked' ? '<span style="color:var(--danger)">Member is blocked. No BV.</span>' : `✅ <b>${esc(member.name)}</b> · ${esc(member.city)}`) : '<span style="color:var(--danger)">Member code not found.</span>';
      return { member, credit, hint, bv: credit ? lineBV : 0 };
    };
    const w0 = who(ui.member);
    const sales = d.sales.filter((s) => s.storeId === sid).slice(0, 8);
    el.innerHTML = h.head('POS Counter', 'In-store sale. If the customer gives a member code, the order goes into the same 7-day BV escrow and commission flow as an online order.') + `
      ${stores.length > 1 ? storeTabs(stores, sid, 'ps') : `<p class="small"><b>🏬 ${esc(stores[0].name)}</b></p>`}
      <div class="panel-grid">
        <div class="card"><h3>Products in stock</h3><div class="grid grid-3" style="gap:10px">
          ${window.TS_PRODUCTS.filter((p) => C.stockOf(d, sid, p.id) > 0).map((p) => `<button class="btn btn-ghost" style="justify-content:flex-start;text-align:left;height:auto;padding:10px" data-add="${p.id}">
            <span style="font-size:1.4rem">${p.emoji}</span><span class="small" style="line-height:1.25">${esc(p.name.split(' ').slice(0, 4).join(' '))}<br><b>${inr(p.dp)}</b> <span class="tiny muted">· ${C.stockOf(d, sid, p.id)} in stock</span></span></button>`).join('') || '<p class="muted small">No stock. Request a transfer first.</p>'}
        </div></div>
        <div class="card"><h3>Bill</h3>
          ${lines.map((l, i) => `<div class="row small"><span>${l.p.emoji} ${esc(l.p.name.split(' ').slice(0, 3).join(' '))}</span>
            <span><button class="btn btn-ghost btn-sm" data-dec="${i}">−</button> ${l.qty} <button class="btn btn-ghost btn-sm" data-inc="${i}">＋</button> <b>${inr(l.amt)}</b></span></div>`).join('') || '<p class="small muted">Tap products to add them.</p>'}
          <label class="field" style="margin-top:10px">Member code (optional)<input id="mc" value="${esc(ui.member)}" placeholder="e.g. TS10248" autocomplete="off"></label>
          <div class="tiny" id="mh" style="margin:-8px 0 10px;min-height:1.2em">${w0.hint}</div>
          <div class="row"><span>Total (incl. GST)</span><b style="font-size:1.2rem">${inr(total)}</b></div>
          <div class="row"><span>BV to escrow</span><b id="pbv">${P.num(w0.bv)} BV</b></div>
          <div class="row"><span>Payment</span><select class="input" id="pm" style="max-width:150px;margin:0"><option>Cash</option><option>UPI</option><option>Card</option></select></div>
          <button class="btn btn-gold" id="sell" style="width:100%;margin-top:10px" ${lines.length ? '' : 'disabled'}>Complete sale</button>
        </div>
      </div>
      <h3 style="margin:22px 0 10px">Recent sales at this store</h3>
      <div class="table-wrap"><table class="dt"><thead><tr><th>Invoice</th><th>Customer</th><th>Items</th><th>Payment</th><th class="r">Total</th><th class="r">BV</th><th></th></tr></thead><tbody>
      ${sales.map((s) => `<tr><td><b>${s.id}</b><div class="tiny muted">${dt(s.t)} · ${esc(s.by)}</div></td><td class="small">${s.memberCode ? `${esc(s.memberCode)}<div class="tiny muted">${esc(s.memberName)}</div>` : 'Walk-in'}</td>
        <td class="small">${s.items.map((it) => `${prod(it.pid).emoji} ×${it.qty}`).join(' ')}</td><td class="small">${s.pay}</td><td class="r num">${inr(s.total)}</td><td class="r num">${P.num(s.bv)}</td>
        <td><button class="btn btn-ghost btn-sm" data-inv="${s.id}">Invoice</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No sales yet</td></tr>'}
      </tbody></table></div>`;

    $('#mc').oninput = (e) => { ui.member = e.target.value.trim(); const w = who(ui.member); $('#mh').innerHTML = w.hint; $('#pbv').textContent = P.num(w.bv) + ' BV'; };
    el.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.ps) { ui.posStore = b.dataset.ps; ui.cart = []; h.rerender(); }
      if (b.dataset.add) { const l = ui.cart.find((x) => x.pid === b.dataset.add); if (l) { if (l.qty < C.stockOf(d, sid, l.pid)) l.qty++; } else ui.cart.push({ pid: b.dataset.add, qty: 1 }); h.rerender(); }
      if (b.dataset.inc) { const l = ui.cart[+b.dataset.inc]; if (l.qty < C.stockOf(d, sid, l.pid)) l.qty++; h.rerender(); }
      if (b.dataset.dec) { const l = ui.cart[+b.dataset.dec]; if (--l.qty <= 0) ui.cart.splice(+b.dataset.dec, 1); h.rerender(); }
      if (b.dataset.inv) invoice(C.byId(d.sales, b.dataset.inv));
      if (b.id === 'sell') {
        ui.member = $('#mc').value.trim();
        const { member, credit, bv } = who(ui.member);
        try {
          lines.forEach((l) => { if (C.stockOf(d, sid, l.pid) < l.qty) throw new Error(`Not enough ${l.p.name}`); });
          lines.forEach((l) => C.deductStock(d, sid, l.pid, l.qty));
          const sale = { id: 'POS' + Date.now().toString().slice(-7), storeId: sid, t: Date.now(), items: lines.map((l) => ({ pid: l.pid, qty: l.qty, price: l.p.dp })), total, bv: credit ? bv : 0, pay: $('#pm').value, memberCode: credit ? member.id : null, memberName: credit ? member.name : null, by: me().name };
          d.sales.unshift(sale);
          if (credit) { // same order + escrow + commission path as online orders
            A.db.orders.unshift({ id: sale.id, mi: member.idx, t: sale.t, items: sale.items.map((x) => ({ pid: x.pid, qty: x.qty })), pay: sale.pay, paid: total, pointsUsed: 0, bv, status: 'Pending_Escrow', channel: 'offline_store', storeId: sid });
            A.save();
          }
          save(); log(`POS sale ${sale.id} at ${C.byId(d.stores, sid).code}: ${inr(total)}${credit ? `, ${P.num(bv)} BV to ${member.id} (escrow)` : ', walk-in'}`);
          ui.cart = []; ui.member = ''; h.rerender(); invoice(sale);
        } catch (x) { err(x); }
      }
    };
  };

  function invoice(s) {
    const st = C.byId(db().stores, s.storeId), f = C.byId(db().franchises, st.franchiseId);
    TS.modal('Tax invoice ' + s.id, `
      <p class="small" style="margin:0"><b>${esc(st.name)}</b> · ${esc(st.address)}<br><span class="tiny muted">Operated by ${esc(f.name)} · GSTIN ${esc(f.gstin)}</span></p>
      <p class="tiny muted">${new Date(s.t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · ${s.memberCode ? `Member ${esc(s.memberCode)} (${esc(s.memberName)})` : 'Walk-in customer'}</p>
      ${s.items.map((it) => `<div class="row small"><span>${prod(it.pid).emoji} ${esc(prod(it.pid).name)} × ${it.qty}</span><b>${inr(it.price * it.qty)}</b></div>`).join('')}
      <div class="row"><span><b>Total (incl. GST)</b></span><b>${inr(s.total)}</b></div>
      <div class="row small"><span>Paid by</span><span>${s.pay}</span></div>
      <div class="row small"><span>BV</span><span>${P.num(s.bv)} BV${s.bv ? ' · Pending_Escrow for 7 days' : ''}</span></div>
      <button class="btn btn-ghost" style="width:100%;margin-top:10px" onclick="window.print()">🖨 Print</button>`);
  }

  /* ======================================================= CLINICS & DOCTORS */
  views.clinics = (el, h) => {
    const d = db(), cids = C.clinicIds(d, me());
    const clinics = d.clinics.filter((c) => cids.includes(c.id));
    const docs = me().scope.type === 'doctor' ? d.doctors.filter((x) => x.id === me().scope.id)
      : d.doctors.filter((x) => me().scope.type === 'global' || d.schedules.some((s) => s.doctorId === x.id && cids.includes(s.clinicId)));
    const sched = (x) => d.schedules.filter((s) => s.doctorId === x.id).map((s) => `${esc(C.byId(d.clinics, s.clinicId).name.replace('TrueCare Clinic ', ''))}: ${s.days.map((w) => C.WD[w]).join(' ')} ${s.start}–${s.end} · ${s.slotMin} min${s.maxPerSlot > 1 ? ` · ${s.maxPerSlot}/slot` : ''}${s.fee ? ` · ${inr(s.fee)}` : ''}`).join('<br>');
    el.innerHTML = h.head('Clinics & Doctors', 'Unverified doctors are hidden from public booking until their medical council registration is checked.') + `
      <div class="table-wrap" style="margin-bottom:18px"><table class="dt"><thead><tr><th>Clinic</th><th>Store</th><th>Timings</th><th class="r">Doctors</th><th class="r">Today</th><th>Status</th></tr></thead><tbody>
      ${clinics.map((c) => `<tr><td><b>${esc(c.name)}</b><div class="tiny muted">${esc(c.address)}</div></td><td class="small">${c.storeId ? esc(C.byId(d.stores, c.storeId).name) : 'Standalone'}</td><td class="small">${esc(c.timings)}</td>
        <td class="r num">${new Set(d.schedules.filter((s) => s.clinicId === c.id).map((s) => s.doctorId)).size}</td>
        <td class="r num">${d.appointments.filter((a) => a.clinicId === c.id && C.istDate(a.start) === today() && C.isActive(a, Date.now())).length}</td><td>${chip(c.status)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No clinics in your scope</td></tr>'}
      </tbody></table></div>
      <div class="table-wrap"><table class="dt"><thead><tr><th>Doctor</th><th>Registration</th><th>Weekly schedule (IST)</th><th>Leaves</th><th class="r">Fee</th><th></th></tr></thead><tbody>
      ${docs.map((x) => { const lv = d.leaves.filter((l) => l.doctorId === x.id && l.to >= today()); const own = me().scope.type === 'doctor' && me().scope.id === x.id;
        return `<tr><td><b>${esc(x.name)}</b><div class="tiny muted">${esc(x.qualification)} · ${esc(x.specialization)}</div></td>
        <td class="small">${esc(x.council)}<br>${esc(x.regNo)} ${x.verified ? `<span class="chip">verified</span>` : '<span class="chip chip-warn">not verified</span>'}</td>
        <td class="tiny">${sched(x) || '-'}</td>
        <td class="tiny">${lv.map((l) => `${l.from}${l.to !== l.from ? ' → ' + l.to : ''} · ${esc(l.reason)}`).join('<br>') || '<span class="muted">none</span>'}</td>
        <td class="r num">${inr(x.fee)}</td>
        <td><div class="acts">${!x.verified && can('doctors.verify') ? `<button class="btn btn-green btn-sm" data-ver="${x.id}">Verify</button>` : ''}
          ${can('doctors.manage') || own ? `<button class="btn btn-ghost btn-sm" data-leave="${x.id}">Add leave</button>` : ''}</div></td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">No doctors</td></tr>'}
      </tbody></table></div>
      <p class="tiny muted" style="margin-top:12px">Doctors earn no BV, commission or referral income from consultations, prescriptions or product sales. A doctor's member code is refused at the POS.</p>`;
    el.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.ver) {
        const x = C.byId(d.doctors, b.dataset.ver);
        TS.modal('Verify registration', `<p class="small">Check <b>${esc(x.regNo)}</b> against the <b>${esc(x.council)}</b> register before approving.</p>
          <label class="small" style="display:flex;gap:8px"><input type="checkbox" id="vc">I checked the register and the name and qualification match.</label>
          <button class="btn btn-gold" id="vok" style="width:100%;margin-top:12px">Mark verified</button>`, (bd, close) => {
          $('#vok', bd).onclick = () => { if (!$('#vc', bd).checked) return; x.verified = true; x.verifiedBy = me().name; x.verifiedAt = Date.now(); save(); log(`Doctor ${x.name} registration ${x.regNo} verified`); close(); TS.toast(`✅ ${esc(x.name)} is now bookable`); h.rerender(); };
        });
      }
      if (b.dataset.leave) {
        const x = C.byId(d.doctors, b.dataset.leave);
        TS.modal('Add leave for ' + esc(x.name), `<label class="field">From<input type="date" id="lf" value="${today()}"></label><label class="field">To<input type="date" id="lt" value="${today()}"></label>
          <label class="field">Reason<input id="lr" value="Personal leave"></label><button class="btn btn-gold" id="lok" style="width:100%">Save leave</button>`, (bd, close) => {
          $('#lok', bd).onclick = () => {
            const from = $('#lf', bd).value, to = $('#lt', bd).value; if (!from || !to || to < from) return;
            d.leaves.push({ id: 'L' + Date.now(), doctorId: x.id, from, to, reason: $('#lr', bd).value });
            const hit = d.appointments.filter((a) => a.doctorId === x.id && C.isActive(a, Date.now()) && C.istDate(a.start) >= from && C.istDate(a.start) <= to);
            save(); log(`Leave added for ${x.name}: ${from} → ${to}`); close();
            TS.toast(hit.length ? `Leave saved. ⚠️ ${hit.length} booking(s) fall in this period: cancel them from Appointments.` : 'Leave saved. Those days are no longer bookable.', 5000); h.rerender();
          };
        });
      }
    };
  };

  /* ======================================================= APPOINTMENTS */
  views.appointments = (el, h) => {
    const d = db(), now = Date.now(), t0 = today();
    C.releaseExpired(d); C.sendDueReminders(d); save();
    const vis = d.appointments.filter((a) => C.apptVisible(d, me(), a));
    const TABS = { today: (a) => C.istDate(a.start) === t0, upcoming: (a) => a.start > now && C.istDate(a.start) > t0, past: (a) => C.istDate(a.start) < t0, all: () => true };
    const list = vis.filter(TABS[ui.apptTab]).sort((a, b) => (ui.apptTab === 'past' ? b.start - a.start : a.start - b.start));
    const td = vis.filter(TABS.today);
    const isDoc = me().scope.type === 'doctor';
    el.innerHTML = h.head(isDoc ? 'My day list' : 'Appointments', isDoc ? 'Your patients. Only you can read and write their clinical notes.' : `Scope: <b>${esc(C.scopeLabel(d, me().scope))}</b>. Admins and reception see booking details only, never clinical notes.`) + `
      <div class="kpi-grid" style="margin-bottom:18px">
        ${h.kpi('📅', 'Today', td.filter((a) => C.isActive(a, now) || a.status === 'completed').length, 'bookings')}
        ${h.kpi('🛎️', 'Checked in', td.filter((a) => a.status === 'checked_in').length, 'waiting now')}
        ${h.kpi('✅', 'Completed today', td.filter((a) => a.status === 'completed').length)}
        ${h.kpi('🚫', 'No-shows (all time)', vis.filter((a) => a.status === 'no_show').length)}
      </div>
      <div class="tabs">${Object.keys(TABS).map((k) => `<button data-tab="${k}" class="${k === ui.apptTab ? 'active' : ''}">${k[0].toUpperCase() + k.slice(1)} (${vis.filter(TABS[k]).length})</button>`).join('')}</div>
      <div class="table-wrap"><table class="dt"><thead><tr><th>When (IST)</th><th>Patient</th><th>Doctor · Clinic</th><th>Status</th><th class="r">Fee</th><th>Clinical notes</th><th></th></tr></thead><tbody>
      ${list.map((a) => {
        const doc = C.byId(d.doctors, a.doctorId), cl = C.byId(d.clinics, a.clinicId);
        const own = isDoc && me().scope.id === a.doctorId;
        const acts = [];
        if (a.status === 'confirmed' && can('appointments.checkin')) acts.push(`<button class="btn btn-green btn-sm" data-ci="${a.id}">Check in</button>`);
        if (['confirmed', 'checked_in'].includes(a.status) && own) acts.push(`<button class="btn btn-gold btn-sm" data-done="${a.id}">Complete</button>`);
        if (a.status === 'confirmed' && a.start < now && can('appointments.checkin')) acts.push(`<button class="btn btn-ghost btn-sm" data-ns="${a.id}">No-show</button>`);
        if (['confirmed', 'pending_payment'].includes(a.status) && a.start > now && can('appointments.cancel')) acts.push(`<button class="btn btn-ghost btn-sm" data-cx="${a.id}">Cancel</button>`);
        const notes = !a.notes ? '<span class="tiny muted">-</span>'
          : C.canReadNotes(me(), a) ? `<button class="btn btn-ghost btn-sm" data-view="${a.id}">View</button>`
          : can('clinical_notes.privileged') ? `<button class="btn btn-ghost btn-sm" data-bg="${a.id}">🔓 Break-glass</button>` : '<span class="tiny muted">🔒 Restricted</span>';
        return `<tr><td><b>${C.fmt(a.start)}</b><div class="tiny muted">${a.bookingNo}</div></td>
          <td class="small"><b>${esc(a.patient.name)}</b><div class="tiny muted">${a.patient.age ?? '-'} · ${esc(a.patient.gender || '-')} · ${esc(a.patient.relation)}</div></td>
          <td class="small">${esc(doc.name)}<div class="tiny muted">${esc(cl.name)}</div></td>
          <td>${chip(a.status)}${a.status === 'pending_payment' ? `<div class="tiny muted">hold ends ${C.fmtTime(a.holdUntil)}</div>` : ''}</td>
          <td class="r num">${inr(a.fee)}<div class="tiny muted">${a.paymentStatus}${a.refund ? ` · ${a.refund.pct}% back` : ''}</div></td>
          <td>${notes}</td><td><div class="acts">${acts.join('')}</div></td></tr>`;
      }).join('') || '<tr><td colspan="7" class="empty">No appointments</td></tr>'}
      </tbody></table></div>
      <div class="card" style="margin-top:18px"><div class="card-h"><h3>📨 Notification queue (SMS · WhatsApp · Email)</h3><span class="tiny muted">Providers are stubbed in this demo</span></div>
        <div class="timeline-log">${d.notifications.filter((x) => { const a = C.byId(d.appointments, x.apptId); return a && C.apptVisible(d, me(), a); }).slice(0, 8)
          .map((x) => `<div><time>${dt(x.t)}</time><span><b>${esc(x.to)}</b> · ${esc(x.text)}</span></div>`).join('') || '<div><span class="muted">Nothing sent yet</span></div>'}</div></div>`;

    el.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const id = b.dataset.ci || b.dataset.ns || b.dataset.cx || b.dataset.done || b.dataset.view || b.dataset.bg;
      const a = id && C.byId(d.appointments, id);
      try {
        if (b.dataset.tab) { ui.apptTab = b.dataset.tab; h.rerender(); }
        if (b.dataset.ci) { C.checkIn(d, id); save(); log(`Checked in ${a.bookingNo}`); TS.toast('🛎️ Patient checked in'); h.rerender(); }
        if (b.dataset.ns) { C.markNoShow(d, id); save(); log(`Marked ${a.bookingNo} as no-show`); h.rerender(); }
        if (b.dataset.cx) cancelByClinic(a, h);
        if (b.dataset.done) completeModal(a, h);
        if (b.dataset.view) { log(`Read clinical notes of ${a.bookingNo} (treating doctor)`); notesModal(a); }
        if (b.dataset.bg) breakGlass(a);
      } catch (x) { err(x); }
    };
  };

  function cancelByClinic(a, h) {
    TS.modal('Cancel on behalf of clinic', `<p class="small">${esc(a.patient.name)} · ${C.fmt(a.start)}</p>
      <p class="small muted">A clinic cancellation refunds 100% of the fee${a.paymentStatus === 'paid' ? ` (${inr(a.fee)})` : ''}.</p>
      <label class="field">Reason<input id="cr" value="Doctor unavailable"></label><button class="btn btn-gold" id="cok" style="width:100%">Cancel booking</button>`, (b, close) => {
      $('#cok', b).onclick = () => { try { C.cancel(db(), a.id, 'clinic', $('#cr', b).value); save(); log(`Cancelled ${a.bookingNo} (clinic): ${$('#cr', b).value}`); close(); TS.toast('Cancelled. Patient notified and refund initiated.'); h.rerender(); } catch (x) { err(x); } };
    });
  }
  function completeModal(a, h) {
    TS.modal('Consultation notes', `<p class="small">${esc(a.patient.name)} · ${a.patient.age ?? '-'} · ${esc(a.patient.gender || '')}</p>
      <label class="field">Chief complaint<input id="nc"></label>
      <label class="field">Findings<input id="nf"></label>
      <label class="field">Advice<input id="na"></label>
      <label class="field">Prescription <span class="tiny muted">(one per line: medicine | dose | days)</span><textarea id="np" rows="3" class="input" style="width:100%"></textarea></label>
      <p class="tiny muted">Do not prescribe by brand for TrueShop products. Doctors earn nothing from product sales.</p>
      <button class="btn btn-gold" id="nok" style="width:100%">Save and complete</button>`, (b, close) => {
      $('#nok', b).onclick = () => {
        const rx = $('#np', b).value.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((r) => r[0]).map(([drug, dose = '', days = '']) => ({ drug, dose, days }));
        try { C.complete(db(), a.id, me(), { complaint: $('#nc', b).value, findings: $('#nf', b).value, advice: $('#na', b).value }, rx); save(); log(`Completed ${a.bookingNo} and wrote clinical notes`); close(); TS.toast('✅ Consultation completed'); h.rerender(); }
        catch (x) { err(x); }
      };
    });
  }
  function notesModal(a) {
    TS.modal('Clinical notes · ' + a.bookingNo, `
      <div class="row"><span>Complaint</span><span class="small">${esc(a.notes.complaint || '-')}</span></div>
      <div class="row"><span>Findings</span><span class="small">${esc(a.notes.findings || '-')}</span></div>
      <div class="row"><span>Advice</span><span class="small">${esc(a.notes.advice || '-')}</span></div>
      <div class="row"><span>Prescription</span><span class="small">${(a.prescription || []).map((r) => `${esc(r.drug)} · ${esc(r.dose)} · ${esc(r.days)}d`).join('<br>') || '-'}</span></div>
      <p class="tiny muted" style="margin-top:10px">This read has been recorded in the audit log.</p>`);
  }
  function breakGlass(a) {
    TS.modal('Break-glass access', `<p class="small">Clinical notes are restricted to the treating doctor. Opening them needs a reason and is permanently recorded in the audit log.</p>
      <label class="field">Reason<input id="bgr" placeholder="e.g. Patient complaint GRV-1042 investigation"></label><button class="btn btn-gold" id="bgo" style="width:100%">Open notes</button>`, (b, close) => {
      $('#bgo', b).onclick = () => { const r = $('#bgr', b).value.trim(); if (r.length < 8) { TS.toast('Please give a specific reason'); return; } log(`BREAK-GLASS read of clinical notes ${a.bookingNo}. Reason: ${r}`); close(); notesModal(a); };
    });
  }

  /* ======================================================= REPORTS */
  views['clinic-reports'] = (el, h) => {
    const d = db(), stores = myStores(), cids = C.clinicIds(d, me());
    const srows = stores.map((s) => { const ss = d.sales.filter((x) => x.storeId === s.id); return [s.name, ss.length, ss.filter((x) => x.memberCode).length, ss.reduce((a, x) => a + x.total, 0), ss.reduce((a, x) => a + x.bv, 0)]; });
    const showClinic = can('appointments.read');
    const appts = d.appointments.filter((a) => C.apptVisible(d, me(), a));
    const pairs = [...new Set(appts.map((a) => a.doctorId + '|' + a.clinicId))];
    const crows = pairs.map((k) => {
      const [doc, cl] = k.split('|'), xs = appts.filter((a) => a.doctorId === doc && a.clinicId === cl);
      const paid = xs.filter((a) => a.paymentStatus !== 'pending' && a.payment).reduce((s, a) => s + a.fee - (a.refund ? a.refund.amount : 0), 0);
      return [C.byId(d.doctors, doc).name, C.byId(d.clinics, cl).name, xs.length, xs.filter((a) => a.status === 'completed').length, xs.filter((a) => a.status === 'no_show').length, xs.filter((a) => a.status.startsWith('cancelled')).length, paid];
    });
    el.innerHTML = h.head('Store & Clinic Reports', `Scope: <b>${esc(C.scopeLabel(d, me().scope))}</b>.`, '<button class="btn btn-ghost btn-sm" id="csv">⬇ Export CSV</button>') + `
      ${stores.length ? `<h3 style="margin:0 0 10px">🏬 Store sales (POS)</h3><div class="table-wrap" style="margin-bottom:22px"><table class="dt"><thead><tr><th>Store</th><th class="r">Bills</th><th class="r">Member bills</th><th class="r">Revenue</th><th class="r">BV to escrow</th></tr></thead><tbody>
        ${srows.map((r) => `<tr><td>${esc(r[0])}</td><td class="r num">${r[1]}</td><td class="r num">${r[2]}</td><td class="r num">${inr(r[3])}</td><td class="r num">${P.num(r[4])}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${showClinic ? `<h3 style="margin:0 0 10px">🩺 Consultations by doctor and clinic</h3><div class="table-wrap"><table class="dt"><thead><tr><th>Doctor</th><th>Clinic</th><th class="r">Bookings</th><th class="r">Completed</th><th class="r">No-shows</th><th class="r">Cancelled</th><th class="r">Net fee revenue</th></tr></thead><tbody>
        ${crows.map((r) => `<tr><td>${esc(r[0])}</td><td class="small">${esc(r[1])}</td><td class="r num">${r[2]}</td><td class="r num">${r[3]}</td><td class="r num">${r[4]}</td><td class="r num">${r[5]}</td><td class="r num">${inr(r[6])}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No bookings</td></tr>'}</tbody></table></div>
        <p class="tiny muted" style="margin-top:10px">Consultation revenue generates 0 BV and is excluded from the 70% payout pool. The fee split between clinic, doctor and franchise is not configured yet (TODO).</p>` : ''}`;
    $('#csv').onclick = () => h.downloadCSV('store-clinic-report.csv', [['Store', 'Bills', 'Member bills', 'Revenue', 'BV'], ...srows, [], ...(showClinic ? [['Doctor', 'Clinic', 'Bookings', 'Completed', 'No-shows', 'Cancelled', 'Net revenue'], ...crows] : [])]);
  };

  /* ======================================================= STAFF & ROLES */
  views.staff = (el, h) => {
    const d = db(), u = me();
    const list = d.staff.filter((s) => u.scope.type === 'global' || C.scopeWithin(d, u, s.scope));
    const roles = Object.entries(C.ROLES);
    el.innerHTML = h.head('Staff & Roles', 'Each staff user has one role and one scope. A user can only grant roles whose permissions they already hold, inside their own scope. Use <b>View as</b> to see the panel exactly as that person would.',
      can('staff.manage') ? '<button class="btn btn-green btn-sm" id="addStaff">＋ Add staff</button>' : '') + `
      <div class="table-wrap" style="margin-bottom:22px"><table class="dt"><thead><tr><th>Name</th><th>Role</th><th>Scope</th><th></th></tr></thead><tbody>
      ${list.map((s) => `<tr><td><b>${esc(s.name)}</b>${s.id === u.id ? ' <span class="chip chip-gold">you</span>' : ''}</td><td>${esc(role(s))}</td><td class="small">${esc(C.scopeLabel(d, s.scope))}</td>
        <td>${s.id !== u.id ? `<button class="btn btn-ghost btn-sm" data-as="${s.id}">👁 View as</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
      <h3 style="margin:0 0 10px">Role matrix</h3>
      <div class="table-wrap"><table class="dt"><thead><tr><th>Permission</th>${roles.map(([, r]) => `<th class="r" style="white-space:normal;font-size:.72rem">${esc(r.label)}</th>`).join('')}</tr></thead><tbody>
      ${Object.entries(C.PERMS).map(([p, label]) => `<tr><td class="small"><code>${p}</code><div class="tiny muted">${esc(label)}</div></td>${roles.map(([, r]) => `<td class="r">${r.perms.includes(p) ? '✅' : '<span class="muted">·</span>'}</td>`).join('')}</tr>`).join('')}
      <tr><td class="small"><b>Scope</b></td>${roles.map(([, r]) => `<td class="r tiny">${r.scope}</td>`).join('')}</tr>
      </tbody></table></div>
      <p class="tiny muted" style="margin-top:10px">Super Admin reads clinical notes only through audited break-glass. Doctors see only their own patients.</p>`;
    el.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.as) { const s = C.byId(d.staff, b.dataset.as); log(`Started viewing the panel as ${s.name} (${role(s)})`); C.setActor(s.id); TS.toast(`👁 Now viewing as ${esc(s.name)}`); location.hash = ''; h.rerender(); }
      if (b.id === 'addStaff') addStaff(h);
    };
  };

  function scopeOptions(d, type) {
    const list = { global: [{ id: '', name: 'All of TrueShop' }], franchise: d.franchises, store: d.stores, clinic: d.clinics, doctor: d.doctors }[type];
    return list.filter((x) => C.scopeWithin(d, me(), { type, id: x.id }));
  }
  function addStaff(h) {
    const d = db();
    const grantable = Object.entries(C.ROLES).filter(([k, r]) => scopeOptions(d, r.scope).some((x) => C.canGrant(d, me(), k, { type: r.scope, id: x.id || undefined })));
    if (!grantable.length) { TS.toast('There are no roles you are allowed to grant.'); return; }
    TS.modal('Add staff user', `
      <label class="field">Full name<input id="un"></label>
      <label class="field">Mobile<input id="um" value="+91 "></label>
      <label class="field">Role<select id="ur">${grantable.map(([k, r]) => `<option value="${k}">${esc(r.label)}</option>`).join('')}</select></label>
      <label class="field">Scope<select id="us"></select></label>
      <p class="tiny muted">Only roles you are allowed to grant are listed. Staff sign in with OTP; admins also need TOTP MFA.</p>
      <div class="small" id="ue" style="color:var(--danger);min-height:1.2em"></div>
      <button class="btn btn-gold" id="uok" style="width:100%">Create user</button>`, (b, close) => {
      const fill = () => { const r = C.ROLES[$('#ur', b).value]; $('#us', b).innerHTML = scopeOptions(d, r.scope).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join(''); };
      $('#ur', b).onchange = fill; fill();
      $('#uok', b).onclick = () => {
        const roleKey = $('#ur', b).value, r = C.ROLES[roleKey], scope = r.scope === 'global' ? { type: 'global' } : { type: r.scope, id: $('#us', b).value };
        const name = $('#un', b).value.trim();
        if (!name) { $('#ue', b).textContent = 'Name is required.'; return; }
        if (!C.canGrant(d, me(), roleKey, scope)) { $('#ue', b).textContent = 'You cannot grant this role at this scope.'; return; }
        const s = { id: 'U' + Date.now().toString(36), name, mobile: $('#um', b).value.trim(), role: roleKey, scope };
        d.staff.push(s); save(); log(`Created staff ${name} as ${r.label} at ${C.scopeLabel(d, scope)}`); close(); TS.toast('👤 Staff user created'); h.rerender();
      };
    });
  }

  /* ======================================================= chrome hook */
  function decorate(el) {
    const u = me();
    $('.abar-me-txt').innerHTML = `<b>${esc(u.name)}</b><span class="tiny muted">${esc(role(u))}</span>`;
    $('.abar-me-av').textContent = u.name.replace('Dr. ', '')[0];
    if (u.id === 'U1') return;
    el.insertAdjacentHTML('afterbegin', `<div class="card" style="margin-bottom:16px;border-left:4px solid var(--gold);display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px 16px">
      <span class="small">👁 Viewing as <b>${esc(u.name)}</b> · ${esc(role(u))}${u.scope.type === 'doctor' ? '' : ' · ' + esc(C.scopeLabel(db(), u.scope))}. The menu and data are limited to what this role may see.</span>
      <button class="btn btn-ghost btn-sm" id="backAdmin">Back to Super Admin</button></div>`);
    $('#backAdmin', el).onclick = () => { log('Stopped "view as"'); C.setActor(null); location.hash = 'staff'; window.dispatchEvent(new HashChangeEvent('hashchange')); };
  }

  window.AdminModules = { nav, views, decorate };
})();
