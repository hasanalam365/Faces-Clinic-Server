// controllers/depositEnrollment.controller.js
//
// Fixed £250 deposit course enrollment (option 2 of 3 in BookCourse.jsx). Same
// pattern as controllers/enrollment.controller.js — completion is handled by
// the shared Stripe webhook (fulfillEnrollment) against the
// "DepositEnrollments" tab, not by this file.
//
// ASSUMPTION (please check): success_url / cancel_url point at
// /deposit-enroll/:courseId, matching Bookcourse.jsx. Adjust if different.
//
// NEW: `location` and `date` are now saved to the "DepositEnrollments" tab.
// Add two header cells named exactly  location  and  date  to row 1 of it.
const stripe = require("../config/stripe");
const courses = require("../config/courses");
const { insertRow, findRowByField } = require("../services/sheetsDb");
const { generateId } = require("../utils/generateId");
const { fulfillEnrollment } = require("../services/enrollmentFulfillment");

const TAB = "DepositEnrollments";

// Plain-text, trimmed, length-capped (location/date are free text from the client).
const clean = (v) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, 100);

exports.createDepositEnrollmentCheckout = async (req, res) => {
  try {
    const { courseId, name, email, phone } = req.body;
    const location = clean(req.body.location);
    const date = clean(req.body.date);

    if (!courseId || !name || !email || !phone) {
      return res.status(400).json({ error: "Missing required enrollment details." });
    }

    const course = courses[courseId];
    if (!course) return res.status(400).json({ error: "Invalid course selected." });

    const enrollmentId = generateId();
    const remainingBalance = (course.remainingAfterDeposit / 100).toFixed(2);

    await insertRow(TAB, {
      enrollmentId,
      name,
      email,
      phone,
      courseId,
      courseName: course.name,
      location,
      date,
      amount: (course.depositAmount / 100).toFixed(2),
      remainingBalance,
      paymentStatus: "Pending",
      stripeSessionId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Card, Klarna and Clearpay all offered at checkout. Klarna/Clearpay
      // need a billing address for their eligibility checks — this has no
      // effect on the card flow.
      payment_method_types: ["card", "klarna", "afterpay_clearpay"],
      billing_address_collection: "required",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: (course.currency || "GBP").toLowerCase(),
            product_data: {
              name: `${course.name} — Course Deposit`,
              description: `Deposit to secure your place. The remaining £${remainingBalance} is due before the course starts.`,
            },
            unit_amount: course.depositAmount,
          },
          quantity: 1,
        },
      ],
      metadata: { flowType: "deposit_enrollment", enrollmentId, location, date },
      success_url: `${process.env.CLIENT_URL}/deposit-enroll/${courseId}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/deposit-enroll/${courseId}`,
    });

    return res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    console.error("Deposit enrollment checkout error:", err);
    return res.status(500).json({ error: "Could not start payment. Please try again." });
  }
};

exports.verifyDepositEnrollmentSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.metadata?.flowType !== "deposit_enrollment") {
      return res.status(400).json({ error: "Invalid session." });
    }

    if (session.payment_status !== "paid") {
      return res.status(200).json({ paid: false });
    }

    // Fallback in case the Stripe webhook is slow/missed: mark the row "Paid"
    // and send the emails. fulfillEnrollment() is idempotent (skips if the
    // row is already "Paid"), so the webhook and this can both run safely.
    try {
      await fulfillEnrollment(session, TAB);
    } catch (fulfilErr) {
      console.error("Deposit enrollment fulfil (verify) error:", fulfilErr);
    }

    const found = await findRowByField(TAB, "enrollmentId", session.metadata?.enrollmentId);

    return res.status(200).json({
      paid: true,
      courseName: found?.data?.courseName,
      amount: found?.data?.amount,
      remainingBalance: found?.data?.remainingBalance,
      customerEmail: session.customer_email,
    });
  } catch (err) {
    console.error("Verify deposit enrollment session error:", err);
    return res.status(500).json({ error: "Could not verify payment." });
  }
};