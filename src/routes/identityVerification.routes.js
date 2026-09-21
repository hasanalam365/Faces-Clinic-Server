// routes/identityVerification.routes.js
// Subscription flow, step 3: address + identity proof document upload.
const express = require("express");
const router = express.Router();
const uploadDocument = require("../middlewares/uploadDocument");
const controller = require("../controllers/identityVerification.controller");

router.post(
  "/subscription-enrollment/identity-verification",
  uploadDocument,
  controller.validation,
  controller.createIdentityVerification
);

module.exports = router;