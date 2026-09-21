// controllers/subscriptionAgreement.controller.js
// Step 2: poll/check signing status, and the SignWell webhook. The webhook
// NEVER trusts the payload alone — it re-queries SignWell's API for the
// document's live status before marking anything signed.
const { findRowByField, updateRowByField } = require("../services/sheetsDb");
const signwellService = require("../services/signwellService");
const { isTrue } = require("../utils/sheetValues");

const TAB = "SubscriptionEnrollments";
const WEBHOOK_SECRET = process.env.SIGNWELL_AGREEMENT_WEBHOOK_SECRET;

exports.checkAgreementStatus = async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const found = await findRowByField(TAB, "enrollmentId", enrollmentId);
    if (!found) return res.status(404).json({ signed: false });

    if (isTrue(found.data.agreementSigned)) {
      return res.status(200).json({ signed: true });
    }

    if (found.data.signwellDocumentId) {
      try {
        const liveDoc = await signwellService.getDocumentStatus(found.data.signwellDocumentId);
        const isCompleted = liveDoc?.status === "Completed" || !!liveDoc?.completed_at;

        if (isCompleted) {
          await updateRowByField(TAB, "enrollmentId", enrollmentId, {
            agreementSigned: "true",
            status: "Signed — Pending Identity Verification",
            updatedAt: new Date().toISOString(),
          });
          return res.status(200).json({ signed: true });
        }
      } catch (apiErr) {
        console.error("SignWell API error:", apiErr.message);
      }

      let signingUrl = null;
      try {
        signingUrl = await signwellService.getEmbeddedSigningUrl(found.data.signwellDocumentId, found.data.email);
      } catch (e) {
        console.error("getEmbeddedSigningUrl error:", e.message);
      }

      return res.status(200).json({ signed: false, signingUrl });
    }

    return res.status(200).json({ signed: false });
  } catch (err) {
    console.error("Check agreement status error:", err);
    return res.status(500).json({ signed: false });
  }
};

exports.handleSignWellWebhook = async (req, res) => {
  try {
    const { secret } = req.params;
    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return res.status(404).send("Not found");
    }

    const event = req.body;
    const eventType = event?.event_type || event?.event?.event_type;

    const completedEvents = ["document_completed", "document.completed"];
    if (!completedEvents.includes(eventType)) {
      return res.status(200).send("Ignored");
    }

    const documentId = event?.data?.object?.id || event?.document_id || event?.data?.id;
    const metadataEnrollmentId =
      event?.data?.object?.metadata?.enrollmentId || event?.metadata?.enrollmentId;

    if (!documentId) {
      console.error("SignWell webhook missing document id", event);
      return res.status(400).send("Missing document id");
    }

    // ⚠️ Re-verify with SignWell's API directly — never trust the webhook
    // payload's "completed" claim on its own.
    const liveDoc = await signwellService.getDocumentStatus(documentId);
    const isActuallyCompleted = liveDoc?.status === "Completed" || !!liveDoc?.completed_at;

    if (!isActuallyCompleted) {
      console.warn("Webhook said completed but live status disagrees:", documentId);
      return res.status(200).send("Not confirmed yet");
    }

    const idField = metadataEnrollmentId ? "enrollmentId" : "signwellDocumentId";
    const idValue = metadataEnrollmentId || documentId;

    const found = await updateRowByField(TAB, idField, idValue, {
      agreementSigned: "true",
      status: "Signed — Pending Identity Verification",
      updatedAt: new Date().toISOString(),
    });

    console.log("SignWell webhook: enrollment updated:", found ? found.data.enrollmentId : "not found");
    return res.status(200).send("OK");
  } catch (err) {
    console.error("SignWell webhook error:", err.response?.data || err.message);
    return res.status(500).send("Error");
  }
};