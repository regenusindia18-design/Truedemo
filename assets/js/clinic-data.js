/* =========================================================================
 * TrueShop offline stores, clinics, doctors and appointments (demo).
 * Seed data + pure business logic shared by clinics.html, the admin panel
 * and tests/clinic.test.js. Persisted in localStorage in the browser.
 *
 * Times are stored as UTC epoch ms and shown in Asia/Kolkata (IST).
 * Consultations NEVER generate BV or commission (medical ethics rule).
 * ========================================================================= */
(function (root) {
  'use strict';
  const KEY = 'trueshop-clinic-v1';
  const MIN = 60000, HOUR = 3600000, DAY = 86400000, IST = 330 * MIN;
  const HOLD_MINUTES = 10;
  const CONSULTATION_BV = 0;
  const ACTIVE = ['pending_payment', 'confirmed', 'checked_in'];

  // DEMO VALUES ONLY. TODO: replace with the refund policy Regenus approves.
  const POLICY = {
    refundTiers: [{ minHours: 24, pct: 100 }, { minHours: 2, pct: 50 }, { minHours: 0, pct: 0 }],
    cancelCutoffHours: 0,      // patients may cancel until the slot starts (refund per tier)
    rescheduleCutoffHours: 2,  // no reschedule inside 2 hours
  };

  /* ------------------------------------------------------------ time (IST) */
  const pad = (n) => String(n).padStart(2, '0');
  const istDate = (t) => new Date(t + IST).toISOString().slice(0, 10);              // 'YYYY-MM-DD'
  const istToUtc = (date, hhmm) => {
    const [y, m, d] = date.split('-').map(Number), [h, mi] = hhmm.split(':').map(Number);
    return Date.UTC(y, m - 1, d, h, mi) - IST;
  };
  const weekday = (date) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
  const addDays = (date, n) => istDate(istToUtc(date, '12:00') + n * DAY);
  const fmtTime = (t) => { const d = new Date(t + IST); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
  const fmt = (t) => new Date(t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtDay = (date) => new Date(istToUtc(date, '12:00')).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short' });
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /* ------------------------------------------------------------ roles */
  const PERMS = {
    'mlm.manage': 'Members, network, orders, plan settings',
    'finance.approve': 'Payout runs and withdrawals',
    'audit.view': 'Audit log',
    'franchise.manage': 'Create franchises and stores',
    'stores.view': 'View stores',
    'inventory.view': 'View store inventory',
    'inventory.adjust': 'Adjust store inventory',
    'transfers.manage': 'Request / receive stock transfers',
    'transfers.dispatch': 'Dispatch stock from warehouse',
    'pos.sell': 'POS counter sales',
    'doctors.view': 'View clinics and doctors',
    'doctors.manage': 'Edit doctors, schedules and leaves',
    'doctors.verify': 'Verify doctor registration',
    'appointments.read': 'View appointments',
    'appointments.checkin': 'Check in patients',
    'appointments.cancel': 'Cancel appointments',
    'appointments.complete': 'Complete consultations',
    'clinical_notes.read': 'Read own patients\' clinical notes',
    'clinical_notes.write': 'Write clinical notes and prescriptions',
    'clinical_notes.privileged': 'Break-glass read of any clinical note (audited)',
    'staff.view': 'View staff',
    'staff.manage': 'Add staff and assign roles',
    'reports.view': 'Store and clinic reports',
  };
  const ALL = Object.keys(PERMS);
  const without = (list) => ALL.filter((p) => !list.includes(p));
  const ROLES = {
    super_admin: { label: 'Super Admin', scope: 'global', perms: without(['clinical_notes.read', 'clinical_notes.write']) },
    admin_ops: { label: 'Admin (Operations)', scope: 'global', perms: without(['finance.approve', 'clinical_notes.read', 'clinical_notes.write', 'clinical_notes.privileged']) },
    franchise_owner: { label: 'Franchise Owner', scope: 'franchise', perms: ['stores.view', 'inventory.view', 'inventory.adjust', 'transfers.manage', 'pos.sell', 'doctors.view', 'appointments.read', 'appointments.checkin', 'appointments.cancel', 'staff.view', 'staff.manage', 'reports.view'] },
    store_manager: { label: 'Store Manager', scope: 'store', perms: ['stores.view', 'inventory.view', 'inventory.adjust', 'transfers.manage', 'pos.sell', 'staff.view', 'reports.view'] },
    cashier: { label: 'Cashier', scope: 'store', perms: ['stores.view', 'pos.sell'] },
    clinic_receptionist: { label: 'Clinic Receptionist', scope: 'clinic', perms: ['doctors.view', 'appointments.read', 'appointments.checkin', 'appointments.cancel'] },
    doctor: { label: 'Doctor', scope: 'doctor', perms: ['doctors.view', 'appointments.read', 'appointments.complete', 'clinical_notes.read', 'clinical_notes.write'] },
  };

  /* ------------------------------------------------------------ seed */
  function seed(now = Date.now()) {
    const today = istDate(now);
    const ago = (days, hhmm) => istToUtc(addDays(today, -days), hhmm);
    const db = {
      v: 1,
      franchises: [{ id: 'F1', name: 'Shree Wellness Ventures LLP', owner: 'Mahesh Kulkarni', gstin: '27AAAAA0000A1Z5', territory: 'Pune District', agreementStart: '2026-04-01', agreementEnd: '2031-03-31', status: 'active' }],
      stores: [
        { id: 'S1', franchiseId: 'F1', code: 'PUN-KTH-01', name: 'TrueShop Kothrud', city: 'Pune', address: 'Karve Road, Kothrud, Pune 411038', lat: 18.5074, lng: 73.8077, phone: '+91 20 4000 1001', hours: 'Mon–Sat 10:00–21:00 · Sun 10:00–14:00', status: 'active' },
        { id: 'S2', franchiseId: 'F1', code: 'PCM-WKD-01', name: 'TrueShop Wakad', city: 'Pimpri-Chinchwad', address: 'Datta Mandir Road, Wakad, Pune 411057', lat: 18.5986, lng: 73.7700, phone: '+91 20 4000 1002', hours: 'Mon–Sun 10:00–21:00', status: 'active' },
      ],
      clinics: [
        { id: 'C1', storeId: 'S1', name: 'TrueCare Clinic Kothrud', city: 'Pune', address: 'First floor, TrueShop Kothrud, Karve Road', timings: 'Mon–Sat 10:00–20:00', status: 'active' },
        { id: 'C2', storeId: 'S2', name: 'TrueCare Clinic Wakad', city: 'Pimpri-Chinchwad', address: 'Inside TrueShop Wakad, Datta Mandir Road', timings: 'Mon–Sat 11:00–20:00', status: 'active' },
      ],
      doctors: [
        { id: 'D1', name: 'Dr. Anjali Mehta', qualification: 'MBBS, MD (General Medicine)', specialization: 'General Physician', council: 'Maharashtra Medical Council', regNo: 'MMC-2011-04567', verified: true, verifiedBy: 'Super Admin', fee: 400, languages: ['English', 'Hindi', 'Marathi'], bio: '14 years in family medicine, diabetes and lifestyle disorders.', status: 'active', memberCode: null },
        { id: 'D2', name: 'Dr. Rohan Kulkarni', qualification: 'BAMS, MD (Ayurveda)', specialization: 'Ayurveda', council: 'Maharashtra Council of Indian Medicine', regNo: 'MCIM-I-58213', verified: true, verifiedBy: 'Super Admin', fee: 300, languages: ['Marathi', 'Hindi'], bio: 'Panchakarma and digestive health.', status: 'active', memberCode: null },
        { id: 'D3', name: 'Dr. Sneha Iyer', qualification: 'MBBS, DNB (Dermatology)', specialization: 'Dermatologist', council: 'Maharashtra Medical Council', regNo: 'MMC-2016-11873', verified: false, verifiedBy: null, fee: 600, languages: ['English', 'Tamil', 'Hindi'], bio: 'Acne, pigmentation and hair-loss clinics.', status: 'active', memberCode: null },
      ],
      // weekday 0 = Sunday. slotMin = slot length, maxPerSlot = patients per slot.
      schedules: [
        { id: 'SC1', doctorId: 'D1', clinicId: 'C1', days: [1, 2, 3, 4, 5, 6], start: '10:00', end: '13:00', slotMin: 15, maxPerSlot: 1 },
        { id: 'SC2', doctorId: 'D1', clinicId: 'C2', days: [1, 3, 5], start: '17:00', end: '20:00', slotMin: 15, maxPerSlot: 2 },
        { id: 'SC3', doctorId: 'D2', clinicId: 'C1', days: [2, 4, 6], start: '16:00', end: '19:00', slotMin: 20, maxPerSlot: 1, fee: 350 },
        { id: 'SC4', doctorId: 'D3', clinicId: 'C2', days: [2, 3, 4, 5, 6], start: '11:00', end: '14:00', slotMin: 15, maxPerSlot: 1 },
      ],
      leaves: [{ id: 'L1', doctorId: 'D1', from: addDays(today, 3), to: addDays(today, 3), reason: 'Medical conference' }],
      inventory: [
        { id: 'I1', storeId: 'S1', pid: 'h1', batch: 'AW2609', expiry: '2027-09-30', qty: 40 },
        { id: 'I2', storeId: 'S1', pid: 'h2', batch: 'MV2611', expiry: '2027-11-30', qty: 25 },
        { id: 'I3', storeId: 'S1', pid: 'h5', batch: 'KD2603', expiry: '2027-01-15', qty: 12 },
        { id: 'I4', storeId: 'S1', pid: 'p1', batch: 'FW2608', expiry: '2028-08-31', qty: 30 },
        { id: 'I5', storeId: 'S1', pid: 'p4', batch: 'HO2605', expiry: '2028-05-31', qty: 18 },
        { id: 'I6', storeId: 'S2', pid: 'h1', batch: 'AW2610', expiry: '2027-10-31', qty: 22 },
        { id: 'I7', storeId: 'S2', pid: 'h3', batch: 'PS2609', expiry: '2027-03-31', qty: 10 },
        { id: 'I8', storeId: 'S2', pid: 'p2', batch: 'AV2607', expiry: '2028-07-31', qty: 26 },
        { id: 'I9', storeId: 'S2', pid: 'l3', batch: 'YM2601', expiry: '2099-12-31', qty: 8 },
      ],
      transfers: [{ id: 'TR1001', storeId: 'S2', items: [{ pid: 'h2', qty: 20 }, { pid: 'p1', qty: 15 }], status: 'requested', t: now - 1 * DAY, log: [{ s: 'requested', t: now - 1 * DAY }] }],
      sales: [],
      staff: [
        { id: 'U1', name: 'Super Admin', role: 'super_admin', scope: { type: 'global' } },
        { id: 'U2', name: 'Neha Joshi', role: 'admin_ops', scope: { type: 'global' } },
        { id: 'U3', name: 'Mahesh Kulkarni', role: 'franchise_owner', scope: { type: 'franchise', id: 'F1' } },
        { id: 'U4', name: 'Ravi Patil', role: 'store_manager', scope: { type: 'store', id: 'S1' } },
        { id: 'U5', name: 'Kavya Shah', role: 'store_manager', scope: { type: 'store', id: 'S2' } },
        { id: 'U6', name: 'Sahil More', role: 'cashier', scope: { type: 'store', id: 'S1' } },
        { id: 'U7', name: 'Pooja Jadhav', role: 'clinic_receptionist', scope: { type: 'clinic', id: 'C1' } },
        { id: 'U8', name: 'Dr. Anjali Mehta', role: 'doctor', scope: { type: 'doctor', id: 'D1' } },
        { id: 'U9', name: 'Dr. Rohan Kulkarni', role: 'doctor', scope: { type: 'doctor', id: 'D2' } },
      ],
      appointments: [],
      notifications: [],
      seq: 1000,
    };
    // A little history so reports and "My appointments" are not empty.
    const past = [
      ['D1', 'C1', ago(6, '10:30'), 'completed', { name: 'Aarav Deshmukh', age: 34, gender: 'M', relation: 'Self' }, 'TS10248'],
      ['D2', 'C1', ago(5, '16:20'), 'completed', { name: 'Meera Patil', age: 52, gender: 'F', relation: 'Self' }, 'CUST-2201'],
      ['D1', 'C2', ago(4, '17:15'), 'no_show', { name: 'Kunal Shinde', age: 29, gender: 'M', relation: 'Self' }, 'CUST-2202'],
      ['D1', 'C1', ago(2, '11:00'), 'cancelled_by_patient', { name: 'Riya Gupta', age: 41, gender: 'F', relation: 'Self' }, 'CUST-2203'],
    ];
    past.forEach(([doctorId, clinicId, start, status, patient, bookedBy]) => {
      const a = makeAppt(db, { doctorId, clinicId, start, patient, bookedBy, consent: true }, start - 3 * DAY);
      a.status = 'confirmed'; a.paymentStatus = 'paid'; a.payment = { method: 'UPI', amount: a.fee, t: start - 3 * DAY };
      a.status = status;
      if (status === 'completed') {
        a.notes = { complaint: 'Fatigue and poor sleep for 3 weeks', findings: 'BP 128/82. No acute findings.', advice: 'Sleep hygiene, 30 min daily walk. Review in 4 weeks.', by: doctorId, t: start + 20 * MIN };
        a.prescription = [{ drug: 'Vitamin D3 60,000 IU', dose: 'Once a week', days: 8 }];
      }
      if (status === 'cancelled_by_patient') { a.refund = { pct: 100, amount: a.fee }; a.paymentStatus = 'refunded'; a.cancelReason = 'Travelling'; }
      a.history.push({ s: status, t: start });
      db.appointments.push(a);
    });
    // Upcoming paid bookings: the next free slots from today onwards.
    [['D1', 'C1', { name: 'Sneha Pawar', age: 27, gender: 'F', relation: 'Self' }, 'CUST-2210'],
     ['D1', 'C1', { name: 'Omkar Jadhav', age: 8, gender: 'M', relation: 'Child' }, 'CUST-2211'],
     ['D2', 'C1', { name: 'Gauri Chavan', age: 46, gender: 'F', relation: 'Self' }, 'CUST-2212'],
     ['D1', 'C2', { name: 'Yash Bhosale', age: 38, gender: 'M', relation: 'Self' }, 'CUST-2213'],
    ].forEach(([doctorId, clinicId, patient, bookedBy]) => {
      for (let i = 0; i < 4; i++) {
        const s = availableSlots(db, doctorId, clinicId, addDays(today, i), now)[0];
        if (s) { const a = book(db, { doctorId, clinicId, start: s.start, patient, bookedBy, consent: true }, now); pay(db, a.id, 'UPI', now); break; }
      }
    });
    return db;
  }

  /* ------------------------------------------------------------ slots */
  const byId = (list, id) => list.find((x) => x.id === id);
  const isActive = (a, now) => ACTIVE.includes(a.status) && !(a.status === 'pending_payment' && a.holdUntil <= now);
  const onLeave = (db, doctorId, date) => db.leaves.some((l) => l.doctorId === doctorId && date >= l.from && date <= l.to);

  /** Bookable slots for a doctor at a clinic on an IST date: schedule − leave − past − full. */
  function availableSlots(db, doctorId, clinicId, date, now = Date.now(), ignoreApptId = null) {
    const doc = byId(db.doctors, doctorId), clinic = byId(db.clinics, clinicId);
    if (!doc || !clinic || doc.status !== 'active' || clinic.status !== 'active' || onLeave(db, doctorId, date)) return [];
    const out = [];
    db.schedules.filter((s) => s.doctorId === doctorId && s.clinicId === clinicId && s.days.includes(weekday(date))).forEach((s) => {
      const from = istToUtc(date, s.start), to = istToUtc(date, s.end);
      for (let t = from; t + s.slotMin * MIN <= to; t += s.slotMin * MIN) {
        if (t <= now) continue;
        const taken = db.appointments.filter((a) => a.id !== ignoreApptId && a.doctorId === doctorId && a.start < t + s.slotMin * MIN && a.end > t && isActive(a, now)).length;
        if (taken < s.maxPerSlot) out.push({ start: t, end: t + s.slotMin * MIN, left: s.maxPerSlot - taken, fee: s.fee ?? doc.fee, clinicId });
      }
    });
    return out.sort((a, b) => a.start - b.start);
  }

  /* ------------------------------------------------------------ appointments */
  function makeAppt(db, { doctorId, clinicId, start, patient, bookedBy, consent }, now) {
    const slot = availableSlots(db, doctorId, clinicId, istDate(start), now).find((s) => s.start === start);
    const sched = db.schedules.find((s) => s.doctorId === doctorId && s.clinicId === clinicId && s.days.includes(weekday(istDate(start))));
    const fee = slot ? slot.fee : (sched && sched.fee) ?? byId(db.doctors, doctorId).fee;
    db.seq++;
    return {
      id: 'A' + db.seq, bookingNo: 'TC' + istDate(now).replace(/-/g, '').slice(2) + db.seq,
      doctorId, clinicId, start, end: start + (sched ? sched.slotMin : 15) * MIN, mode: 'in_clinic',
      patient, bookedBy, consentAt: consent ? now : null,
      status: 'pending_payment', holdUntil: now + HOLD_MINUTES * MIN,
      fee, bv: CONSULTATION_BV, commission: 0, paymentStatus: 'pending', payment: null, refund: null,
      notes: null, prescription: null, cancelReason: null, createdAt: now,
      history: [{ s: 'pending_payment', t: now }],
    };
  }

  function book(db, req, now = Date.now()) {
    if (!req.consent) throw new Error('Patient consent is required to book (DPDP Act 2023).');
    if (!req.patient || !req.patient.name) throw new Error('Patient name is required.');
    const doc = byId(db.doctors, req.doctorId);
    if (!doc || !doc.verified) throw new Error('This doctor is not available for booking.');
    releaseExpired(db, now);
    const ok = availableSlots(db, req.doctorId, req.clinicId, istDate(req.start), now).some((s) => s.start === req.start);
    if (!ok) throw new Error('That slot was just taken. Please pick another time.');
    const a = makeAppt(db, req, now);
    db.appointments.push(a);
    notify(db, a, 'held', now);
    return a;
  }

  function setStatus(a, s, now, note) { a.status = s; a.history.push({ s, t: now, note }); }
  const find = (db, id) => { const a = byId(db.appointments, id); if (!a) throw new Error('Appointment not found'); return a; };

  function pay(db, id, method, now = Date.now()) {
    const a = find(db, id);
    if (a.status !== 'pending_payment') throw new Error('This booking is not awaiting payment.');
    if (a.holdUntil <= now) { setStatus(a, 'expired', now, 'Payment window closed'); throw new Error('The 10-minute hold expired and the slot was released.'); }
    a.payment = { method, amount: a.fee, t: now, ref: 'PAY' + now.toString(36).toUpperCase() };
    a.paymentStatus = 'paid';
    a.bv = CONSULTATION_BV; a.commission = 0; // consultations never enter the BV / commission flow
    setStatus(a, 'confirmed', now);
    notify(db, a, 'confirmed', now);
    return a;
  }

  function releaseExpired(db, now = Date.now()) {
    let n = 0;
    db.appointments.forEach((a) => { if (a.status === 'pending_payment' && a.holdUntil <= now) { setStatus(a, 'expired', now, 'Hold released after 10 minutes'); n++; } });
    return n;
  }

  function refundPct(a, now = Date.now(), by = 'patient') {
    if (a.paymentStatus !== 'paid') return 0;
    if (by === 'clinic') return 100;
    const h = (a.start - now) / HOUR;
    return (POLICY.refundTiers.find((tier) => h >= tier.minHours) || { pct: 0 }).pct;
  }

  function cancel(db, id, by, reason, now = Date.now()) {
    const a = find(db, id);
    if (!['pending_payment', 'confirmed'].includes(a.status)) throw new Error('Only upcoming bookings can be cancelled.');
    if (by === 'patient' && a.start - now < POLICY.cancelCutoffHours * HOUR) throw new Error('Too late to cancel online. Please call the clinic.');
    const pct = refundPct(a, now, by);
    if (a.paymentStatus === 'paid') { a.refund = { pct, amount: Math.round(a.fee * pct) / 100, t: now }; a.paymentStatus = pct > 0 ? 'refunded' : 'paid'; }
    a.cancelReason = reason || null;
    setStatus(a, by === 'clinic' ? 'cancelled_by_clinic' : 'cancelled_by_patient', now, reason);
    notify(db, a, 'cancelled', now);
    return a;
  }

  function reschedule(db, id, newStart, now = Date.now()) {
    const a = find(db, id);
    if (a.status !== 'confirmed') throw new Error('Only confirmed bookings can be rescheduled.');
    if (a.start - now < POLICY.rescheduleCutoffHours * HOUR) throw new Error(`Rescheduling closes ${POLICY.rescheduleCutoffHours} hours before the appointment.`);
    const ok = availableSlots(db, a.doctorId, a.clinicId, istDate(newStart), now, a.id).some((s) => s.start === newStart);
    if (!ok) throw new Error('That slot is not available.');
    const len = a.end - a.start;
    a.history.push({ s: 'rescheduled', t: now, note: `${fmt(a.start)} → ${fmt(newStart)}` });
    a.start = newStart; a.end = newStart + len;
    notify(db, a, 'rescheduled', now);
    return a;
  }

  function checkIn(db, id, now = Date.now()) {
    const a = find(db, id);
    if (a.status !== 'confirmed') throw new Error('Only confirmed bookings can be checked in.');
    setStatus(a, 'checked_in', now); return a;
  }
  function markNoShow(db, id, now = Date.now()) {
    const a = find(db, id);
    if (a.status !== 'confirmed') throw new Error('Only confirmed bookings can be marked no-show.');
    setStatus(a, 'no_show', now); return a;
  }
  /** Only the treating doctor can complete and write notes. */
  function complete(db, id, actor, notes, prescription, now = Date.now()) {
    const a = find(db, id);
    if (!(actor.role === 'doctor' && actor.scope.id === a.doctorId)) throw new Error('Only the treating doctor can write clinical notes.');
    if (!['confirmed', 'checked_in'].includes(a.status)) throw new Error('This appointment cannot be completed.');
    a.notes = { ...notes, by: a.doctorId, t: now };
    a.prescription = prescription || [];
    setStatus(a, 'completed', now); return a;
  }

  /* ------------------------------------------------------------ notifications (stubbed) */
  const TEXT = {
    held: (a, d) => `Slot held for 10 min with ${d.name} on ${fmt(a.start)}. Complete payment to confirm.`,
    confirmed: (a, d) => `Booking ${a.bookingNo} confirmed with ${d.name} on ${fmt(a.start)}.`,
    reminder24: (a, d) => `Reminder: ${d.name} tomorrow at ${fmtTime(a.start)}.`,
    reminder2: (a, d) => `Reminder: ${d.name} in 2 hours (${fmtTime(a.start)}).`,
    cancelled: (a) => `Booking ${a.bookingNo} cancelled.${a.refund && a.refund.amount ? ` Refund ₹${a.refund.amount} initiated.` : ''}`,
    rescheduled: (a, d) => `Booking ${a.bookingNo} moved to ${fmt(a.start)} with ${d.name}.`,
  };
  function notify(db, a, kind, now) {
    const d = byId(db.doctors, a.doctorId);
    db.notifications.unshift({ t: now, apptId: a.id, kind, to: a.patient.name, channels: ['SMS', 'WhatsApp', 'Email'], text: TEXT[kind](a, d) });
    db.notifications.length = Math.min(db.notifications.length, 200);
  }
  /** Queue 24h and 2h reminders that are due (the real system runs this as a scheduled job). */
  function sendDueReminders(db, now = Date.now()) {
    let n = 0;
    db.appointments.filter((a) => a.status === 'confirmed' && a.start > now).forEach((a) => {
      a.reminders = a.reminders || {};
      [['reminder24', 24], ['reminder2', 2]].forEach(([k, h]) => {
        if (!a.reminders[k] && a.start - now <= h * HOUR) { a.reminders[k] = now; notify(db, a, k, now); n++; }
      });
    });
    return n;
  }

  /* ------------------------------------------------------------ RBAC + scope */
  const can = (actor, perm) => !!actor && ROLES[actor.role].perms.includes(perm);
  function storeIds(db, actor) {
    const s = actor.scope;
    if (s.type === 'global') return db.stores.map((x) => x.id);
    if (s.type === 'franchise') return db.stores.filter((x) => x.franchiseId === s.id).map((x) => x.id);
    if (s.type === 'store') return [s.id];
    return [];
  }
  function clinicIds(db, actor) {
    const s = actor.scope;
    if (s.type === 'clinic') return [s.id];
    if (s.type === 'doctor') return [...new Set(db.schedules.filter((x) => x.doctorId === s.id).map((x) => x.clinicId))];
    const stores = storeIds(db, actor);
    return db.clinics.filter((c) => s.type === 'global' || stores.includes(c.storeId)).map((c) => c.id);
  }
  function apptVisible(db, actor, a) {
    if (!can(actor, 'appointments.read')) return false;
    if (actor.scope.type === 'doctor') return a.doctorId === actor.scope.id;
    return clinicIds(db, actor).includes(a.clinicId);
  }
  /** Clinical notes: only the treating doctor (patients see their own on the public page). */
  const canReadNotes = (actor, a) => can(actor, 'clinical_notes.read') && actor.scope.type === 'doctor' && actor.scope.id === a.doctorId;

  /** Is `scope` inside the actor's own scope? */
  function scopeWithin(db, actor, scope) {
    const s = actor.scope;
    if (s.type === 'global') return true;
    const stores = storeIds(db, actor);
    if (scope.type === 'store') return stores.includes(scope.id);
    if (scope.type === 'clinic') { const c = byId(db.clinics, scope.id); return !!c && stores.includes(c.storeId); }
    if (scope.type === 'franchise') return s.type === 'franchise' && s.id === scope.id;
    if (scope.type === 'doctor') return s.type === 'global';
    return false;
  }
  /** A user can never grant permissions they do not hold, or a scope wider than their own. */
  function canGrant(db, actor, roleKey, scope) {
    if (!can(actor, 'staff.manage')) return false;
    const r = ROLES[roleKey];
    if (!r || r.scope !== scope.type) return false;
    return r.perms.every((p) => can(actor, p)) && scopeWithin(db, actor, scope);
  }
  function scopeLabel(db, scope) {
    if (scope.type === 'global') return 'All of TrueShop';
    const list = { franchise: db.franchises, store: db.stores, clinic: db.clinics, doctor: db.doctors }[scope.type];
    const x = list && byId(list, scope.id);
    return x ? x.name : scope.id;
  }

  /* ------------------------------------------------------------ inventory */
  /** Deduct stock first-expiry-first-out. Throws if not enough. */
  function deductStock(db, storeId, pid, qty) {
    const lots = db.inventory.filter((i) => i.storeId === storeId && i.pid === pid && i.qty > 0).sort((a, b) => a.expiry.localeCompare(b.expiry));
    if (lots.reduce((s, l) => s + l.qty, 0) < qty) throw new Error('Not enough stock');
    let left = qty;
    lots.forEach((l) => { const take = Math.min(l.qty, left); l.qty -= take; left -= take; });
  }
  const stockOf = (db, storeId, pid) => db.inventory.filter((i) => i.storeId === storeId && i.pid === pid).reduce((s, i) => s + i.qty, 0);

  /** Doctors may not earn BV/commission on product sales: refuse their member code at the POS. */
  const isDoctorMemberCode = (db, code) => !!code && db.doctors.some((d) => d.memberCode && d.memberCode.toLowerCase() === code.toLowerCase());

  /* ------------------------------------------------------------ geo */
  function distanceKm(a, b) {
    const R = 6371, r = (x) => (x * Math.PI) / 180;
    const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* ------------------------------------------------------------ persistence */
  const hasLS = (() => { try { return typeof localStorage !== 'undefined'; } catch (e) { return false; } })();
  function load() {
    if (hasLS) { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.v === 1) return d; } catch (e) {} }
    return seed();
  }
  let db = load();
  function save() { if (hasLS) try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  // housekeeping the real system would run as scheduled jobs
  if (releaseExpired(db) + sendDueReminders(db)) save();

  /* acting staff user in the admin panel ("view as") */
  const ACTOR_KEY = 'trueshop-admin-actor';
  function actor() {
    let id = 'U1'; try { id = sessionStorage.getItem(ACTOR_KEY) || 'U1'; } catch (e) {}
    return byId(db.staff, id) || byId(db.staff, 'U1');
  }
  function setActor(id) { try { id ? sessionStorage.setItem(ACTOR_KEY, id) : sessionStorage.removeItem(ACTOR_KEY); } catch (e) {} }

  root.ClinicDB = {
    get db() { return db; }, save, reset() { db = seed(); save(); }, seed,
    POLICY, ROLES, PERMS, HOLD_MINUTES, CONSULTATION_BV, WD,
    istDate, istToUtc, addDays, weekday, fmt, fmtTime, fmtDay, byId, isActive, onLeave,
    availableSlots, book, pay, cancel, reschedule, checkIn, markNoShow, complete, releaseExpired, refundPct, sendDueReminders,
    can, storeIds, clinicIds, apptVisible, canReadNotes, canGrant, scopeWithin, scopeLabel,
    deductStock, stockOf, isDoctorMemberCode, distanceKm, actor, setActor,
  };
})(typeof window !== 'undefined' ? window : globalThis);
