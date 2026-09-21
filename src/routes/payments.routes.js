// routes/payments.routes.js
// Treatment-deposit routes — unchanged.
//
// The old GET /payments/course-session/:sessionId route was removed together
// with the old academy course system. Course payments now live in:
//   routes/enrollment.routes.js, depositEnrollment.routes.js,
//   subscriptionEnrollment.routes.js, subscriptionPayment.routes.js
const express = require("express");
const router = express.Router();

const {
  createDepositCheckoutSession,
  verifyCheckoutSession,
} = require("../controllers/payments.controller");

// Start a deposit payment for a treatment booking
router.post("/payments/create-checkout-session", createDepositCheckoutSession);

// Confirm a treatment deposit was actually paid, after Stripe redirects back
router.get("/payments/session/:sessionId", verifyCheckoutSession);

// Note: webhooks are NOT here — /payments/webhook and /gc/webhook are
// registered directly in app.js with express.raw() so their signature checks
// work against the unparsed body.

module.exports = router;