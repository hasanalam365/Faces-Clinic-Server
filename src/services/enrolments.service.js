// services/enrolments.service.js
//
// The "model" for academy enrolments. Google Sheets IS the database here, so
// this file is the ONLY place that knows about column order. Everything else
// works with plain objects.
//
// Adding a field?  Append it to FIELDS (never insert in the middle, or every
// existing row shifts) and it flows through automatically.

const {
  appendRow,
  getRows,
  updateRowWhere,
  ensureSheet,
  colLetter,
  SHEET_NAME3,
} = require("../config/googlesheets");
const { generateEnrolmentId } = require("../utils/generateId");

/** Column order. Index in this array === column index in the sheet. */
const FIELDS = [
  "enrolmentId", // A  🔑 match key for every update
  "createdAt",
  "updatedAt",
  "status", // pending | awaiting_payment | active | completed | cancelled | failed
  "courseId",
  "courseName",
  "plan", // full | deposit | subscription
  "currency",
  "fullPrice",
  "amountPaid", // running total actually collected
  "remainingBalance",
  "customerName",
  "customerEmail",
  "customerPhone",
  // --- Stripe (one-off: full payment / deposit / subscription down-payment)
  "stripeSessionId",
  "stripePaymentIntentId",
  "paymentStatus", // unpaid | paid | not_required | refunded
  // --- Identity verification (Stripe Identity)
  "identitySessionId",
  "identityStatus", // not_started | requires_input | processing | verified | canceled
  "identityVerifiedAt",
  // --- Agreement (SignWell)
  "signwellDocumentId",
  "agreementStatus", // not_sent | sent | viewed | signed | declined
  "agreementSignedAt",
  "agreementPdfUrl",
  // --- Direct Debit (GoCardless)
  "gcBillingRequestId",
  "gcCustomerId",
  "gcMandateId",
  "gcSubscriptionId",
  "subscriptionStatus", // not_required | pending_mandate | active | cancelled | finished
  "monthlyAmount",
  "installmentsTotal",
  "installmentsPaid",
  "nextChargeDate",
  "notes",
];

const HEADERS = [
  "Enrolment ID",
  "Created At",
  "Updated At",
  "Status",
  "Course ID",
  "Course Name",
  "Plan",
  "Currency",
  "Full Price",
  "Amount Paid",
  "Remaining Balance",
  "Customer Name",
  "Customer Email",
  "Customer Phone",
  "Stripe Session ID",
  "Stripe Payment Intent",
  "Payment Status",
  "Identity Session ID",
  "Identity Status",
  "Identity Verified At",
  "SignWell Document ID",
  "Agreement Status",
  "Agreement Signed At",
  "Agreement PDF",
  "GC Billing Request ID",
  "GC Customer ID",
  "GC Mandate ID",
  "GC Subscription ID",
  "Subscription Status",
  "Monthly Amount",
  "Installments Total",
  "Installments Paid",
  "Next Charge Date",
  "Notes",
];

const LAST_COL = colLetter(FIELDS.length - 1);
const KEY_INDEX = FIELDS.indexOf("enrolmentId");
const INDEX_OF = Object.fromEntries(FIELDS.map((f, i) => [f, i]));

const rowToObject = (row = []) =>
  Object.fromEntries(FIELDS.map((f, i) => [f, row[i] ?? ""]));

const objectToRow = (obj = {}) => FIELDS.map((f) => obj[f] ?? "");

/** Call once at boot — creates the tab + header row if they don't exist. */
async function init() {
  try {
    await ensureSheet(SHEET_NAME3, HEADERS);
    console.log(`✅ Enrolments sheet ready ("${SHEET_NAME3}")`);
  } catch (err) {
    console.error("❌ Could not prepare Enrolments sheet:", err.message);
  }
}

/**
 * Creates a new enrolment row.
 * @returns {Promise<object>} the stored enrolment
 */
async function create(data) {
  const now = new Date().toISOString();
  const enrolment = {
    ...data,
    enrolmentId: data.enrolmentId || generateEnrolmentId(),
    createdAt: now,
    updatedAt: now,
  };
  await appendRow(objectToRow(enrolment), SHEET_NAME3);
  return enrolment;
}

/** Finds one enrolment by its ID. */
async function findById(enrolmentId) {
  const rows = await getRows(SHEET_NAME3, LAST_COL);
  const needle = String(enrolmentId);
  const row = rows.find((r) => String(r[KEY_INDEX] ?? "") === needle);
  return row ? rowToObject(row) : null;
}

/**
 * Finds one enrolment by any other column, e.g.
 *   findBy("gcMandateId", "MD0001")
 *   findBy("stripeSessionId", "cs_test_...")
 */
async function findBy(field, value) {
  const idx = INDEX_OF[field];
  if (idx === undefined) throw new Error(`Unknown enrolment field: ${field}`);
  const rows = await getRows(SHEET_NAME3, LAST_COL);
  const needle = String(value);
  const row = rows.find((r) => String(r[idx] ?? "") === needle);
  return row ? rowToObject(row) : null;
}

/**
 * Patches an existing row: read-modify-write, serialised against every other
 * writer so two webhooks landing together can't clobber each other.
 * @returns {Promise<object|null>} updated enrolment, or null if not found
 */
async function patch(enrolmentId, changes) {
  const written = await updateRowWhere(
    SHEET_NAME3,
    KEY_INDEX,
    enrolmentId,
    (current) => {
      const merged = {
        ...rowToObject(current),
        ...changes,
        updatedAt: new Date().toISOString(),
      };
      return objectToRow(merged);
    },
    LAST_COL
  );
  return written ? rowToObject(written) : null;
}

/** Same as patch(), but keyed on any column (used by webhooks). */
async function patchBy(field, value, changes) {
  const idx = INDEX_OF[field];
  if (idx === undefined) throw new Error(`Unknown enrolment field: ${field}`);
  const written = await updateRowWhere(
    SHEET_NAME3,
    idx,
    value,
    (current) => {
      const merged = {
        ...rowToObject(current),
        ...changes,
        updatedAt: new Date().toISOString(),
      };
      return objectToRow(merged);
    },
    LAST_COL
  );
  return written ? rowToObject(written) : null;
}

/**
 * Strips internal/provider IDs before sending to the browser. The frontend
 * only needs to know how far along the enrolment is.
 */
function toPublic(e) {
  if (!e) return null;
  return {
    enrolmentId: e.enrolmentId,
    status: e.status,
    courseId: e.courseId,
    courseName: e.courseName,
    plan: e.plan,
    fullPrice: Number(e.fullPrice || 0),
    amountPaid: Number(e.amountPaid || 0),
    remainingBalance: Number(e.remainingBalance || 0),
    customerName: e.customerName,
    customerEmail: e.customerEmail,
    paymentStatus: e.paymentStatus || "unpaid",
    identityStatus: e.identityStatus || "not_started",
    agreementStatus: e.agreementStatus || "not_sent",
    subscriptionStatus: e.subscriptionStatus || "not_required",
    monthlyAmount: e.monthlyAmount ? Number(e.monthlyAmount) : null,
    installmentsTotal: e.installmentsTotal ? Number(e.installmentsTotal) : null,
    installmentsPaid: e.installmentsPaid ? Number(e.installmentsPaid) : 0,
    nextChargeDate: e.nextChargeDate || null,
  };
}

module.exports = {
  FIELDS,
  HEADERS,
  SHEET: SHEET_NAME3,
  init,
  create,
  findById,
  findBy,
  patch,
  patchBy,
  toPublic,
  rowToObject,
  objectToRow,
};