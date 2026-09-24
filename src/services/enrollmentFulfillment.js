// services/enrollmentFulfillment.js
//
// Called from the shared Stripe webhook (controllers/payments.controller.js)
// once a Checkout Session for an "enrollment", "deposit_enrollment" or
// "subscription_first_payment" flow actually completes.
//
// For full / deposit: this is the single place that marks the Sheets row
// "Paid" and sends the confirmation emails — NOT the verify-session endpoints,
// which only READ status. That keeps emails from firing twice if the customer
// reloads the success page.
//
// For the monthly plan: markFirstPaymentPaid() below checks the Stripe
// session against the enrolment's stored SETUP FEE (not a "first
// instalment" — the monthly fee afterwards is a separate, ongoing charge).

const { findRowByField, updateRowByField } = require("./sheetsDb");
const { sendEnrollmentConfirmationEmails } = require("./emailService");

const SUBSCRIPTION_TAB = "SubscriptionEnrollments";

async function fulfillEnrollment(session, tabName) {
  const enrollmentId = session.metadata?.enrollmentId;
  if (!enrollmentId) {
    console.error(`${tabName} webhook: missing enrollmentId in session metadata`, session.id);
    return;
  }

  const found = await findRowByField(tabName, "enrollmentId", enrollmentId);
  if (!found) {
    console.error(`${tabName} webhook: no row found for enrollmentId`, enrollmentId);
    return;
  }

  // Idempotency guard — Stripe can redeliver the same webhook event.
  if (found.data.paymentStatus === "Paid") {
    return;
  }

  await updateRowByField(tabName, "enrollmentId", enrollmentId, {
    paymentStatus: "Paid",
    stripeSessionId: session.id,
    updatedAt: new Date().toISOString(),
  });

  await sendEnrollmentConfirmationEmails({
    type: tabName === "DepositEnrollments" ? "deposit" : "full",
    name: found.data.name,
    email: found.data.email,
    phone: found.data.phone,
    courseName: found.data.courseName,
    amount: found.data.amount,
    remainingBalance: found.data.remainingBalance,
  });
}

/**
 * Marks the monthly plan's SetupFee (Stripe, one-off) as received.
 *
 * Idempotent and email-free, so it is safe to call from BOTH the Stripe
 * webhook and the status endpoint (which reconciles with Stripe if the
 * webhook is slow). The confirmation emails go out later, when the Direct
 * Debit subscription is created.
 *
 * Returns the updated row data, or null if it could not be applied.
 */
async function markFirstPaymentPaid(session) {
  const enrollmentId = session.metadata?.enrollmentId;
  if (!enrollmentId) {
    console.error("Setup fee: missing enrollmentId in session metadata", session.id);
    return null;
  }
  if (session.payment_status !== "paid") return null;

  const found = await findRowByField(SUBSCRIPTION_TAB, "enrollmentId", enrollmentId);
  if (!found) {
    console.error("Setup fee: no row found for enrollmentId", enrollmentId);
    return null;
  }

  const row = found.data;
  if (row.firstPaymentStatus === "Paid") return row;

  // Never trust a "paid" session for the wrong amount.
  const expectedPence = Math.round(parseFloat(row.setupFee) * 100);
  if (session.amount_total !== expectedPence) {
    console.error(
      `Setup fee amount mismatch for ${enrollmentId}: Stripe took ${session.amount_total}p, expected ${expectedPence}p (session ${session.id}). NOT marked paid — check manually.`
    );
    return null;
  }

  const changes = {
    firstPaymentStatus: "Paid",
    firstPaymentSessionId: session.id,
    status: "Setup Fee Received",
    updatedAt: new Date().toISOString(),
  };
  await updateRowByField(SUBSCRIPTION_TAB, "enrollmentId", enrollmentId, changes);
  return { ...row, ...changes };
}

async function fulfillSubscriptionFirstPayment(session) {
  await markFirstPaymentPaid(session);
}

module.exports = { fulfillEnrollment, fulfillSubscriptionFirstPayment, markFirstPaymentPaid };