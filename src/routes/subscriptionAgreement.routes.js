// routes/subscriptionAgreement.routes.js
// Subscription flow, step 2: poll/check signing status, and the SignWell
// webhook. Has its own pollingLimiter (see app.js comment) because the
// step-2 page polls this GET endpoint every few seconds while waiting on
// the student to finish signing.
const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const controller = require("../controllers/subscriptionAgreement.controller");

const pollingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/subscription-agreement-status/:enrollmentId", pollingLimiter, controller.checkAgreementStatus);

// SignWell posts JSON (not a raw-signature webhook like Stripe/GoCardless),
// so ordinary express.json() parsing in app.js is fine here. The secret in
// the URL is what controller.handleSignWellWebhook checks.
router.post("/webhooks/signwell/:secret", controller.handleSignWellWebhook);

module.exports = router;