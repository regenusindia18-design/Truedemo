# TrueShop: Working Demo

**Shop Karo | Share Karo | Earn Karo.** A clickable demo of the TrueShop e-commerce and hybrid direct-selling platform by **Regenus India Private Limited** (est. 2018, Maharashtra).

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
| **Shop** (`shop.html`) | Browse 14 products, add to cart, redeem TruePoints (≤10% of bill), see BV on net paid and 5% cashback, place orders into 7-day escrow, return orders to reverse BV |
| **My Dashboard** (`dashboard.html`) | Wallets, run a weekly binary closing (caps, carry-forward, 90/10 split), rank-up celebration, genealogy tree, generation income, TrueSteps sync/claim, KYC-gated withdrawal |
| **Simulator** (`simulator.html`) | Company model mirroring the XLSX, with a 70% cap gauge and a 12-month projection; personal monthly earnings calculator |
| **Compliance** (`compliance.html`) | Direct Selling Rules 2021 safeguards, payout lifecycle, wallet rules, earnings disclosure |

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
index.html  plan.html  shop.html  dashboard.html  simulator.html  compliance.html
assets/
  css/style.css        design system (brand green + gold, light/dark)
  js/plan.js           compensation-plan engine: pure functions, single source of truth
  js/app.js            shared header/footer, demo state, toasts, modals, animations
  js/products.js       demo catalogue
  js/dashboard.js      member dashboard logic
  js/simulator.js      simulators
tests/plan.test.js     engine checks against the figures in the plan documents
```

## Tests

```bash
node tests/plan.test.js
```

## Disclaimer

This is a prototype for demonstration. All members, orders and payouts are simulated. Income from direct selling depends on genuine product sales and is not guaranteed.
