// controllers/identityVerification.controller.js
// Step 3: address + identity proof document upload (ImgBB-hosted), gated on
// the agreement already being signed.
//
// Changes vs the previous version:
//  • Only JPG/PNG. ImgBB can't host PDFs — the old code silently skipped them
//    and still marked the enrollment "verified" with no document stored.
//  • If ANY upload fails, the request fails (502) instead of marking the
//    enrollment verified with empty URLs.
//  • Uploads run in parallel.
const { body, validationResult } = require("express-validator");
const sanitizeHtml = require("sanitize-html");
const axios = require("axios");
const { findRowByField, updateRowByField } = require("../services/sheetsDb");
const { isValidImgbbUrl } = require("../utils/imgbbValidator");
const { isTrue } = require("../utils/sheetValues");

const TAB = "SubscriptionEnrollments";
const clean = (v) => sanitizeHtml(v || "", { allowedTags: [], allowedAttributes: {} });

const ADDRESS_PROOF_TYPES = ["utility_bill", "bank_statement"];
const IDENTITY_PROOF_TYPES = ["passport", "driving_license"];
const ALLOWED_MIMETYPES = ["image/jpeg", "image/jpg", "image/png"];

exports.validation = [
  body("enrollmentId").trim().notEmpty(),
  body("addressProofType").trim().notEmpty().isIn(ADDRESS_PROOF_TYPES),
  body("identityProofType").trim().notEmpty().isIn(IDENTITY_PROOF_TYPES),
  body("identityProofNumber").optional().trim().isLength({ max: 50 }).escape(),
];

const uploadToImgBB = async (file) => {
  const params = new URLSearchParams();
  params.append("image", file.buffer.toString("base64"));
  params.append("name", file.originalname);

  const response = await axios.post(
    `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  const url = response.data?.data?.url || null;
  // Don't trust whatever URL comes back without checking it's really an
  // ImgBB-hosted https link.
  if (!isValidImgbbUrl(url)) throw new Error("ImgBB returned an unexpected URL");
  return url;
};

exports.createIdentityVerification = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { enrollmentId, addressProofType, identityProofType, identityProofNumber } = req.body;

    const found = await findRowByField(TAB, "enrollmentId", enrollmentId);
    if (!found) return res.status(404).json({ message: "Enrollment not found." });
    if (!isTrue(found.data.agreementSigned)) {
      return res.status(403).json({ message: "Please sign the agreement before continuing." });
    }
    if (isTrue(found.data.identityVerified)) {
      return res.status(200).json({ success: true, enrollmentId, alreadySubmitted: true });
    }

    const addressProofFile = req.files?.addressProofFile?.[0];
    if (!addressProofFile || !ALLOWED_MIMETYPES.includes(addressProofFile.mimetype)) {
      return res.status(400).json({ message: "A valid address proof image (JPG or PNG) is required." });
    }

    const identityFrontFile = req.files?.identityFrontFile?.[0];
    if (!identityFrontFile || !ALLOWED_MIMETYPES.includes(identityFrontFile.mimetype)) {
      return res.status(400).json({ message: "A valid identity proof image (JPG or PNG) is required." });
    }

    const identityBackFile = req.files?.identityBackFile?.[0];
    if (identityProofType === "driving_license" && !identityBackFile) {
      return res.status(400).json({ message: "Back side of the driving licence is required." });
    }
    if (identityBackFile && !ALLOWED_MIMETYPES.includes(identityBackFile.mimetype)) {
      return res.status(400).json({ message: "Invalid identity proof back file type." });
    }

    const safeIdentityNumber = identityProofNumber ? clean(identityProofNumber) : "";

    let addressImageUrl;
    let identityFrontImageUrl;
    let identityBackImageUrl = "";

    try {
      [addressImageUrl, identityFrontImageUrl, identityBackImageUrl] = await Promise.all([
        uploadToImgBB(addressProofFile),
        uploadToImgBB(identityFrontFile),
        identityBackFile ? uploadToImgBB(identityBackFile) : Promise.resolve(""),
      ]);
    } catch (e) {
      console.error("ImgBB upload error:", e.response?.data || e.message);
      return res.status(502).json({ message: "We couldn't store your documents. Please try again." });
    }

    await updateRowByField(TAB, "enrollmentId", enrollmentId, {
      addressProofType,
      addressProofUrl: addressImageUrl,
      identityProofType,
      identityProofNumber: safeIdentityNumber,
      identityFrontUrl: identityFrontImageUrl,
      identityBackUrl: identityBackImageUrl,
      identityVerified: "true",
      status: "Pending Payment", // = waiting for the first payment
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({ success: true, enrollmentId });
  } catch (error) {
    console.error("Identity verification error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};