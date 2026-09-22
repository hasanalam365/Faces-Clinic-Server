// services/signwellService.js
//
// Wraps the SignWell API for the subscription-agreement flow
// (controllers/subscriptionenrollment.controller.js and
// controllers/subscriptionAgreement.controller.js both call this).
//
// Fixes vs the previous version (from SignWell's own error message):
//  • placeholder_name was "Recipient 1" — your template's signer role is
//    "student", so SignWell said: "placeholder_names do not have a recipient
//    assigned: student". Now defaults to "student" (override with
//    SIGNWELL_PLACEHOLDER_NAME in .env if you rename the role).
//  • template_fields used api_ids "student_name" / "course_name", which do NOT
//    exist on your template. Now the api_ids come from .env, and if they are
//    not set the template_fields are simply not sent (document still gets
//    created; the signer name/email are filled from `recipients`).
//
// .env (all optional):
//   SIGNWELL_PLACEHOLDER_NAME=student
//   SIGNWELL_FIELD_STUDENT_NAME=<API ID of the name text field on the template>
//   SIGNWELL_FIELD_COURSE_NAME=<API ID of the course text field on the template>
const axios = require("axios");
const { SIGNWELL_API_KEY, TEMPLATE_ID, BASE_URL, TEST_MODE } = require("../config/signwell");

const PLACEHOLDER_NAME = process.env.SIGNWELL_PLACEHOLDER_NAME || "student";
const STUDENT_NAME_FIELD = process.env.SIGNWELL_FIELD_STUDENT_NAME || "";
const COURSE_NAME_FIELD = process.env.SIGNWELL_FIELD_COURSE_NAME || "";

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
  const templateFields = [];
  if (STUDENT_NAME_FIELD) templateFields.push({ api_id: STUDENT_NAME_FIELD, value: name });
  if (COURSE_NAME_FIELD) templateFields.push({ api_id: COURSE_NAME_FIELD, value: courseName });

  // NOTE: there is no backend "redirect after signing" field for embedded
  // signing — SignWell's embedded mode is meant to be opened inside YOUR page
  // via their SignWellEmbed JS widget (not a full-page navigation to
  // signwell.com), and the redirect/next-step behaviour is handled there via
  // the widget's `events.completed` callback. See Subscriptionagreementstatus.jsx.
  const payload = {
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
  };
  if (templateFields.length) payload.template_fields = templateFields;

  const res = await client.post("/document_templates/documents", payload);

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