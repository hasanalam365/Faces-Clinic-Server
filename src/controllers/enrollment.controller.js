// controllers/enrollment.controller.js
//
// Full-payment course enrollment (option 1 of 3 in BookCourse.jsx). Mirrors
// the treatment-deposit flow in payments.controller.js, but for courses —
// completion is handled by the SAME shared Stripe webhook
// (controllers/payments.controller.js -> services/enrollmentFulfillment.js
// -> fulfillEnrollment), which marks the "Enrollments" tab row "Paid" and
// sends the confirmation emails. That's why this file only ever writes
// paymentStatus: "Pending" — never "Paid".
//
// ASSUMPTION (please check against your real frontend routes): success_url /
// cancel_url point at /enroll/:courseId, matching the `path` used for this
// option in Bookcourse.jsx. Adjust if your actual confirmation page lives
// somewhere else.
const stripe = require("../config/stripe");
const courses = require("../config/courses");
const { insertRow, findRowByField } = require("../services/sheetsDb");
const { generateId } = require("../utils/generateId");

const TAB = "Enrollments";

exports.createEnrollmentCheckout = async (req, res) => {
  try {
    const { courseId, name, email, phone } = req.body;
    if (!courseId || !name || !email || !phone) {
      return res.status(400).json({ error: "Missing required enrollment details." });
    }

    const course = courses[courseId];
    if (!course) return res.status(400).json({ error: "Invalid course selected." });

    const enrollmentId = generateId();

    await insertRow(TAB, {
      enrollmentId,
      name,
      email,
      phone,
      courseId,
      courseName: course.name,
      amount: (course.fullPrice / 100).toFixed(2),
      remainingBalance: "0.00",
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
              name: course.name,
              description: "Full course payment.",
            },
            unit_amount: course.fullPrice,
          },
          quantity: 1,
        },
      ],
      metadata: { flowType: "enrollment", enrollmentId },
      success_url: `${process.env.CLIENT_URL}/enroll/${courseId}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/enroll/${courseId}`,
    });

    return res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    console.error("Enrollment checkout error:", err);
    return res.status(500).json({ error: "Could not start payment. Please try again." });
  }
};

exports.verifyEnrollmentSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.status(200).json({ paid: false });
    }

    const found = await findRowByField(TAB, "enrollmentId", session.metadata?.enrollmentId);

    return res.status(200).json({
      paid: true,
      courseName: found?.data?.courseName,
      amount: found?.data?.amount,
      customerEmail: session.customer_email,
    });
  } catch (err) {
    console.error("Verify enrollment session error:", err);
    return res.status(500).json({ error: "Could not verify payment." });
  }
};