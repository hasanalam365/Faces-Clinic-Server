// config/courses.js
//
// Single source of truth for what gets charged. The frontend never sends a
// price — it only sends a `courseId`, and the backend looks the amount up
// here. All amounts are in PENCE (GBP).
//
// ─── The three payment options ─────────────────────────────────────────────
//  1. Full         → fullPrice, one Stripe payment
//  2. Deposit      → 20% of fullPrice via Stripe (rest due before the course)
//  3. Subscription → FIRST PAYMENT via Stripe, then the rest as monthly
//                    GoCardless Direct Debit (fixed number of instalments)
//
// ─── How the subscription is worked out ────────────────────────────────────
//  first payment target  = £250   (SUBSCRIPTION_DEFAULTS.firstPayment)
//  monthly target        = £100   (SUBSCRIPTION_DEFAULTS.monthlyTarget)
//
//    balance      = fullPrice − first payment target
//    installments = ceil(balance / monthly target)
//    monthly      = floor(balance / installments)
//    first payment = fullPrice − monthly × installments
//
//  Course prices rarely divide by exactly £100, so the first payment absorbs
//  the leftover pence (e.g. £250.03). This way the student always pays EXACTLY
//  the advertised course price — never a penny over or under.
//  Example: £850 → £250 now + 6 × £100.
//
//  To give one course different numbers, add e.g.
//    subscription: { firstPayment: 30000, monthlyTarget: 15000 }
//  to its entry below.

const DEPOSIT_PERCENT = 20;

const SUBSCRIPTION_DEFAULTS = {
  firstPayment: 25000, // £250
  monthlyTarget: 10000, // £100
};

// `id` values must match the ids in AcademyCourseDetails.jsx.
// ⚠️ Check every fullPrice below against the price shown on the website.
const CATALOGUE = {
  "foundation-14-certificate": {
    name: "14 Certificate Foundation Course",
    fullPrice: 159900, // £1,599 (AcademyCourseDetails.jsx) — was £1,099 in the old file, CONFIRM
  },
  "foundation-anti-wrinkle": {
    name: "Foundation Anti-Wrinkle Course",
    fullPrice: 85000, // £850
  },
  "foundation-dermal-filler": {
    name: "Foundation Dermal Filler Course",
    fullPrice: 85000, // £850
  },
  "liquid-bbl-2days": {
    name: "Liquid BBL – 2 Days Course",
    fullPrice: 259900, // £2,599
  },
  "liquid-bbl-training-2days": {
    name: "Liquid BBL Training – 2 Days Course",
    fullPrice: 259900, // £2,599 — was missing from the old file
  },
  "advanced-filler-anti-wrinkle": {
    name: "Advanced Dermal Filler & Anti-Wrinkle",
    fullPrice: 120000, // £1,200 — site shows £1,200–£1,499; Stripe needs one number, CONFIRM
  },
  "liquid-rhinoplasty-tear-trough": {
    name: "Liquid Rhinoplasty & Tear Trough",
    fullPrice: 110000, // £1,100
  },
  "pdo-threads": {
    name: "PDO Threads Course",
    fullPrice: 140000, // £1,400
  },
  "iv-drip-vitamin-injections": {
    name: "IV Drip and Vitamin Injections Training Course",
    fullPrice: 99900, // £999
  },
  "phlebotomy-prp-hair": {
    name: "Phlebotomy, PRP, and PRP Hair Training Course",
    fullPrice: 110000, // £1,100
  },
};

function buildCourse(id, def) {
  const { fullPrice } = def;

  // 2. Deposit
  const depositAmount = Math.round((fullPrice * DEPOSIT_PERCENT) / 100);
  const remainingAfterDeposit = fullPrice - depositAmount;

  // 3. Subscription
  const cfg = { ...SUBSCRIPTION_DEFAULTS, ...(def.subscription || {}) };
  const balance = fullPrice - cfg.firstPayment;
  if (balance <= 0) {
    throw new Error(`courses.js: "${id}" first payment must be lower than the course price.`);
  }
  const installments = Math.ceil(balance / cfg.monthlyTarget);
  const monthlyAmount = Math.floor(balance / installments);
  const firstPayment = fullPrice - monthlyAmount * installments;

  return {
    name: def.name,
    fullPrice,
    depositAmount,
    remainingAfterDeposit,
    subscription: {
      firstPayment,
      monthlyAmount,
      installments,
      totalPayable: firstPayment + monthlyAmount * installments, // === fullPrice
    },
    subscriptionAmount: monthlyAmount, // kept for older code that reads this name
    currency: "GBP",
  };
}

// Null-prototype object so ids like "constructor" or "__proto__" can never
// match a course.
const courses = Object.create(null);
for (const [id, def] of Object.entries(CATALOGUE)) {
  courses[id] = buildCourse(id, def);
}

module.exports = courses;