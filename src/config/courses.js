// config/courses.js
//
// Single source of truth for what gets charged. The frontend never sends a
// price — it only sends a `courseId`, and the backend looks the amount up
// here. All amounts are in PENCE (GBP).
//
// ─── The three payment options ─────────────────────────────────────────────
//  1. Full          → fullPrice, one Stripe payment
//  2. Deposit       → 20% of fullPrice via Stripe (rest due before the course)
//  3. Monthly plan  → SetupFee via Stripe (once), THEN a MonthlyFee via
//                     GoCardless Direct Debit that repeats indefinitely,
//                     for as long as the student stays enrolled — this does
//                     NOT add up to fullPrice, it's a separate ongoing access
//                     fee, and it never auto-stops (no fixed instalment
//                     count). The student/admin cancels it when they choose.
//
// ─── SignWell templates ─────────────────────────────────────────────────────
//  Every course has its OWN SignWell agreement template (`signwellTemplateId`).
//  If a course's env var isn't set yet, it falls back to SIGNWELL_TEMPLATE_ID.

const DEPOSIT_PERCENT = 20;

// `id` values must match the ids in Courses.jsx AND AcademyCourseDetails.jsx.
// setupFee / monthlyFee are in PENCE.
const CATALOGUE = {
  "foundation-14-certificate": {
    name: "14 Certificate Foundation Course",
    fullPrice: 159900, // £1,599
    setupFee: 25000, // £250
    monthlyFee: 10000, // £100/month
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_FOUNDATION_14 || process.env.SIGNWELL_TEMPLATE_ID,
  },
  "foundation-anti-wrinkle": {
    name: "Foundation Anti-Wrinkle Course",
    fullPrice: 85000, // £850
    setupFee: 15000, // £250
    monthlyFee: 5000, // £50/month
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_ANTI_WRINKLE || process.env.SIGNWELL_TEMPLATE_ID,
  },
  "foundation-dermal-filler": {
    name: "Foundation Dermal Filler Course",
    fullPrice: 85000, // £850
    setupFee: 25000, // £250
    monthlyFee: 5000, // £50/month
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_DERMAL_FILLER || process.env.SIGNWELL_TEMPLATE_ID,
  },
  "liquid-bbl-2days-with-ultrasound": {
    name: "Liquid BBL – 2 Days Course (With Ultrasound)",
    fullPrice: 240000, 
    setupFee: 25000, // £250
    monthlyFee: 10000, // £100/month
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_LIQUID_BBL_WITH_ULTRASOUND || process.env.SIGNWELL_TEMPLATE_ID,
  },
  "liquid-bbl-2days-without-ultrasound": {
    name: "Liquid BBL – 2 Days Course (Without Ultrasound)",
    fullPrice: 160000, // £2,599
    setupFee: 25000, // £250
    monthlyFee: 10000, // £100/month
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_LIQUID_BBL_WITHOUT_ULTRASOUND || process.env.SIGNWELL_TEMPLATE_ID,
  },
  "advanced-filler-anti-wrinkle": {
    name: "Advanced Dermal Filler & Anti-Wrinkle",
    fullPrice: 159900, // £1,200 — site shows £1,200–£1,499; Stripe needs one number, CONFIRM
    setupFee: 25000, // £250
    monthlyFee: 10000, // £100/month
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_ADVANCED_FILLER || process.env.SIGNWELL_TEMPLATE_ID,
  },
  "liquid-rhinoplasty-tear-trough": {
    name: "Liquid Rhinoplasty & Tear Trough",
    fullPrice: 110000, // £1,100
    setupFee: 15000, // £150
    monthlyFee: 5000, // £50/month
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_RHINOPLASTY || process.env.SIGNWELL_TEMPLATE_ID,
  },
  "pdo-threads": {
    name: "PDO Threads Course",
    fullPrice: 140000, // £1,400
    setupFee: 25000, // £250
    monthlyFee: 10000, // £100/month
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_PDO_THREADS || process.env.SIGNWELL_TEMPLATE_ID,
  },
  "iv-drip-vitamin-injections": {
    name: "IV Drip and Vitamin Injections Training Course",
    fullPrice: 99900, // £999
    setupFee: 15000, // £150
    monthlyFee: 5000, // £50/month
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_IV_DRIP || process.env.SIGNWELL_TEMPLATE_ID,
  },
  "phlebotomy-prp-hair": {
    name: "Phlebotomy, PRP, and PRP Hair Training Course",
    fullPrice: 110000, // £1,100
    setupFee: 15000, // £150
    monthlyFee: 5000, // £50/month
    signwellTemplateId:
      process.env.SIGNWELL_TEMPLATE_PHLEBOTOMY || process.env.SIGNWELL_TEMPLATE_ID,
  },
};

function buildCourse(id, def) {
  const { fullPrice } = def;

  // 2. Deposit
  const depositAmount = Math.round((fullPrice * DEPOSIT_PERCENT) / 100);
  const remainingAfterDeposit = fullPrice - depositAmount;

  // 3. Monthly plan — flat setup fee + ongoing monthly fee. NOT derived from
  // fullPrice, and there is no fixed number of instalments.
  if (!def.setupFee || !def.monthlyFee) {
    throw new Error(`courses.js: "${id}" is missing setupFee/monthlyFee for the monthly plan.`);
  }

  return {
    name: def.name,
    fullPrice,
    depositAmount,
    remainingAfterDeposit,
    subscription: {
      setupFee: def.setupFee, 
      monthlyFee: def.monthlyFee, 
    },
    currency: "GBP",
    signwellTemplateId: def.signwellTemplateId || process.env.SIGNWELL_TEMPLATE_ID,
  };
}

// Null-prototype object so ids like "constructor" or "__proto__" can never
// match a course.
const courses = Object.create(null);
for (const [id, def] of Object.entries(CATALOGUE)) {
  courses[id] = buildCourse(id, def);
}

module.exports = courses;