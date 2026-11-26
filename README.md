# TrueShop: Working Demo

**Shop Karo | Share Karo | Earn Karo.** A clickable demo of the TrueShop e-commerce and hybrid direct-selling platform by **Regenus India Private Limited** (est. 2018, Maharashtra).

**Live demo:** https://regenusindia18-design.github.io/Truedemo/

The demo is built from three source documents in this repo:

| Source | Implemented in |
|---|---|
| `TrueShop_Master_Business_Plan FFF.pdf` | BV ratios, six income streams, ranks, packages, TrueSteps → `assets/js/plan.js`, `plan.html` |
| `TrueShop_Legal_And_Developer_BRD FFF.pdf` | Triple wallet, 70% cap engine, escrow, buyback, KYC → `dashboard.html`, `shop.html`, `compliance.html` |
| `TrueShop_Financial_Payout_Simulator FFF.xlsx` | Company payout model, same inputs and formulas → `simulator.html` |

## Pages

| Page | What you can do |
|---|---|
| **Home** (`index.html`) | Hero, animated plan highlights, live weekly binary estimator, rank journey, TrueSteps ring |
| **Business Plan** (`plan.html`) | Full plan: category BV, brochure vs effective payout per stream, binary/generation/leadership explainers, ranks, wallet maths |
| **Stores & Doctors** (`clinics.html`) | Find a franchise store (sorted by distance with “near me”), browse verified doctors by city, speciality and date, book a slot (self or family member, DPDP consent, 10-minute payment hold), pay, cancel with refund, reschedule, and view your prescription |
| **Shop** (`shop.html`) | Browse 14 products, add to cart, redeem TruePoints (≤10% of bill), see BV on net paid and 5% cashback, place orders into 7-day escrow, return orders to reverse BV |
| **My Dashboard** (`dashboard.html`) | Wallets, run a weekly binary closing (caps, carry-forward, 90/10 split), rank-up celebration, genealogy tree, generation income, TrueSteps sync/claim, KYC-gated withdrawal |
| **Simulator** (`simulator.html`) | Company model mirroring the XLSX, with a 70% cap gauge and a 12-month projection; personal monthly earnings calculator |
| **Admin Panel** (`admin.html`) | Back-office for the company (see below) |
| **Compliance** (`compliance.html`) | Direct Selling Rules 2021 safeguards, payout lifecycle, wallet rules, earnings disclosure |

### Admin panel

Open `admin.html` (linked in the site footer). The demo credentials are pre-filled (`admin` / `trueshop@2026`). This sign-in is client-side only, so a production build needs real server-side authentication.

| Module | What it does |
|---|---|
| Dashboard | KPIs, 30-day joinings chart, package mix, KYC status, commissions by stream, top earners, recent joinings and activity |
| Members / Add Member | Search, filter, sort, paginate and export CSV; profile modal with block/unblock; register under a sponsor with extreme-leg spillover placement preview |
| Genealogy Tree | 4-level binary tree browser with drill-down, up-one-level and search |
| KYC Approvals | PAN / Aadhaar / bank queue with approve and reject-with-reason |
| Orders & Escrow | Release from the 7-day escrow or return (BV reversal) |
| Products & BV | Edit MRP/DP within each category's discount band; storefront updates immediately |
| Weekly Payout Run | Per-member 1:1 binary with carry-forward and package caps, direct referral, a **pro-rata ceiling** that holds binary inside its 20% share of cycle BV, then release to wallets (90/10) |
| Withdrawals | Approve (KYC-verified only) or reject, with 5% TDS + 5% admin shown |
| Income Reports | Per-member earnings by stream, filter and CSV export |
| Ranks & CTO Pools | Rank achievers, monthly pool calculator (amount ÷ shares) and distribution |
| Plan Settings | Edit BV ratios, caps, rates and generation levels; blocked from saving above the 70% cap; applies site-wide |
| Support Tickets / Audit Log | Reply to and resolve tickets; every admin action is logged |
| Stores & Inventory | Franchise details, stores, per-batch stock with expiry, stock adjustments, warehouse → store transfers (requested → dispatched → received) |
| POS Counter | In-store billing with FEFO stock deduction and a printable invoice. A member code sends the order into the same 7-day BV escrow as online orders (try `TS10248`); walk-in sales earn no BV |
| Appointments | Day list, check-in, no-show, clinic cancellation (full refund), doctor completes with notes and prescription, notification queue |
| Clinics & Doctors | Clinics, doctor schedules and leaves, medical-council registration verification (unverified doctors cannot be booked) |
| Store & Clinic Reports | POS sales per store; bookings, completions, no-shows, cancellations and net fees per doctor and clinic |
| Staff & Roles | Staff list, role matrix, add staff (you can only grant what you hold, inside your scope) and **View as** to see the panel as any role |

### Roles in the admin panel

Open **Staff & Roles** and press **View as** to switch. The menu and every list are filtered by the role's permissions and scope.

| Role | Scope | Can | Cannot |
|---|---|---|---|
| Super Admin | everything | all modules | read clinical notes, except by audited break-glass with a reason |
| Admin (Operations) | everything | all modules | payouts, withdrawals, clinical notes |
| Franchise Owner | own franchise | its stores, inventory, POS, clinic bookings, reports, staff | MLM back office, other franchises |
| Store Manager | one store | inventory, transfers, POS, reports, staff list | other stores, appointments |
| Cashier | one store | POS | everything else |
| Clinic Receptionist | one clinic | appointments: view, check in, cancel | clinical notes |
| Doctor | self | own day list, complete and write notes, own leaves | other doctors' patients, any BV or commission |

Consultations always generate **0 BV and 0 commission**, and a doctor's member code is refused at the POS. The refund policy is demo-only (≥24 h before the slot 100%, 2–24 h 50%, under 2 h 0%; rescheduling closes 2 h before) and can be changed in `POLICY` in `assets/js/clinic-data.js`. Franchise margin and the consultation fee split are not configured yet. See `suggestions.md` for the production plan.

All demo data is stored in your browser's `localStorage`. Use **Reset demo data** in the footer to start again.

## Run locally

It's a static site with no build step:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy on GitHub Pages

A workflow in `.github/workflows/pages.yml` deploys on every push to `main`.
One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The site is then served at `https://<user>.github.io/Truedemo/`.

## Project structure

```
index.html  plan.html  shop.html  clinics.html  dashboard.html  simulator.html  compliance.html  admin.html
assets/
  css/style.css        design system (brand green + gold, light/dark)
  js/plan.js           compensation-plan engine: pure functions, single source of truth
  js/app.js            shared header/footer, demo state, toasts, modals, animations
  js/products.js       demo catalogue
  js/dashboard.js      member dashboard logic
  js/simulator.js      simulators
  js/admin.js          admin panel (hash-routed modules)
  js/admin-data.js     seeded 180-member demo network for the admin
  js/clinic-data.js    stores, clinics, doctors, slots, bookings, refunds, roles and scopes (pure logic + seed)
  js/admin-clinics.js  admin modules for stores, POS, clinics, appointments, reports and staff
  css/admin.css        admin layout
tests/plan.test.js     engine checks against the figures in the plan documents
tests/clinic.test.js   slots, double booking, holds, refunds, zero BV on consultations, role scope isolation
```

## Tests

```bash
node tests/plan.test.js
node tests/clinic.test.js
```

## Disclaimer

This is a prototype for demonstration. All members, orders and payouts are simulated. Income from direct selling depends on genuine product sales and is not guaranteed.
