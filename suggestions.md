# Suggestions: Franchise Stores, Clinics & Appointment Booking API

Status: **proposal only, nothing built yet.** This file records the plan and the open questions so the work can be picked up later. It is written against the `trueshop` PostgreSQL 16 schema (sections 0–13), which is not yet committed to this repo. Suggested location when it is: `db/trueshop_schema.sql`.

Ground rule: never alter or drop existing tables destructively. Add everything new as numbered migrations.

---

## 1. Stack

The repo is a static demo site with no backend, so the API would be a new `api/` folder:

- Node.js 20+ and TypeScript, built on NestJS.
- Prisma: `prisma db pull` against the existing schema, saved as a `0000_baseline` migration that is marked applied and never re-run. New tables come in numbered SQL migrations from `0001` onward.
- Swagger at `/api/docs`. All routes are versioned under `/api/v1`.
- Jest and Supertest for tests. BullMQ and Redis for jobs and notifications.
- `docker-compose.yml` (Postgres 16 + Redis) and a `.env.example`. No secrets are committed.
- The Pages workflow only copies `*.html` and `assets/`, so `api/` would never be published to the demo site.

```
api/
  prisma/{schema.prisma, migrations/0000_baseline … 0009_*, seed.ts}
  src/
    common/        error filter, pagination/sort, idempotency, rate limit, IST↔UTC, crypto
    auth/  rbac/  audit/
    franchises/  stores/  inventory/  stock-transfers/  pos/
    clinics/  doctors/  schedules/  availability/
    appointments/  appointment-payments/  medical-records/
    notifications/ reports/
  test/            unit + e2e
```

---

## 2. How the new module fits the existing schema

| Need | Existing schema | Suggestion |
|---|---|---|
| Member / customer identity | `users` (role enum: customer, distributor) | Keep as is. Staff such as store managers, cashiers, receptionists and doctors are also `users` rows. Their authority comes from RBAC assignments, so the `user_role` enum is left untouched. |
| HQ admins | `admin_users` (free-text `role`, `mfa_enabled` but no TOTP secret column) | Keep the table. Add `admin_users.user_id` (nullable FK) so one RBAC model covers HQ and field staff. Store TOTP secrets encrypted in a new `staff_credentials` table. |
| Member code at the POS counter | `distributors.member_code` | Look up by member code and set `orders.distributor_id` as usual. |
| POS sales | `orders`, `order_items` | Add `orders.channel` (`online` / `offline_store`, default `online`) and `orders.store_id` FK. POS orders leave `shipping_address_id` NULL. Set `delivered_at` to the sale time, so `bv_release_at` = sale + 7 days. |
| BV, escrow, commissions | `bv_ledger`, `commission_entries`, `orders.bv_status/bv_release_at` | POS orders go through the same code path. There is no separate commission path. |
| Online payments | `payments` | `payments.order_id` is NOT NULL, so appointment payments cannot use this table. Add `appointment_payments` with the same shape, reusing the `payment_method` and `payment_status` enums. |
| Config values | `plan_settings` (key/value, effective-dated) | Put scalar settings here: `appointment_hold_minutes`, `appointment_cancel_cutoff_hours`, `appointment_reschedule_cutoff_hours`. Values that need several rows get their own tables (refund tiers, franchise rules). |
| Consent (DPDP) | `legal_documents`, `legal_acceptances` | Publish a `clinical_data_consent` document. Record acceptance in `legal_acceptances`, and link a per-appointment row in `appointment_consents`. |
| Audit | `audit_log` (`actor_admin_id` / `actor_user_id`, before/after jsonb) | Log every admin/staff write and every clinical-note read here. |
| Notifications | `notifications` | Use it as the send log. BullMQ handles delivery. |
| Warehouse stock | `product_stock` (one row per product, single batch/expiry) | The source for warehouse → store transfers. See the limitation in §7. |

---

## 3. Proposed new tables

**Auth and RBAC**
- `otp_challenges`
- `staff_credentials`: password hash, encrypted TOTP secret
- `refresh_tokens`: hashed, with `family_id` so token reuse can be detected
- `roles`, `permissions`, `role_permissions`
- `user_role_assignments`: `scope_type` (global, franchise, store or clinic) and `scope_id`
- `idempotency_keys`

**Franchise and stores**
- `franchises`, `stores` (opening hours as jsonb, lat/lng), `store_staff`
- `store_inventory`: one row per (store, product, batch), with expiry
- `store_inventory_movements`: append-only ledger of stock changes
- `stock_transfers` and `stock_transfer_items`: status goes requested → dispatched → received
- `franchise_commission_rules`: seeded with 0 and a TODO

**Clinics and doctors**
- `clinics` (`store_id` nullable), `doctors`, `doctor_clinics`
- `doctor_clinic_schedules`: weekday, start/end, slot duration, max patients per slot, fee override, valid_from/to
- `doctor_leaves`

**Appointments**
- `appointments`, `appointment_status_history`, `appointment_payments`
- `appointment_refunds`
- `refund_policy_tiers`: hours before slot → refund %. Seeded with a TODO, see §6.
- `appointment_consents`

**Medical records**
- `consultation_notes`, `prescriptions`: encrypted
- `clinical_access_grants`: clinic staff explicitly permitted to see notes
- `clinical_access_log`: every read

---

## 4. Key design decisions

1. **No double booking.**
   - Use `btree_gist` with `EXCLUDE (doctor_id WITH =, slot_seq WITH =, tstzrange(slot_start, slot_end) WITH &&) WHERE status IN ('pending_payment','confirmed','checked_in')`.
   - `slot_seq` (1…max_patients_per_slot) exists because a plain (doctor, range) exclusion would break schedules that allow more than one patient per slot.
   - Booking runs in a transaction that takes `SELECT … FOR UPDATE` on the schedule row. A concurrency test fires parallel bookings at one slot.
2. **10-minute payment hold.** A booking starts as `pending_payment` with `hold_expires_at`. A BullMQ delayed job releases it, and a repeating sweep job catches any it missed. Suggest adding an `expired` status: no listed status fits, and `cancelled_by_*` would distort the cancellation reports.
3. **Zero BV on consultations and no doctor income** (medical ethics rule):
   - Appointment payments never create `orders`, `bv_ledger` or `commission_entries` rows. The appointments module has no dependency on the BV or commission code, and an architecture test checks this.
   - Add a DB trigger on `bv_ledger`, `commission_entries` and `customer_referrals`. It rejects any row whose beneficiary distributor's `user_id` is linked to a `doctors` row. This holds even if application code is wrong.
   - Prescriptions carry no product referral codes or attribution.
4. **Clinical data encryption.**
   - The existing schema uses `pgp_sym_encrypt` (`kyc_documents.doc_number_enc`, `bank_accounts.account_number_enc`).
   - For clinical notes, encrypt in the app with AES-256-GCM and a versioned key from env or KMS. With pgcrypto the key travels inside the SQL, so it can end up in Postgres logs.
   - If you prefer consistency with KYC, use pgcrypto with the key passed as a bind parameter and statement logging disabled for those queries.
5. **Admin access to clinical notes.** Admins see appointment metadata only. A separate `clinical_notes.read_privileged` permission requires a reason. Every such read is written to `audit_log` and `clinical_access_log`.
6. **Limited authority.**
   - A user can grant a role only if they hold every permission in it, and only at a scope inside one of their own scopes. Creating a custom role follows the same rule.
   - Every query is filtered by scope with a guard plus a repository filter. Out-of-scope reads by ID return 404, and out-of-scope writes return 403.
   - The scope hierarchy: franchise ⊃ its stores ⊃ the clinics attached to those stores.
7. **Time.** Everything is stored as `timestamptz` in UTC. Schedules are defined in wall-clock time in Asia/Kolkata and expanded per date. Slots that cross midnight or span several days are covered by tests.

### Seed roles

| Role | Scope | Can | Cannot |
|---|---|---|---|
| super_admin | global | everything | |
| admin_ops | global | everything else | finance/payout approval, clinical notes |
| franchise_owner | franchise | own stores, staff, inventory, sales, clinic bookings | other franchises |
| store_manager | store | inventory, POS, staff view | other stores |
| cashier | store | POS | inventory adjust, reports |
| clinic_receptionist | clinic | view/book/check-in/cancel appointments | clinical notes |
| doctor | own | own schedule, appointments, own patients' notes | BV, commission, referral income |
| member / customer | own | own data | |

---

## 5. Endpoint outline (`/api/v1`)

**Auth and RBAC**
- `auth/otp/request`, `auth/otp/verify`
- `auth/staff/login`, `auth/staff/mfa/setup`, `auth/staff/mfa/verify`
- `auth/refresh`, `auth/logout`
- `admin/roles` (CRUD), `admin/permissions`, `admin/users/:id/assignments`

**Franchise, stores and POS**
- `admin/franchises` (CRUD), `admin/stores` (CRUD)
- Public: `stores`, `stores/nearby?lat&lng&radiusKm`, `stores/:id`
- `stores/:id/staff`, `stores/:id/inventory`, `stores/:id/inventory/adjust`
- `stock-transfers` with `/:id/dispatch` and `/:id/receive`
- `stores/:id/pos/orders`, `pos/orders/:id/invoice`
- `stores/:id/reports/sales`

**Clinics and doctors**
- Public: `clinics`, `doctors?city&storeId&specialization&date`, `doctors/:id`, `doctors/:id/availability?clinicId&from&to`
- Admin: CRUD at `admin/clinics` and `admin/doctors`, plus `admin/doctors/:id/verify`, `doctors/:id/schedules`, `doctors/:id/leaves`

**Appointments**
- `appointments` (book; idempotency key; rate limited), `/:id/pay`, `/:id/cancel`, `/:id/reschedule`
- `me/appointments`, `doctors/me/day?date`
- `appointments/:id/check-in`, `appointments/:id/complete`
- `appointments/:id/notes`, `appointments/:id/prescriptions`
- `clinics/:id/calendar`
- Payment gateway webhook

**Reports:** `admin/reports/bookings`, `admin/reports/no-shows`, `admin/reports/revenue?groupBy=clinic|doctor`

**Notifications:** booking, 24h reminder, 2h reminder and cancellation, sent over SMS, WhatsApp and email through a provider interface. Providers are stubbed for now.

---

## 6. Open business questions (do not guess these)

1. **Refund %** at each cancellation window, and the **cancellation and reschedule cut-off hours**. Until these are set, the API should refuse refunds rather than assume 0% or 100%.
2. **Consultation fee split** between clinic, doctor and franchise. This needs a config table with a TODO.
3. **Can a doctor hold a distributor account** for personal purchases?
   - Option A (strictest): no.
   - Option B: yes, but the trigger blocks all BV, commission and referral income.
4. **Franchise margin:** it is assumed to be a franchise-side payout outside the member BV flow and the 70% BV cap. Rates are still to be set.
5. Is it OK to add the **`expired`** appointment status (see §4, point 2)?
6. **Staff identity:** should franchise and clinic staff log in as `users` (mobile-based) with RBAC, keeping `admin_users` only for HQ?

---

## 7. Observations on the existing schema

These are separate from the new module. All of them are non-destructive changes that can be done later.

- **Hard-coded 10% cap.** `orders.ck_points_cap` hard-codes `0.10`, while `plan_settings.points_max_cart_ratio` is meant to be configurable. Changing the setting would not change the constraint. Enforce the cap in the service from `plan_settings`, or document that both must change together.
- **Duplicate BV credits.** `bv_ledger` has nothing to stop a retried job crediting the same order twice. Suggest a partial unique index, e.g. on `(order_id, distributor_id)` where `reversal_of_id IS NULL`.
- **Duplicate commission rows.** `commission_entries` has the same retry risk. Suggest a unique key such as `(cycle_id, distributor_id, income, source_order_id, source_distributor_id, level)`, or an idempotency key like the one `wallet_transactions` already has.
- **Single batch per product.** `product_stock` has one batch and expiry per product. Health supplements need FEFO across several batches. Add a `warehouse_batches` table later, and keep `product_stock` as the total.
- **`admin_users` vs `users`.** The two are unrelated, and `admin_users.role` is free text. Moving to the RBAC tables and linking `admin_users.user_id` fixes both. MFA also needs somewhere to keep the TOTP secret.
- **`audit_log`:**
  - It is not append-only. Revoke UPDATE and DELETE from the app's DB role.
  - It is only indexed on `(entity, entity_id)`. Add indexes on `(actor_user_id, created_at)` and `(actor_admin_id, created_at)` for investigations.
- **Missing FKs:**
  - `kyc_documents.verified_by` and `return_requests.processed_by` are plain `uuid` with no foreign key.
  - The same goes for `payout_cycles.approved_by`.
- **Closure tables on insert only.** `fn_distributor_paths` runs on insert only, so a sponsor or placement correction would leave `sponsor_tree_paths` and `binary_tree_paths` stale. Add an admin "re-parent" procedure that rebuilds a subtree.
- **`notifications.user_id` is NOT NULL.** That works for appointments, because the booker is always a user, but not for walk-in POS customers without accounts.

---

## 8. Build phases

1. Auth and RBAC, including the scope isolation tests (store A manager → 403/404 on store B).
2. Franchise, stores, inventory, transfers and POS, through the existing BV ledger and escrow.
3. Clinics, doctors, schedules and the availability engine.
4. Appointments, payments, refunds and notifications, including the double-booking concurrency test and the zero-BV test.
5. Reports, seed data (1 franchise, 2 stores, 2 clinics, 3 doctors, one user per role), README and the role matrix.

After each phase: run the migrations and tests, then commit. Nothing gets pushed without asking.
