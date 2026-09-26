// controllers/payments.controller.js
//
// Treatment-deposit flow (createDepositCheckoutSession, verifyCheckoutSession)
// logic is otherwise UNCHANGED — the edits here are:
//  1. Klarna + Clearpay added to payment_method_types alongside card (client
//     requirement: Klarna/Clearpay available on every Stripe checkout —
//     course, subscription and treatment).
//  2. Google Sheets logging for CLINICAL TREATMENT deposits only, via the
//     same generic sheetsDb layer Enrollments/DepositEnrollments already use
//     — a brand new "TreatmentBookingsPayment" tab, so nothing shared is touched:
//       - createDepositCheckoutSession inserts a "Pending" row the moment
//         the Stripe Checkout Session is created (mirrors how
//         Enrollments/DepositEnrollments rows appear as "Pending" first).
//       - handleStripeWebhook's treatment-deposit fallback branch updates
//         that same row to "Paid" once Stripe confirms payment.
//
// IMPORTANT — add a tab named exactly "TreatmentBookingsPayment" to your Google
// Sheet with this header row (row 1), in any column order you like — the
// generic sheetsDb layer maps by header NAME, not position:
//   bookingId | name | email | phone | treatmentId | treatmentName | amount
//   | remainingBalance | preferredDate | paymentStatus | stripeSessionId
//   | createdAt | updatedAt
//
// Other differences from your previous file, both in the webhook area:
//  1. It no longer imports ./academypayments.controller (the old, replaced
//     course system — that file pulled in services that crash on start-up).
//  2. handleStripeWebhook gets one new branch: flowType
//     "subscription_first_payment" (the £ first payment of the monthly plan).
//     The "enrollment" / "deposit_enrollment" branches behave exactly as
//     before — completely separate from the treatment-deposit branch below.
const stripe = require("../config/stripe");
const {
  fulfillEnrollment,
  fulfillSubscriptionFirstPayment,
} = require("../services/enrollmentFulfillment");
const { insertRow, updateRowByField } = require("../services/sheetsDb");
const { generateId } = require("../utils/generateId");

const DEPOSIT_PERCENTAGE = 0.2; // 20% deposit at booking, rest paid on the day
const TREATMENT_SHEET = "TreatmentBookingsPayment";

/**
 * POST /payments/create-checkout-session
 * Treatment-deposit flow — payment logic unchanged, now also logs a
 * "Pending" row to the TreatmentBookingsPayment sheet.
 */
exports.createDepositCheckoutSession = async (req, res) => {
  try {
    const {
      treatmentId,
      treatmentName,
      totalPrice,
      customerName,
      customerEmail,
      customerPhone,
      preferredDate,
    } = req.body;

    if (!treatmentName || !totalPrice || !customerName || !customerEmail || !customerPhone) {
      return res.status(400).json({ error: "Missing required booking details." });
    }

    const total = Number(totalPrice);
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid treatment price." });
    }

    const depositAmountPence = Math.round(total * DEPOSIT_PERCENTAGE * 100);
    const depositAmount = (depositAmountPence / 100).toFixed(2);
    const remainingBalance = (total - total * DEPOSIT_PERCENTAGE).toFixed(2);
    const bookingId = generateId();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Card, Klarna and Clearpay all offered at checkout. Klarna/Clearpay
      // need a billing address for their eligibility checks — this has no
      // effect on the card flow.
      payment_method_types: ["card", "klarna", "afterpay_clearpay"],
      billing_address_collection: "required",
      customer_email: customerEmail,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `${treatmentName} — 20% Booking Deposit`,
              description: `Deposit to secure your appointment. Remaining balance of £${remainingBalance} is due on the day of treatment.`,
            },
            unit_amount: depositAmountPence,
          },
          quantity: 1,
        },
      ],
      metadata: {
        bookingType: "treatment_deposit",
        bookingId,
        treatmentId: treatmentId || "",
        treatmentName,
        totalPrice: total.toFixed(2),
        depositPaid: depositAmount,
        remainingBalance,
        customerName,
        customerPhone,
        preferredDate: preferredDate || "",
      },
      success_url: `${process.env.CLIENT_URL}/book-consultation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/book-consultation`,
    });

    // Log the booking as "Pending" as soon as checkout is created — the
    // webhook flips it to "Paid" once Stripe confirms. A sheet-write failure
    // here must never block the customer from reaching Stripe checkout.
    try {
      const timestamp = new Date().toISOString();
      await insertRow(TREATMENT_SHEET, {
        bookingId,
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        treatmentId: treatmentId || "",
        treatmentName,
        amount: depositAmount,
        remainingBalance,
        preferredDate: preferredDate || "Not specified",
        paymentStatus: "Pending",
        stripeSessionId: session.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    } catch (sheetErr) {
      console.error("⚠️ TreatmentBookingsPayment sheet insert failed:", sheetErr.message);
    }

    return res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    console.error("Stripe checkout session error:", err);
    return res.status(500).json({ error: "Could not start payment. Please try again." });
  }
};

exports.verifyCheckoutSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid") {
      return res.status(200).json({
        paid: true,
        treatmentName: session.metadata.treatmentName,
        depositPaid: session.metadata.depositPaid,
        remainingBalance: session.metadata.remainingBalance,
        customerEmail: session.customer_email,
      });
    }

    return res.status(200).json({ paid: false });
  } catch (err) {
    console.error("Verify session error:", err);
    return res.status(500).json({ error: "Could not verify payment." });
  }
};

/**
 * POST /payments/webhook
 * Shared Stripe webhook for ALL Checkout Session flows in the app.
 * Dispatches on metadata.flowType (course flows) — anything else is the
 * original treatment-deposit behaviour, now also updating TreatmentBookingsPayment.
 * Must be mounted with express.raw() BEFORE express.json() in app.js.
 */
exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const flowType = session.metadata?.flowType;

    try {
      if (flowType === "enrollment") {
        await fulfillEnrollment(session, "Enrollments");
      } else if (flowType === "deposit_enrollment") {
        await fulfillEnrollment(session, "DepositEnrollments");
      } else if (flowType === "subscription_first_payment") {
        await fulfillSubscriptionFirstPayment(session);
      } else {
        // Original treatment-deposit behaviour — unchanged, plus the sheet update.
        console.log("Deposit paid:", {
          treatment: session.metadata.treatmentName,
          customer: session.metadata.customerName,
          phone: session.metadata.customerPhone,
          email: session.customer_email,
          depositPaid: session.metadata.depositPaid,
          remainingBalance: session.metadata.remainingBalance,
          preferredDate: session.metadata.preferredDate,
        });

        try {
          await updateRowByField(TREATMENT_SHEET, "stripeSessionId", session.id, {
            paymentStatus: "Paid",
            updatedAt: new Date().toISOString(),
          });
        } catch (sheetErr) {
          console.error("⚠️ TreatmentBookingsPayment sheet update failed:", sheetErr.message);
        }
      }
    } catch (err) {
      // Acknowledge receipt regardless, to avoid a Stripe retry storm — but
      // log loudly so a failed Sheets update/email can be caught manually.
      console.error("Webhook fulfillment error:", err);
    }
  }

  res.json({ received: true });
};