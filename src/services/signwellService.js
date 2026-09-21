// services/signwellService.js
//
// Wraps the SignWell API for the subscription-agreement flow
// (controllers/subscriptionenrollment.controller.js and
// controllers/subscriptionAgreement.controller.js both call this).
//
// ⚠️ ASSUMPTION THAT NEEDS CHECKING AGAINST YOUR SIGNWELL ACCOUNT:
// Creating a document FROM A TEMPLATE requires the recipient's
// `placeholder_name` to exactly match the signer "role" name set up on your
// template in the SignWell dashboard (Templates -> your template -> Roles).
// "Recipient 1" is SignWell's usual default name for a single-signer
// template, but if you named the role something else (e.g. "Student",
// "Signer"), change PLACEHOLDER_NAME below to match — otherwise document
// creation will fail with a "placeholder not found" style error.
//
// Likewise, double-check the `api_id` values used in TEMPLATE_FIELDS against
// the actual field names on your template (Templates -> Edit -> each text
// field's "API ID").
const axios = require("axios");
const { SIGNWELL_API_KEY, TEMPLATE_ID, BASE_URL, TEST_MODE } = require("../config/signwell");

const PLACEHOLDER_NAME = "Recipient 1"; // ⚠️ confirm against your template's role name

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    "X-Api-Key": SIGNWELL_API_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

/**
 * Creates (and sends) a SignWell document from the configured template, with
 * embedded signing enabled, and returns the embedded signing URL for the
 * student's first visit to the agreement step.
 */
async function createAgreementDocument({ name, email, enrollmentId, courseName }) {
  const res = await client.post("/document_templates/documents", {
    test_mode: TEST_MODE,
    template_id: TEMPLATE_ID,
    name: `${courseName} - Enrolment Agreement`,
    embedded_signing: true,
    draft: false,
    metadata: { enrollmentId },
    recipients: [
      {
        id: "1",
        placeholder_name: PLACEHOLDER_NAME,
        name,
        email,
      },
    ],
    template_fields: [
      { api_id: "student_name", value: name }, // ⚠️ confirm these api_id values
      { api_id: "course_name", value: courseName }, //    against your template
    ],
  });

  const doc = res.data;
  const recipient = doc.recipients?.find((r) => r.id === "1") || doc.recipients?.[0];

  return {
    documentId: doc.id,
    signingUrl: recipient?.embedded_signing_url || null,
  };
}

/** Live status of a document, straight from SignWell — never trust a cached/local flag. */
async function getDocumentStatus(documentId) {
  const res = await client.get(`/documents/${documentId}`);
  return res.data;
}

/** Re-fetches an embedded signing URL for a recipient (e.g. if the student reloads the step-2 page). */
async function getEmbeddedSigningUrl(documentId, email) {
  const doc = await getDocumentStatus(documentId);
  const recipient = doc.recipients?.find((r) => r.email === email) || doc.recipients?.[0];
  return recipient?.embedded_signing_url || null;
}

module.exports = { createAgreementDocument, getDocumentStatus, getEmbeddedSigningUrl };