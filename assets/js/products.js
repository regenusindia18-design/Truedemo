/* Demo product catalogue. Prices are illustrative. DP sits below MRP within
 * each category's maximum-discount band from the business plan. */
window.TS_PRODUCTS = [
  { id: 'h1', name: 'TrueVeda Ashwagandha Gold (60 caps)', category: 'health', mrp: 1499, dp: 899, emoji: '🌿', tag: 'Bestseller' },
  { id: 'h2', name: 'TrueVeda Daily Multivitamin (90 tabs)', category: 'health', mrp: 1299, dp: 799, emoji: '💊' },
  { id: 'h3', name: 'Plant Protein Shake — Chocolate 1kg', category: 'health', mrp: 2999, dp: 1899, emoji: '🥤', tag: 'High BV' },
  { id: 'h4', name: 'Omega-3 Flaxseed Softgels (60)', category: 'health', mrp: 999, dp: 620, emoji: '🐟' },
  { id: 'h5', name: 'Immunity Kadha Concentrate 500ml', category: 'health', mrp: 649, dp: 399, emoji: '🍵' },
  { id: 'p1', name: 'Neem & Tulsi Herbal Face Wash 150ml', category: 'personal', mrp: 299, dp: 229, emoji: '🧴' },
  { id: 'p2', name: 'Aloe Vera Skin Gel 200g', category: 'personal', mrp: 349, dp: 265, emoji: '🪴', tag: 'New' },
  { id: 'p3', name: 'Herbal Toothpaste Family Pack (3×150g)', category: 'personal', mrp: 420, dp: 320, emoji: '🪥' },
  { id: 'p4', name: 'Bhringraj Hair Oil 200ml', category: 'personal', mrp: 399, dp: 299, emoji: '💆' },
  { id: 'p5', name: 'Eco Dishwash Gel 1L', category: 'personal', mrp: 249, dp: 189, emoji: '🍽️' },
  { id: 'l1', name: 'TrueFit Dry-Fit Walking Tee', category: 'lifestyle', mrp: 899, dp: 720, emoji: '👕' },
  { id: 'l2', name: 'TrueFit Smart Step Band', category: 'lifestyle', mrp: 2499, dp: 1999, emoji: '⌚', tag: 'Syncs TrueSteps' },
  { id: 'l3', name: 'Yoga Mat 6mm Anti-slip', category: 'lifestyle', mrp: 1199, dp: 960, emoji: '🧘' },
  { id: 'l4', name: 'Stainless Steel Bottle 1L', category: 'lifestyle', mrp: 699, dp: 560, emoji: '🍶' },
];

// Admin price edits (Products & BV screen) override the catalogue defaults.
try {
  const ov = JSON.parse(localStorage.getItem('trueshop-product-overrides') || '{}');
  window.TS_PRODUCTS.forEach((p) => { if (ov[p.id]) Object.assign(p, ov[p.id]); });
} catch (e) { /* storage unavailable */ }
