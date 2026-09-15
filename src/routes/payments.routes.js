// routes/payments.routes.js
const express = require("express");
const router = express.Router();
const {
  createDepositCheckoutSession,
  verifyCheckoutSession,
} = require("../controllers/payments.controller");
const {
  createCourseCheckoutSession,
  verifyCourseCheckoutSession,
} = require("../controllers/academypayments.controller");

// Start a deposit payment for a treatment booking
router.post("/payments/create-checkout-session", createDepositCheckoutSession);

// Confirm a deposit was actually paid, after Stripe redirects back
router.get("/payments/session/:sessionId", verifyCheckoutSession);

// Start a payment for an Academy Course enrolment
router.post("/payments/create-course-checkout-session", createCourseCheckoutSession);

// Confirm a course payment was actually paid, after Stripe redirects back
router.get("/payments/course-session/:sessionId", verifyCourseCheckoutSession);

// Note: the /payments/webhook route is NOT here — it's registered directly
// in app.js with express.raw() so Stripe's signature check works. Both the
// treatment-deposit flow and this course flow share that one webhook; see
// payments.controller.js's handleStripeWebhook for how it tells them apart.

module.exports = router;