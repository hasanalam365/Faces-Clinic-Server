// routes/subscriptionEnrollment.routes.js
// Subscription flow, step 1: collect details, create the Sheets row + the
// SignWell agreement document.
const express = require("express");
const router = express.Router();
const controller = require("../controllers/subscriptionEnrollment.controller");

router.post("/subscription-enrollment/create-agreement", controller.validation, controller.createAgreement);

module.exports = router;