// controllers/payments.controller.js
//
// Treatment-deposit flow (createDepositCheckoutSession, verifyCheckoutSession)
// logic is otherwise UNCHANGED — the only edit is Klarna + Clearpay added to
// payment_method_types alongside card (client requirement: Klarna/Clearpay
// available on every Stripe checkout — course, subscription and treatment).
//
// Other differences from your previous file, both in the webhook area:
//  1. It no longer imports ./academypayments.controller (the old, replaced
//     course system — that file pulled in services that crash on start-up).
//  2. handleStripeWebhook gets one new branch: flowType
//     "subscription_first_payment" (the £ first payment of the monthly plan).
//     The "enrollment" / "deposit_enrollment" branches and the treatment
//     fallback behave exactly as before.
const stripe = require("../config/stripe");
const {
  fulfillEnrollment,
  fulfillSubscriptionFirstPayment,
} = require("../services/enrollmentFulfillment");

const DEPOSIT_PERCENTAGE = 0.2; // 20% deposit at booking, rest paid on the day

/**
 * POST /payments/create-checkout-session
 * Treatment-deposit flow — unchanged.
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
    const remainingBalance = (total - total * DEPOSIT_PERCENTAGE).toFixed(2);

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
        treatmentId: treatmentId || "",
        treatmentName,
        totalPrice: total.toFixed(2),
        depositPaid: (depositAmountPence / 100).toFixed(2),
        remainingBalance,
        customerName,
        customerPhone,
        preferredDate: preferredDate || "",
      },
      success_url: `${process.env.CLIENT_URL}/book-consultation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/book-consultation`,
    });

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
 * original treatment-deposit behaviour.
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
        // Original treatment-deposit behaviour — unchanged.
        console.log("Deposit paid:", {
          treatment: session.metadata.treatmentName,
          customer: session.metadata.customerName,
          phone: session.metadata.customerPhone,
          email: session.customer_email,
          depositPaid: session.metadata.depositPaid,
          remainingBalance: session.metadata.remainingBalance,
          preferredDate: session.metadata.preferredDate,
        });
      }
    } catch (err) {
      // Acknowledge receipt regardless, to avoid a Stripe retry storm — but
      // log loudly so a failed Sheets update/email can be caught manually.
      console.error("Webhook fulfillment error:", err);
    }
  }

  res.json({ received: true });
};