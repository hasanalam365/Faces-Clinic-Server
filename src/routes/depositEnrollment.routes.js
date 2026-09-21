// routes/depositEnrollment.routes.js
// 20% deposit course enrollment (option 2 of 3 in BookCourse.jsx).
const express = require("express");
const router = express.Router();
const controller = require("../controllers/depositEnrollment.controller");

router.post("/deposit-enrollment/create-checkout-session", controller.createDepositEnrollmentCheckout);
router.get("/deposit-enrollment/session/:sessionId", controller.verifyDepositEnrollmentSession);

module.exports = router;