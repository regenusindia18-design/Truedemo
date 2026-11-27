# TrueShop: Loophole Report

Tested on 27 Nov 2026 against the demo in this repo, by driving the real pages in headless Chromium (`tests/loophole-probe.js`) and with unit tests for the plan engine and order flow.

**Probe result:** 21 checks, 4 closed and 17 still open. Section 1 also lists three more fixes covered by unit tests (`tests/orders.test.js`, `tests/rewards.test.js`). Most open items exist because the demo runs entirely in the browser. They must be designed out when the real backend is built, not patched in the demo.

How to re-run the probe:

```bash
npm i --no-save playwright && npx playwright install chromium
python3 -m http.server 8765 &
node tests/loophole-probe.js        # prints OPEN / closed for every ID below
```

Severity: **Critical** = direct money loss or fake income. **High** = BV or commission can be inflated or misdirected. **Medium** = policy gap or abuse needs effort. **Low** = hygiene.

---

## 1. Closed in this change

| ID | Loophole | What was wrong | Fix |
|---|---|---|---|
| M9 | BV and cashback before escrow | A shop order added its BV to the member's binary leg and credited 5% cashback at checkout, so a member could spend the cashback and then return the order. The old return code floored the cashback at ₹0, so the spent part was never recovered. | BV and cashback are credited only when the order is **Confirmed**: 7 days after delivery, or an early release with a reason. A return inside the window means nothing was ever credited. |
| M9b | Self-purchase in own binary leg | Your own order BV was added to your own left leg, which is self-matching. | Own orders now build **Personal BV** (shown on the dashboard and in admin) and no longer feed your own legs. |
| M8 | Rewards clock reset by order-then-cancel | Under the new carry-forward rule, redeeming expiring points on an order and then cancelling would have counted as a "use" and extended everything for 60 days. | A cancelled or returned order gives rewards back to their **original lots** (original dates) and the redemption stops counting as a use. |
| M10 | Blocked member keeps earning | A blocked member could still order online and get BV credited. | Blocked members cannot place orders. Their orders in escrow are held, not confirmed, until they are unblocked. |
| E1 | Escrow released before delivery, or silently | Admin could release BV from escrow at any time with one click. The 7-day window counted from order time, not delivery. | The window starts at **delivery**. Release before delivery is refused. Release inside the window needs a written reason and is audit-logged. |
| V1 | Forged "view as member" | (New feature) | View-as only works inside a signed-in admin session, only for roles with `mlm.manage`, is read-only, and start/stop are audit-logged. A crafted session value without the admin session is ignored. |
| S1 | TrueSteps claim locked forever | `claimedToday` was never reset, so after one claim the member could never claim again. | Claim is tracked per calendar day. |

---

## 2. Open: Critical

### M3: Member withdrawal skips admin approval
- **Evidence:** "Withdraw to bank" on My Dashboard empties the payout wallet immediately. The admin Withdrawals queue never receives the request (16 → 16).
- **Fix:** A withdrawal must create a `pending` request that holds (debits) the amount from the wallet. Admin approves → payout file / IMPS. Reject → amount goes back to the wallet. Add a minimum interval (e.g. one per week) and a daily cap.

### A3: Withdrawal approval not checked against the wallet
- **Evidence:** WD5108 asks for ₹8,200 while the member's payout wallet is ₹0. It can still be approved, and approving deducts nothing.
- **Fix:** Debit at request time (see M3). On approval, re-check the request against the hold, and against KYC and block status.

### A2: CTO pools can be paid twice in a month
- **Evidence:** Pressing "Distribute this month's pools" twice made 2 distributions and paid ₹29,814 to rank holders.
- **Fix:** One distribution per calendar month, using a unique `(pool, month)` key in the database. Show the last run and disable the button. Add maker-checker approval (see A8).

### M2: Bank "penny drop" accepts blank details
- **Evidence:** Leaving account number and IFSC empty and pressing Verify marks the bank as verified.
- **Fix:** Validate IFSC (`^[A-Z]{4}0[A-Z0-9]{6}$`) and account length. Run a real penny-drop, match the account holder name to PAN (threshold, e.g. ≥ 85%), and send fails to manual review. Block a bank account already linked to another PAN.

### M5: Cart price and BV come from the browser
- **Evidence:** Editing the stored cart set Plant Protein (DP ₹1,899) to ₹1. The order went through at ₹1 with matching BV.
- **Fix:** The server must reprice every line from the catalogue at checkout and compute points, BV and cashback itself. It must never accept price, BV or cashback from the client.

### A1 / A10: Admin login and acting role are browser values
- **Evidence:** Setting `trueshop-admin-session=1` opens the admin panel. A cashier session becomes Super Admin by editing `trueshop-admin-actor`.
- **Fix:** Server-side sessions (httpOnly cookie), TOTP MFA for admins, and permissions checked on every API call. The UI only hides buttons. "View as" should issue a scoped, read-only impersonation token that expires and is logged on the server.

---

## 3. Open: High

### M1: Member can run their own binary closing
- **Evidence:** 5 clicks on "+2,500 BV left/right" and "Run weekly closing" took the payout wallet from ₹18,450 to ₹25,218 and moved weeks 47 → 52.
- **Fix:** This is a demo shortcut. In production the closing runs only from the admin payout run (scheduled, once per week), and team BV comes only from confirmed orders. Remove both buttons from the member app.

### A5: Add Member: duplicates and BV without an order
- **Evidence:** Two IDs were created with the same mobile, and both had 0 orders. The weekly payout run still counted their VIP package BV, paying binary and direct commission.
- **Fix:** Unique mobile, and unique PAN once KYC is done (one ID per PAN, or a documented family-ID rule). Activation BV must come from a **confirmed first order**, not from the package chosen on the form.

### A6: POS credits BV to any member code
- **Evidence:** The cashier types any active code. The walk-in customer's purchase BV then goes to that member, for example the cashier's own ID.
- **Fix:** OTP to the member's registered mobile (or scanning the member's app QR) before BV is attached. Flag cashiers whose sales go mostly to a few codes.

### A7: Plan settings outside the 70% check
- **Evidence:** A lifestyle BV ratio of 100% and a Starter weekly cap of ₹9,99,99,999 are both accepted.
- **Fix:** Bound each field: BV ratio ≤ the category's margin after GST and cost, and weekly caps within a set range. Settings changes need a second approver, take effect from the next cycle (never mid-cycle), and are versioned.

### M4: TrueSteps can be farmed
- **Evidence:** 40 taps on "Sync pedometer" gave 87,853 steps today, worth 170 points.
- **Fix:** Steps come only from Google Fit / Apple Health with a device attestation. Add a daily cap (e.g. 20,000 steps = 40 points) and use the server date, not the phone clock, for the daily claim.

### M7: ₹1 redemption keeps all rewards alive (side-effect of the new rule)
- **Evidence:** 500 points credited, then 1 point redeemed every 59 days: 494 points were still valid after 354 days.
- **Why:** This follows the requested rule ("if used even once, the rest carries forward"). It means rewards never lapse for anyone who makes a token redemption.
- **Suggestions (pick what the business wants):**
  1. Only a redemption on an order of at least ₹X (e.g. ₹500) counts as a "use".
  2. Add an absolute lifetime cap (e.g. no lot lives beyond 365 days, whatever the use).
  3. Carry forward only once per lot.

  The engine is in `assets/js/plan.js` (`lotExpiry`) and any of these is a few lines of change.

---

## 4. Open: Medium

| ID | Loophole | Suggestion |
|---|---|---|
| A4 | A blocked member's pending withdrawal can still be approved | Disable approval for blocked members and hold their wallets. |
| A8 | Early escrow release is a one-person decision | It now needs a reason and is logged. Add maker-checker: a second admin approves early releases, payouts, CTO runs and plan changes. |
| M6 | The cart keeps the price from when the item was added | Reprice on every cart view and at checkout. Show "price changed" to the member. |
| E2 | Escrow auto-confirm runs only when someone opens a page | Run `settle()` as a scheduled job (every 15 min), with idempotent confirmation keyed on order ID. |
| E3 | "Mark delivered" is a manual admin click | Take delivery from the courier webhook, with proof of delivery (OTP or photo). Manual delivery should need a reason. |
| E4 | Returns do not model refund, pickup or QC | Return = request → pickup → QC → refund to the original payment method. Restock POS returns into the same batch. Refund the rewards portion as rewards and the cash portion as cash. |
| C1 | CTO pool uses `monthBV`, which can include previous months for members with no order this month | Compute pool BV from confirmed orders in the calendar month, server-side. |
| A9 | The audit log is editable and resettable | Append-only audit table in the database, with no delete. Ship it to separate storage. |

## 5. Open: Low / data hygiene

- **Two copies of the member's network numbers.** TS10248's binary card and tree on My Dashboard are still demo figures; the admin computes its own from the 180-member network. Orders, BV, rewards, wallets and KYC are now shared. In production there is one database, so this goes away.
- **View-as privacy.** The admin sees the member's wallets and orders. Under DPDP, record the purpose with each view-as session and mask phone and PAN in that view.
- **Two tabs.** The demo reloads data when another tab changes it, but there is no locking. The backend needs row-level locks or optimistic versions on wallets, rewards and orders.
