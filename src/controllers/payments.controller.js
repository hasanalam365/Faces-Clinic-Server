// controllers/payments.controller.js
//
// Treatment payment flow (createDepositCheckoutSession, verifyCheckoutSession).
//
// NEW: customer can choose between two payment options:
//   - "deposit" : 20% of the (discounted) total now, rest on the day (default)
//   - "full"    : 100% of the (discounted) total now, nothing due on the day
//
// Klarna + Clearpay are offered alongside card on every Stripe checkout.
//
// Google Sheets logging for CLINICAL TREATMENT bookings only, via the generic
// sheetsDb layer — tab "TreatmentBookingsPayment":
//   - createDepositCheckoutSession inserts a "Pending" row
//   - handleStripeWebhook's treatment branch updates that row to "Paid"
//
// IMPORTANT — the "TreatmentBookingsPayment" tab needs this header row (row 1),
// in any order (sheetsDb maps by header NAME, not position):
//   bookingId | name | email | phone | treatmentId | treatmentName | amount
//   | remainingBalance | preferredDate | paymentStatus | stripeSessionId
//   | createdAt | updatedAt | originalPrice | discountPercent | discountedPrice
//   | paymentType
// (paymentType is NEW — add it as an extra header)
//
// The webhook does not import ./academypayments.controller (old course system).
// handleStripeWebhook handles flowType "subscription_first_payment"; the
// "enrollment" / "deposit_enrollment" branches are unchanged.
const stripe = require("../config/stripe");
const {
  fulfillEnrollment,
  fulfillSubscriptionFirstPayment,
} = require("../services/enrollmentFulfillment");
const { insertRow, updateRowByField } = require("../services/sheetsDb");
const { generateId } = require("../utils/generateId");

const DEPOSIT_PERCENTAGE = 0.2; // 20% deposit at booking, rest paid on the day
const TREATMENT_SHEET = "TreatmentBookingsPayment";

// October offer — 20% off every treatment. Keep in sync with
// OFFER_PERCENT / OFFER_END in the frontend ClinicalTreatments.jsx.
// Enforced HERE so the discount can't be kept or faked after the offer ends.
const OFFER_PERCENT = 20;
const OFFER_END = new Date("2026-10-31T23:59:59Z");
const isOfferActive = () => new Date() <= OFFER_END;

/**
 * POST /payments/create-checkout-session
 * Treatment payment flow — supports "deposit" (20% now) or "full" (100% now).
 * Logs a "Pending" row to the TreatmentBookingsPayment sheet.
 */
exports.createDepositCheckoutSession = async (req, res) => {
  try {
    const {
      treatmentId,
      treatmentName,
      totalPrice,
      originalPrice,
      customerName,
      customerEmail,
      customerPhone,
      preferredDate,
    } = req.body;

    // NEW: "deposit" (20% now, rest on the day) or "full" (pay everything now).
    // Anything other than "full" falls back to "deposit" (previous behaviour).
    const paymentOption = req.body.paymentOption === "full" ? "full" : "deposit";
    const isFullPayment = paymentOption === "full";

    if (!treatmentName || !totalPrice || !customerName || !customerEmail || !customerPhone) {
      return res.status(400).json({ error: "Missing required booking details." });
    }

    let total = Number(totalPrice);
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid treatment price." });
    }

    // October offer: if the frontend sent the regular price, work out the
    // discounted total here on the server (only while the offer is live).
    // The deposit / full payment below is then taken from the DISCOUNTED total.
    let originalTotal = total;
    let discountPercent = 0;
    const regular = Number(originalPrice);
    if (Number.isFinite(regular) && regular > 0) {
      originalTotal = regular;
      if (isOfferActive()) {
        discountPercent = OFFER_PERCENT;
        total = Math.round(regular * (100 - OFFER_PERCENT)) / 100;
      } else {
        total = regular;
      }
    }

    // Full payment = whole (already discounted) total now, £0 left.
    // Deposit = 20% of the (discounted) total now, rest on the day.
    const depositAmountPence = isFullPayment
      ? Math.round(total * 100)
      : Math.round(total * DEPOSIT_PERCENTAGE * 100);
    const depositAmount = (depositAmountPence / 100).toFixed(2); // amount charged today
    const remainingBalance = isFullPayment
      ? "0.00"
      : (total - total * DEPOSIT_PERCENTAGE).toFixed(2);
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
              name: isFullPayment
                ? `${treatmentName} — Full Payment`
                : `${treatmentName} — 20% Booking Deposit`,
              description:
                (isFullPayment
                  ? `Full payment for your treatment. Nothing further is due on the day.`
                  : `Deposit to secure your appointment. Remaining balance of £${remainingBalance} is due on the day of treatment.`) +
                (discountPercent
                  ? ` October offer applied: ${discountPercent}% off (£${originalTotal.toFixed(2)} → £${total.toFixed(2)}).`
                  : ""),
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
        originalPrice: originalTotal.toFixed(2),
        discountPercent: String(discountPercent),
        depositPaid: depositAmount,
        remainingBalance,
        paymentOption,
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
        originalPrice: originalTotal.toFixed(2),
        discountPercent: `${discountPercent}%`,
        discountedPrice: total.toFixed(2),
        preferredDate: preferredDate || "Not specified",
        paymentStatus: "Pending",
        paymentType: isFullPayment ? "Full Payment" : "20% Deposit",
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
        paymentOption: session.metadata.paymentOption || "deposit", // NEW
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
 * treatment payment behaviour, which also updates TreatmentBookingsPayment.
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
        // Treatment payment (deposit or full) — unchanged, plus the sheet update.
        console.log("Treatment payment received:", {
          treatment: session.metadata.treatmentName,
          customer: session.metadata.customerName,
          phone: session.metadata.customerPhone,
          email: session.customer_email,
          paymentOption: session.metadata.paymentOption || "deposit",
          paid: session.metadata.depositPaid,
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