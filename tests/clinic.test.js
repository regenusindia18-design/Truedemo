// Stores, clinics & appointment rules.
// Run: node tests/clinic.test.js
const assert = require('assert');
require('../assets/js/clinic-data.js');
const C = globalThis.ClinicDB;
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };

// Fixed clock: Monday 2026-11-23 08:00 IST
const NOW = C.istToUtc('2026-11-23', '08:00');
// seed data with only past history, so every test starts with free upcoming slots
const fresh = () => { const db = C.seed(NOW); db.appointments = db.appointments.filter((a) => a.start < NOW); return db; };
const staff = (db, id) => db.staff.find((s) => s.id === id);
const self = { name: 'Aarav Deshmukh', age: 34, gender: 'M', relation: 'Self' };

t('IST conversion: 10:00 IST is 04:30 UTC, and weekday is taken in IST', () => {
  assert.strictEqual(new Date(C.istToUtc('2026-11-23', '10:00')).toISOString(), '2026-11-23T04:30:00.000Z');
  assert.strictEqual(C.weekday('2026-11-23'), 1);
  assert.strictEqual(C.istDate(C.istToUtc('2026-11-24', '00:10')), '2026-11-24'); // 18:40 UTC the previous day
});

t('slots come from the schedule (Mon 10:00–13:00, 15 min → 12 slots)', () => {
  const s = C.availableSlots(fresh(), 'D1', 'C1', '2026-11-23', NOW);
  assert.strictEqual(s.length, 12);
  assert.strictEqual(C.fmtTime(s[0].start), '10:00');
  assert.strictEqual(C.fmtTime(s[11].start), '12:45');
});

t('no slots on a non-working day, on leave, or in the past', () => {
  const db = fresh();
  assert.strictEqual(C.availableSlots(db, 'D1', 'C1', '2026-11-29', NOW).length, 0); // Sunday
  assert.strictEqual(C.availableSlots(db, 'D1', 'C1', '2026-11-26', NOW).length, 0); // seeded leave (today + 3)
  const at11 = C.istToUtc('2026-11-23', '11:00');
  assert.ok(C.availableSlots(db, 'D1', 'C1', '2026-11-23', at11).every((s) => s.start > at11));
});

t('a booked slot disappears; double booking the same slot is rejected', () => {
  const db = fresh();
  const start = C.istToUtc('2026-11-23', '10:00');
  C.book(db, { doctorId: 'D1', clinicId: 'C1', start, patient: self, bookedBy: 'TS10248', consent: true }, NOW);
  assert.ok(!C.availableSlots(db, 'D1', 'C1', '2026-11-23', NOW).some((s) => s.start === start));
  assert.throws(() => C.book(db, { doctorId: 'D1', clinicId: 'C1', start, patient: self, bookedBy: 'X', consent: true }, NOW), /just taken/);
});

t('the same doctor cannot be booked at two clinics at once', () => {
  const db = fresh();
  db.schedules.push({ id: 'SCX', doctorId: 'D1', clinicId: 'C2', days: [1], start: '10:00', end: '11:00', slotMin: 15, maxPerSlot: 1 });
  const start = C.istToUtc('2026-11-23', '10:00');
  C.book(db, { doctorId: 'D1', clinicId: 'C1', start, patient: self, bookedBy: 'A', consent: true }, NOW);
  assert.throws(() => C.book(db, { doctorId: 'D1', clinicId: 'C2', start, patient: self, bookedBy: 'B', consent: true }, NOW));
});

t('max patients per slot is respected (D1 at Wakad takes 2 per slot)', () => {
  const db = fresh();
  const start = C.istToUtc('2026-11-23', '17:00');
  const req = { doctorId: 'D1', clinicId: 'C2', start, patient: self, consent: true };
  C.book(db, { ...req, bookedBy: 'A' }, NOW);
  C.book(db, { ...req, bookedBy: 'B' }, NOW);
  assert.throws(() => C.book(db, { ...req, bookedBy: 'C' }, NOW), /just taken/);
});

t('unpaid hold is released after 10 minutes', () => {
  const db = fresh();
  const start = C.istToUtc('2026-11-23', '10:15');
  const a = C.book(db, { doctorId: 'D1', clinicId: 'C1', start, patient: self, bookedBy: 'A', consent: true }, NOW);
  const later = NOW + 11 * 60000;
  assert.throws(() => C.pay(db, a.id, 'UPI', later), /expired/);
  assert.strictEqual(a.status, 'expired');
  assert.ok(C.availableSlots(db, 'D1', 'C1', '2026-11-23', later).some((s) => s.start === start));
});

t('booking needs consent and a verified doctor', () => {
  const db = fresh();
  const start = C.istToUtc('2026-11-23', '10:30');
  assert.throws(() => C.book(db, { doctorId: 'D1', clinicId: 'C1', start, patient: self, consent: false }, NOW), /consent/);
  assert.throws(() => C.book(db, { doctorId: 'D3', clinicId: 'C2', start: C.istToUtc('2026-11-24', '11:00'), patient: self, consent: true }, NOW), /not available/);
});

t('ZERO BV and ZERO commission on consultation fees', () => {
  const db = fresh();
  const a = C.book(db, { doctorId: 'D1', clinicId: 'C1', start: C.istToUtc('2026-11-23', '11:00'), patient: self, bookedBy: 'TS10248', consent: true }, NOW);
  C.pay(db, a.id, 'UPI', NOW + 60000);
  assert.strictEqual(a.fee, 400);
  assert.strictEqual(a.bv, 0);
  assert.strictEqual(a.commission, 0);
  assert.strictEqual(C.CONSULTATION_BV, 0);
});

t('a doctor\'s member code is refused at the POS (no BV on product sales)', () => {
  const db = fresh();
  db.doctors[0].memberCode = 'TS99999';
  assert.ok(C.isDoctorMemberCode(db, 'ts99999'));
  assert.ok(!C.isDoctorMemberCode(db, 'TS10248'));
});

t('refund policy: ≥24h 100%, 2–24h 50%, <2h 0%, clinic cancel 100%', () => {
  const db = fresh();
  const mk = (time, date = '2026-11-24') => {
    const a = C.book(db, { doctorId: 'D1', clinicId: 'C1', start: C.istToUtc(date, time), patient: self, bookedBy: 'A', consent: true }, NOW);
    C.pay(db, a.id, 'UPI', NOW); return a;
  };
  assert.strictEqual(C.cancel(db, mk('10:00', '2026-11-25').id, 'patient', '', NOW).refund.amount, 400);
  assert.strictEqual(C.cancel(db, mk('10:00').id, 'patient', '', C.istToUtc('2026-11-24', '07:00')).refund.amount, 200);
  assert.strictEqual(C.cancel(db, mk('10:15').id, 'patient', '', C.istToUtc('2026-11-24', '09:00')).refund.amount, 0);
  assert.strictEqual(C.cancel(db, mk('10:30').id, 'clinic', 'Doctor unwell', C.istToUtc('2026-11-24', '10:00')).refund.amount, 400);
});

t('reschedule moves the slot and frees the old one; blocked inside 2h', () => {
  const db = fresh();
  const a = C.book(db, { doctorId: 'D1', clinicId: 'C1', start: C.istToUtc('2026-11-24', '10:00'), patient: self, bookedBy: 'A', consent: true }, NOW);
  C.pay(db, a.id, 'UPI', NOW);
  C.reschedule(db, a.id, C.istToUtc('2026-11-24', '12:00'), NOW);
  assert.strictEqual(C.fmtTime(a.start), '12:00');
  assert.ok(C.availableSlots(db, 'D1', 'C1', '2026-11-24', NOW).some((s) => C.fmtTime(s.start) === '10:00'));
  assert.throws(() => C.reschedule(db, a.id, C.istToUtc('2026-11-24', '12:30'), C.istToUtc('2026-11-24', '11:00')), /2 hours/);
});

t('only the treating doctor can complete and write notes', () => {
  const db = fresh();
  const a = C.book(db, { doctorId: 'D1', clinicId: 'C1', start: C.istToUtc('2026-11-23', '12:00'), patient: self, bookedBy: 'A', consent: true }, NOW);
  C.pay(db, a.id, 'UPI', NOW);
  assert.throws(() => C.complete(db, a.id, staff(db, 'U9'), { advice: 'x' }, [], NOW), /treating doctor/);
  assert.throws(() => C.complete(db, a.id, staff(db, 'U1'), { advice: 'x' }, [], NOW), /treating doctor/);
  C.complete(db, a.id, staff(db, 'U8'), { advice: 'Rest' }, [], NOW);
  assert.strictEqual(a.status, 'completed');
  assert.ok(C.canReadNotes(staff(db, 'U8'), a));
  assert.ok(!C.canReadNotes(staff(db, 'U7'), a), 'receptionist');
  assert.ok(!C.canReadNotes(staff(db, 'U1'), a), 'super admin needs audited break-glass');
  assert.ok(!C.canReadNotes(staff(db, 'U2'), a), 'admin ops');
});

t('scope isolation: store manager A cannot see store B', () => {
  const db = fresh();
  const ravi = staff(db, 'U4'), kavya = staff(db, 'U5');
  assert.deepStrictEqual(C.storeIds(db, ravi), ['S1']);
  assert.deepStrictEqual(C.storeIds(db, kavya), ['S2']);
  assert.deepStrictEqual(C.storeIds(db, staff(db, 'U3')), ['S1', 'S2']);
  assert.ok(!C.can(ravi, 'appointments.read'));
});

t('scope isolation: receptionist sees only her clinic, doctor only his own patients', () => {
  const db = fresh();
  const pooja = staff(db, 'U7'), rohan = staff(db, 'U9');
  db.appointments.forEach((a) => {
    assert.strictEqual(C.apptVisible(db, pooja, a), a.clinicId === 'C1');
    assert.strictEqual(C.apptVisible(db, rohan, a), a.doctorId === 'D2');
  });
});

t('cashier has POS only', () => {
  const cashier = staff(fresh(), 'U6');
  assert.ok(C.can(cashier, 'pos.sell'));
  ['inventory.adjust', 'reports.view', 'staff.manage', 'appointments.read'].forEach((p) => assert.ok(!C.can(cashier, p), p));
});

t('admin_ops has no finance approval and no clinical notes', () => {
  const ops = staff(fresh(), 'U2');
  ['finance.approve', 'clinical_notes.read', 'clinical_notes.privileged'].forEach((p) => assert.ok(!C.can(ops, p), p));
});

t('nobody can grant more than they hold, or outside their scope', () => {
  const db = fresh();
  const owner = staff(db, 'U3'), ravi = staff(db, 'U4'), admin = staff(db, 'U1');
  assert.ok(C.canGrant(db, owner, 'cashier', { type: 'store', id: 'S2' }));
  assert.ok(C.canGrant(db, owner, 'clinic_receptionist', { type: 'clinic', id: 'C1' }));
  assert.ok(!C.canGrant(db, owner, 'admin_ops', { type: 'global' }), 'owner → admin_ops');
  assert.ok(!C.canGrant(db, owner, 'doctor', { type: 'doctor', id: 'D1' }), 'owner lacks clinical perms');
  assert.ok(!C.canGrant(db, ravi, 'cashier', { type: 'store', id: 'S1' }), 'store manager has no staff.manage');
  assert.ok(C.canGrant(db, admin, 'store_manager', { type: 'store', id: 'S2' }));
  assert.ok(!C.canGrant(db, admin, 'doctor', { type: 'doctor', id: 'D1' }), 'super admin lacks clinical_notes.write');
});

t('POS stock is taken first-expiry-first-out', () => {
  const db = fresh();
  db.inventory.push({ id: 'IX', storeId: 'S1', pid: 'h1', batch: 'OLD', expiry: '2027-01-01', qty: 5 });
  C.deductStock(db, 'S1', 'h1', 7);
  assert.strictEqual(db.inventory.find((i) => i.batch === 'OLD').qty, 0);
  assert.strictEqual(db.inventory.find((i) => i.batch === 'AW2609').qty, 38);
  assert.throws(() => C.deductStock(db, 'S1', 'h1', 999), /Not enough/);
});

t('24h and 2h reminders are queued once each', () => {
  const db = fresh();
  const a = C.book(db, { doctorId: 'D1', clinicId: 'C1', start: C.istToUtc('2026-11-24', '10:00'), patient: self, bookedBy: 'A', consent: true }, NOW);
  C.pay(db, a.id, 'UPI', NOW);
  assert.strictEqual(C.sendDueReminders(db, C.istToUtc('2026-11-23', '12:00')), 1);
  assert.strictEqual(C.sendDueReminders(db, C.istToUtc('2026-11-23', '13:00')), 0);
  assert.strictEqual(C.sendDueReminders(db, C.istToUtc('2026-11-24', '08:30')), 1);
});

console.log(`\n${n} clinic checks passed`);
