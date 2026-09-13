// routes/payments.routes.js
const express = require("express");
const router = express.Router();
const {
  createDepositCheckoutSession,
  verifyCheckoutSession,
} = require("../controllers/payments.controller");

// Start a deposit payment for a treatment booking
router.post("/payments/create-checkout-session", createDepositCheckoutSession);

// Confirm a deposit was actually paid, after Stripe redirects back
router.get("/payments/session/:sessionId", verifyCheckoutSession);

// Note: the /payments/webhook route is NOT here — it's registered directly
// in app.js with express.raw() so Stripe's signature check works.

module.exports = router;