// services/signwellService.js
//
// Wraps the SignWell API for the subscription-agreement flow
// (controllers/subscriptionenrollment.controller.js and
// controllers/subscriptionAgreement.controller.js both call this).
//
// Each course now has its OWN SignWell template (config/courses.js →
// course.signwellTemplateId). createAgreementDocument() takes `templateId`
// as a parameter and uses that; if the caller doesn't pass one (or a course
// hasn't been given its own template yet), it falls back to the old global
// SIGNWELL_TEMPLATE_ID so nothing breaks.
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
 * Creates (and sends) a SignWell document from the course's own template,
 * with embedded signing enabled, and returns the embedded signing URL for
 * the student's first visit to the agreement step.
 *
 * @param {string} templateId - course-specific SignWell template ID
 *   (config/courses.js → course.signwellTemplateId). Falls back to the
 *   global SIGNWELL_TEMPLATE_ID if not supplied.
 */
async function createAgreementDocument({ name, email, enrollmentId, courseName, templateId }) {
  const resolvedTemplateId = templateId || TEMPLATE_ID;

  if (!resolvedTemplateId) {
    throw new Error(
      `No SignWell template configured for this course (enrollmentId: ${enrollmentId}, course: ${courseName})`
    );
  }

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
    template_id: resolvedTemplateId,
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