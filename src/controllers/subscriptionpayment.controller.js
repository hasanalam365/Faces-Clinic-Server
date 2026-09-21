// controllers/subscriptionPayment.controller.js
//
// Subscription flow, step 4 (First Payment via Stripe) + the status endpoint
// every step page uses to know where the student is.
//
//   POST /subscription-enrollment/first-payment/create-checkout-session
//   GET  /subscription-enrollment/status/:enrollmentId
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
      return res.status(409).json({ message: "The first payment has already been made." });
    }

    // Amount comes from the row snapshotted at Step 1 — never from the client.
    const amountPence = Math.round(parseFloat(d.firstPaymentAmount) * 100);
    if (!Number.isFinite(amountPence) || amountPence <= 0) {
      console.error("Invalid firstPaymentAmount on row", enrollmentId, d.firstPaymentAmount);
      return res.status(500).json({ message: "Could not start payment. Please contact us." });
    }

    const monthly = Number(d.subscriptionAmount);
    const installments = Number(d.installments);
    const remaining = (monthly * installments).toFixed(2);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: d.email,
      client_reference_id: enrollmentId,
      line_items: [
        {
          price_data: {
            currency: (d.currency || "GBP").toLowerCase(),
            product_data: {
              name: `${d.courseName} — First Payment`,
              description: `Up-front payment to secure your place. The remaining £${remaining} is collected as ${installments} monthly Direct Debit payments of £${monthly.toFixed(
                2
              )}.`,
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
    console.error("Create first payment checkout error:", err);
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
      firstPaymentAmount: d.firstPaymentAmount,
      monthlyAmount: d.subscriptionAmount,
      installments: Number(d.installments) || 0,
      agreementSigned: isTrue(d.agreementSigned),
      identityVerified: isTrue(d.identityVerified),
      firstPaymentPaid: d.firstPaymentStatus === "Paid",
      directDebitActive: Boolean(d.subscriptionId),
      nextStep: nextStepFor(d),
    });
  } catch (err) {
    console.error("Get subscription status error:", err);
    return res.status(500).json({ message: "Could not load your enrollment." });
  }
};