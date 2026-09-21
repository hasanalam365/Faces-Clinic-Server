// routes/enrollment.routes.js
// Full-payment course enrollment (option 1 of 3 in BookCourse.jsx).
const express = require("express");
const router = express.Router();
const controller = require("../controllers/enrollment.controller");

router.post("/enrollment/create-checkout-session", controller.createEnrollmentCheckout);
router.get("/enrollment/session/:sessionId", controller.verifyEnrollmentSession);

module.exports = router;