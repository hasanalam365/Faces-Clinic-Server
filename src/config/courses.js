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
//
// ─── SignWell templates ─────────────────────────────────────────────────────
//  Every course has its OWN SignWell agreement template (`signwellTemplateId`).
//  Set each one via its own env var. If a course's env var isn't set yet, it
//  silently falls back to SIGNWELL_TEMPLATE_ID (the old shared default) so
//  nothing breaks while you're still creating templates for new courses.

const DEPOSIT_PERCENT = 20;

const SUBSCRIPTION_DEFAULTS = {
  firstPayment: 25000, // £250
  monthlyTarget: 10000, // £100
};

// `id` values must match the ids in Courses.jsx AND AcademyCourseDetails.jsx.
// ⚠️ Check every fullPrice below against the price shown on the website.
const CATALOGUE = {
  "foundation-14-certificate": {
    name: "14 Certificate Foundation Course",
    fullPrice: 159900, // £1,599
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_FOUNDATION_14 || process.env.SIGNWELL_TEMPLATE_ID,
  },
  "foundation-anti-wrinkle": {
    name: "Foundation Anti-Wrinkle Course",
    fullPrice: 85000, // £850
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_ANTI_WRINKLE || process.env.SIGNWELL_TEMPLATE_ID,
  },
  "foundation-dermal-filler": {
    name: "Foundation Dermal Filler Course",
    fullPrice: 85000, // £850
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_DERMAL_FILLER || process.env.SIGNWELL_TEMPLATE_ID,
  },
  // ── Liquid BBL split into two variants (was a single "liquid-bbl-2days") ──
  "liquid-bbl-2days-with-ultrasound": {
    name: "Liquid BBL – 2 Days Course (With Ultrasound)",
    fullPrice: 259900, // £2,599
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_LIQUID_BBL_WITH_ULTRASOUND || process.env.SIGNWELL_TEMPLATE_ID,
  },
  "liquid-bbl-2days-without-ultrasound": {
    name: "Liquid BBL – 2 Days Course (Without Ultrasound)",
    fullPrice: 259900, // £2,599
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_LIQUID_BBL_WITHOUT_ULTRASOUND || process.env.SIGNWELL_TEMPLATE_ID,
  },
  // NOTE: "liquid-bbl-training-2days" is intentionally NOT active — it was
  // commented out in the original Courses.jsx DEALS array. Uncomment below
  // (and the matching card in Courses.jsx) if you decide to launch it; that
  // would make 11 courses total instead of 10.
  // "liquid-bbl-training-2days": {
  //   name: "Liquid BBL Training – 2 Days Course",
  //   fullPrice: 259900, // £2,599
  //   signwellTemplateId:
  //     process.env.SIGNWELL_TEMPLATE_LIQUID_BBL_TRAINING || process.env.SIGNWELL_TEMPLATE_ID,
  // },
  "advanced-filler-anti-wrinkle": {
    name: "Advanced Dermal Filler & Anti-Wrinkle",
    fullPrice: 120000, // £1,200 — site shows £1,200–£1,499; Stripe needs one number, CONFIRM
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_ADVANCED_FILLER || process.env.SIGNWELL_TEMPLATE_ID,
  },
  "liquid-rhinoplasty-tear-trough": {
    name: "Liquid Rhinoplasty & Tear Trough",
    fullPrice: 110000, // £1,100
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_RHINOPLASTY || process.env.SIGNWELL_TEMPLATE_ID,
  },
  "pdo-threads": {
    name: "PDO Threads Course",
    fullPrice: 140000, // £1,400
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_PDO_THREADS || process.env.SIGNWELL_TEMPLATE_ID,
  },
  "iv-drip-vitamin-injections": {
    name: "IV Drip and Vitamin Injections Training Course",
    fullPrice: 99900, // £999
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_IV_DRIP || process.env.SIGNWELL_TEMPLATE_ID,
  },
  "phlebotomy-prp-hair": {
    name: "Phlebotomy, PRP, and PRP Hair Training Course",
    fullPrice: 110000, // £1,100
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_PHLEBOTOMY || process.env.SIGNWELL_TEMPLATE_ID,
  },
};
// That's 10 active courses total:
//  1. foundation-14-certificate
//  2. foundation-anti-wrinkle
//  3. foundation-dermal-filler
//  4. liquid-bbl-2days-with-ultrasound
//  5. liquid-bbl-2days-without-ultrasound
//  6. advanced-filler-anti-wrinkle
//  7. liquid-rhinoplasty-tear-trough
//  8. pdo-threads
//  9. iv-drip-vitamin-injections
// 10. phlebotomy-prp-hair

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
    signwellTemplateId: def.signwellTemplateId || process.env.SIGNWELL_TEMPLATE_ID, // per-course template
  };
}

// Null-prototype object so ids like "constructor" or "__proto__" can never
// match a course.
const courses = Object.create(null);
for (const [id, def] of Object.entries(CATALOGUE)) {
  courses[id] = buildCourse(id, def);
}

module.exports = courses;