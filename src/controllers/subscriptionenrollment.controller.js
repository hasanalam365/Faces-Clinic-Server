// controllers/subscriptionEnrollment.controller.js
// Step 1 of the subscription flow: collect details, create the row in
// Sheets, and create the SignWell agreement document — using THIS course's
// own SignWell template (course.signwellTemplateId, from config/courses.js).
//
// Monthly-plan model: a one-off SetupFee (Stripe, step 4) followed by an
// ongoing MonthlyFee (GoCardless Direct Debit, step 5) that has NO fixed
// number of instalments — it keeps charging until cancelled. Both amounts
// are snapshotted here, at signing time, so a later price change in
// courses.js can't alter what an already-signed enrollment gets charged.
const { body, validationResult } = require("express-validator");
const sanitizeHtml = require("sanitize-html");
const courses = require("../config/courses");
const { insertRow, updateRowByField } = require("../services/sheetsDb");
const { generateId } = require("../utils/generateId");
const signwellService = require("../services/signwellService");

const TAB = "SubscriptionEnrollments";
const clean = (v) => sanitizeHtml(v || "", { allowedTags: [], allowedAttributes: {} });
const pounds = (pence) => (pence / 100).toFixed(2);

exports.validation = [
  body("name").trim().notEmpty().isLength({ max: 100 }).escape(),
  body("email").trim().isEmail().normalizeEmail(),
  body("phone").trim().notEmpty().isLength({ max: 20 }),
  body("courseId").trim().notEmpty(),
];

exports.createAgreement = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { courseId, name, email, phone } = req.body;
    const course = courses[courseId];
    if (!course) return res.status(400).json({ message: "Invalid course selected." });

    const plan = course.subscription; // { setupFee, monthlyFee } — pence
    const safeName = clean(name);
    const safeEmail = clean(email);
    const safePhone = clean(phone);
    const enrollmentId = generateId();

    await insertRow(TAB, {
      enrollmentId,
      name: safeName,
      email: safeEmail,
      phone: safePhone,
      courseId,
      courseName: course.name,
      // Snapshot NOW, at signing time — the first-payment checkout and the
      // GoCardless subscription later read THESE stored values, not
      // courses.js again.
      setupFee: pounds(plan.setupFee), // Stripe, step 4 (one-off)
      monthlyFee: pounds(plan.monthlyFee), // GoCardless, step 5 (ongoing, no end date)
      currency: course.currency,
      status: "Pending Signature",
      agreementSigned: "false",
      signwellDocumentId: "",
      identityVerified: "false",
      addressProofType: "",
      addressProofUrl: "",
      identityProofType: "",
      identityProofNumber: "",
      identityFrontUrl: "",
      identityBackUrl: "",
      firstPaymentStatus: "Pending", // tracks the SetupFee Stripe payment
      firstPaymentSessionId: "",
      gcRedirectFlowId: "",
      mandateId: "",
      gcCustomerId: "",
      subscriptionId: "",
      paymentStatus: "Pending",
      lastPaymentStatus: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let documentId = null;
    let signingUrl = null;
    try {
      const doc = await signwellService.createAgreementDocument({
        name: safeName,
        email: safeEmail,
        enrollmentId,
        courseName: course.name,
        templateId: course.signwellTemplateId, // course-specific template
      });
      documentId = doc.documentId;
      signingUrl = doc.signingUrl;
    } catch (swErr) {
      console.error("SignWell create document error:", swErr.response?.data || swErr.message);
      await updateRowByField(TAB, "enrollmentId", enrollmentId, {
        status: "Failed - Agreement Creation",
        updatedAt: new Date().toISOString(),
      });
      return res.status(502).json({
        success: false,
        message: "Could not create the signing document. Please try again.",
      });
    }

    await updateRowByField(TAB, "enrollmentId", enrollmentId, {
      signwellDocumentId: documentId,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      enrollmentId,
      signingUrl,
      courseName: course.name,
      setupFee: pounds(plan.setupFee),
      monthlyFee: pounds(plan.monthlyFee),
    });
  } catch (error) {
    console.error("Create subscription agreement error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};