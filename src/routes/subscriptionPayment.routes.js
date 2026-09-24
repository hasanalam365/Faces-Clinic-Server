const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const controller = require("../controllers/subscriptionPayment.controller");


// Stripe / SignWell, so it gets a generous limiter of its own. That's why
// this router is mounted in app.js WITHOUT the shared strictLimiter.
const pollingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 30 : 500,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/subscription-enrollment/status/:enrollmentId", pollingLimiter, controller.getSubscriptionStatus);
router.post(
  "/subscription-enrollment/first-payment/create-checkout-session",
  checkoutLimiter,
  controller.createFirstPaymentCheckout
);

module.exports = router;