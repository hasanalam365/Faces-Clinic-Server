// controllers/academyPayments.controller.js
const stripe = require("../config/stripe");

/**
 * POST /payments/create-course-checkout-session
 *
 * Same pattern as the treatment-deposit flow in payments.controller.js,
 * but for Academy Course enrolment. Courses are paid in FULL up front
 * (no 20% deposit / on-the-day balance) — change PAY_FULL_PRICE below if
 * you'd rather take a deposit for courses too.
 */
const PAY_FULL_PRICE = true;
const COURSE_DEPOSIT_PERCENTAGE = 0.2; // only used if PAY_FULL_PRICE is false

exports.createCourseCheckoutSession = async (req, res) => {
  try {
    const {
      courseId,
      courseName,
      coursePrice, // full course price in GBP, e.g. 850.00
      customerName,
      customerEmail,
      customerPhone,
    } = req.body;

    if (!courseName || !coursePrice || !customerName || !customerEmail || !customerPhone) {
      return res.status(400).json({ error: "Missing required enrolment details." });
    }

    const total = Number(coursePrice);
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid course price." });
    }

    // ⚠️ Production note: same as the treatment flow — `coursePrice` is
    // currently trusted from the client. Before going live, look the real
    // price up server-side (by courseId) against your own courses source
    // of truth, so the price can't be tampered with in the browser.

    const amountToChargeNow = PAY_FULL_PRICE ? total : total * COURSE_DEPOSIT_PERCENTAGE;
    const amountToChargePence = Math.round(amountToChargeNow * 100);
    const remainingBalance = (total - amountToChargeNow).toFixed(2);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: customerEmail,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: PAY_FULL_PRICE
                ? `${courseName} — Course Enrolment`
                : `${courseName} — 20% Booking Deposit`,
              description: PAY_FULL_PRICE
                ? `Full payment to secure your place on this course.`
                : `Deposit to secure your place. Remaining balance of £${remainingBalance} is due before the course starts.`,
            },
            unit_amount: amountToChargePence,
          },
          quantity: 1,
        },
      ],
      metadata: {
        bookingType: "academy_course",
        courseId: courseId || "",
        courseName,
        totalPrice: total.toFixed(2),
        amountPaid: (amountToChargePence / 100).toFixed(2),
        remainingBalance,
        customerName,
        customerPhone,
      },
      success_url: `${process.env.CLIENT_URL}/book-course?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/book-course`,
    });

    return res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    console.error("Stripe course checkout session error:", err);
    return res.status(500).json({ error: "Could not start payment. Please try again." });
  }
};

/**
 * GET /payments/course-session/:sessionId
 *
 * Called by the frontend after Stripe redirects back, to confirm the
 * course payment actually went through before revealing next steps.
 */
exports.verifyCourseCheckoutSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid") {
      return res.status(200).json({
        paid: true,
        courseName: session.metadata.courseName,
        amountPaid: session.metadata.amountPaid,
        remainingBalance: session.metadata.remainingBalance,
        customerEmail: session.customer_email,
      });
    }

    return res.status(200).json({ paid: false });
  } catch (err) {
    console.error("Verify course session error:", err);
    return res.status(500).json({ error: "Could not verify payment." });
  }
};

/**
 * Called from payments.controller.js's shared webhook handler when
 * event.data.object.metadata.bookingType === "academy_course". Kept as a
 * plain function (not an Express route) since it shares the webhook's
 * signature verification — no need for a second raw-body endpoint.
 */
exports.handleAcademyCourseCompleted = (session) => {
  // ✅ Course payment successful.
  // TODO: once you have a database, save this enrolment here, and send a
  // confirmation email/SMS to the customer + a notification to the
  // academy team using the fields below.
  console.log("Course payment received:", {
    course: session.metadata.courseName,
    customer: session.metadata.customerName,
    phone: session.metadata.customerPhone,
    email: session.customer_email,
    amountPaid: session.metadata.amountPaid,
    remainingBalance: session.metadata.remainingBalance,
  });
};