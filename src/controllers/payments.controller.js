// controllers/payments.controller.js
const stripe = require("../config/stripe");
const { handleAcademyCourseCompleted } = require("./academyPayments.controller");

const DEPOSIT_PERCENTAGE = 0.2; // 20% deposit at booking, rest paid on the day

/**
 * POST /payments/create-checkout-session
 *
 * Consultations stay free (handled entirely by BookConsultation.jsx / your
 * existing auth-less form) and never touch this endpoint. This endpoint is
 * only for "Book a Treatment", where we take a 20% deposit up front via
 * Stripe Checkout and collect the remaining 80% in person on the day.
 */
exports.createDepositCheckoutSession = async (req, res) => {
  try {
    console.log("DEBUG CLIENT_URL:", process.env.CLIENT_URL)
    const {
      treatmentId,
      treatmentName,
      totalPrice, // total treatment price in GBP, e.g. 250.00
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

    // ⚠️ Production note: right now `totalPrice` is trusted from the client.
    // Before going live, look the real price up server-side (by treatmentId)
    // against your own treatments source of truth, so the price can't be
    // tampered with in the browser before it reaches Stripe.

    const depositAmountPence = Math.round(total * DEPOSIT_PERCENTAGE * 100);
    const remainingBalance = (total - total * DEPOSIT_PERCENTAGE).toFixed(2);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
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

/**
 * GET /payments/session/:sessionId
 *
 * Called by the frontend after Stripe redirects back, to confirm the
 * deposit was actually paid before revealing the appointment calendar.
 * Never trust the presence of `session_id` in the URL alone.
 */
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
 *
 * Source of truth for "the deposit was really paid" — don't rely only on
 * the success_url redirect, since a customer could close the tab before
 * being redirected back. Must be mounted with express.raw() BEFORE
 * express.json() in app.js (see app.js comments).
 */
exports.handleStripeWebhook = (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;

      // Same webhook endpoint now serves two booking flows — dispatch on
      // metadata.bookingType so each keeps its own handling. Anything
      // without bookingType (or "treatment_deposit") falls through to the
      // original treatment-deposit behaviour, completely unchanged.
      if (session.metadata?.bookingType === "academy_course") {
        handleAcademyCourseCompleted(session);
        break;
      }

      // ✅ Deposit paid successfully.
      // TODO: once you have a database, save this booking here, and send a
      // confirmation email/SMS to the customer + a notification to the
      // clinic team using the fields below.
      console.log("Deposit paid:", {
        treatment: session.metadata.treatmentName,
        customer: session.metadata.customerName,
        phone: session.metadata.customerPhone,
        email: session.customer_email,
        depositPaid: session.metadata.depositPaid,
        remainingBalance: session.metadata.remainingBalance,
        preferredDate: session.metadata.preferredDate,
      });
      break;
    }
    default:
      break;
  }

  res.json({ received: true });
};