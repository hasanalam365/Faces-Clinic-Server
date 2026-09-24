// controllers/subscriptionPayment.controller.js
//
// Subscription flow, step 4 (SetupFee via Stripe) + the status endpoint
// every step page uses to know where the student is.
//
//   POST /subscription-enrollment/first-payment/create-checkout-session
//   GET  /subscription-enrollment/status/:enrollmentId
//
// NOTE: "firstPaymentStatus" / "firstPaymentSessionId" as sheet column names
// are kept as-is (they track the SetupFee Stripe payment) — only the AMOUNT
// fields changed name (setupFee / monthlyFee), and the old "installments"
// concept is gone entirely: the monthly fee is ongoing with no fixed count.
const stripe = require("../config/stripe");
const { findRowByField, updateRowByField } = require("../services/sheetsDb");
const { markFirstPaymentPaid } = require("../services/enrollmentFulfillment");
const { isTrue } = require("../utils/sheetValues");

const TAB = "SubscriptionEnrollments";
const CLIENT_URL = () => process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";

/** Which step the student must do next. */
function nextStepFor(d) {
  if (!isTrue(d.agreementSigned)) return "agreement";
  if (!isTrue(d.identityVerified)) return "identity";
  if (d.firstPaymentStatus !== "Paid") return "payment";
  if (!d.subscriptionId) return "directdebit";
  return "done";
}

exports.createFirstPaymentCheckout = async (req, res) => {
  try {
    const enrollmentId = String(req.body?.enrollmentId || "").trim();
    if (!enrollmentId) return res.status(400).json({ message: "Missing enrollment ID." });

    const found = await findRowByField(TAB, "enrollmentId", enrollmentId);
    if (!found) return res.status(404).json({ message: "Enrollment not found." });

    const d = found.data;
    if (!isTrue(d.agreementSigned)) {
      return res.status(403).json({ message: "Please sign the agreement first." });
    }
    if (!isTrue(d.identityVerified)) {
      return res.status(403).json({ message: "Please complete identity verification first." });
    }
    if (d.firstPaymentStatus === "Paid") {
      return res.status(409).json({ message: "The setup fee has already been paid." });
    }

    // Amount comes from the row snapshotted at Step 1 — never from the client.
    const amountPence = Math.round(parseFloat(d.setupFee) * 100);
    if (!Number.isFinite(amountPence) || amountPence <= 0) {
      console.error("Invalid setupFee on row", enrollmentId, d.setupFee);
      return res.status(500).json({ message: "Could not start payment. Please contact us." });
    }

    const monthly = Number(d.monthlyFee);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Card, Klarna and Clearpay all offered at checkout. Klarna/Clearpay
      // need a billing address for their eligibility checks — this has no
      // effect on the card flow.
      payment_method_types: ["card", "klarna", "afterpay_clearpay"],
      billing_address_collection: "required",
      customer_email: d.email,
      client_reference_id: enrollmentId,
      line_items: [
        {
          price_data: {
            currency: (d.currency || "GBP").toLowerCase(),
            product_data: {
              name: `${d.courseName} — Setup Fee`,
              description: `One-off setup fee to secure your place. After this, £${monthly.toFixed(
                2
              )} is charged monthly via Direct Debit for as long as you stay enrolled — cancel any time.`,
            },
            unit_amount: amountPence,
          },
          quantity: 1,
        },
      ],
      metadata: {
        flowType: "subscription_first_payment",
        enrollmentId,
        courseId: d.courseId,
        courseName: d.courseName,
      },
      success_url: `${CLIENT_URL()}/subscription-first-payment?enrollmentId=${enrollmentId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL()}/subscription-first-payment?enrollmentId=${enrollmentId}&cancelled=1`,
    });

    await updateRowByField(TAB, "enrollmentId", enrollmentId, {
      firstPaymentSessionId: session.id,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Create setup fee checkout error:", err);
    return res.status(500).json({ message: "Could not start payment. Please try again." });
  }
};

exports.getSubscriptionStatus = async (req, res) => {
  try {
    const found = await findRowByField(TAB, "enrollmentId", req.params.enrollmentId);
    if (!found) return res.status(404).json({ message: "Enrollment not found." });

    let d = found.data;

    // If the student has been sent to Stripe but our webhook hasn't landed
    // yet, ask Stripe directly. markFirstPaymentPaid() is idempotent, so a
    // webhook arriving at the same moment is harmless.
    if (d.firstPaymentStatus !== "Paid" && d.firstPaymentSessionId && isTrue(d.identityVerified)) {
      try {
        const session = await stripe.checkout.sessions.retrieve(d.firstPaymentSessionId);
        if (session.payment_status === "paid") {
          const updated = await markFirstPaymentPaid(session);
          if (updated) d = updated;
        }
      } catch (e) {
        console.error("Status: could not reconcile Stripe session:", e.message);
      }
    }

    // Only non-sensitive fields go to the browser.
    return res.status(200).json({
      enrollmentId: d.enrollmentId,
      courseName: d.courseName,
      currency: d.currency || "GBP",
      setupFee: d.setupFee,
      monthlyFee: d.monthlyFee,
      agreementSigned: isTrue(d.agreementSigned),
      identityVerified: isTrue(d.identityVerified),
      setupFeePaid: d.firstPaymentStatus === "Paid",
      directDebitActive: Boolean(d.subscriptionId),
      nextStep: nextStepFor(d),
    });
  } catch (err) {
    console.error("Get subscription status error:", err);
    return res.status(500).json({ message: "Could not load your enrollment." });
  }
};