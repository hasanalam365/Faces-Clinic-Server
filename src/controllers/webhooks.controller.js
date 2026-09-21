// controllers/webhooks.controller.js
//
// GoCardless + SignWell webhooks. Both need the RAW request body:
//   - GoCardless HMACs the exact bytes it sent (Webhook-Signature header)
//   - SignWell we parse ourselves after verifying event.hash
// So both are mounted with express.raw() in app.js, before express.json().
//
// Both endpoints acknowledge immediately and process asynchronously —
// GoCardless retries anything that doesn't answer quickly, which would
// otherwise double-charge state transitions.

const gc = require("../services/gocardless.service");
const signwell = require("../services/signwell.service");
const academy = require("./academypayments.controller");

/* ==================================================================== *
 * GoCardless — POST /webhooks/gocardless
 * ==================================================================== */

exports.handleGoCardlessWebhook = (req, res) => {
  const raw = req.body; // Buffer
  const signature = req.headers["webhook-signature"];

  try {
    if (!gc.verifyWebhook(raw, signature)) {
      console.error("GoCardless webhook signature invalid");
      return res.status(498).send("Invalid signature");
    }
  } catch (err) {
    console.error("GoCardless webhook verify error:", err.message);
    return res.status(500).send("Verify error");
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).send("Bad JSON");
  }

  res.status(200).send("OK");

  processGoCardlessEvents(payload.events || []).catch((err) =>
    console.error("GoCardless webhook processing error:", err)
  );
};

async function processGoCardlessEvents(events) {
  for (const event of events) {
    const { resource_type: type, action, links = {}, metadata = {} } = event;

    try {
      // ---- Mandate authorised -> schedule the instalments ----
      if (type === "billing_requests" && action === "fulfilled") {
        const brId = links.billing_request;
        const details = await gc.getMandateFromBillingRequest(brId);
        await academy.handleMandateReady({
          billingRequestId: brId,
          mandateId: details.mandateId,
          customerId: details.customerId,
          enrolmentId: details.enrolmentId,
        });
        continue;
      }

      // Fallback: some accounts see mandates.created/active before the
      // billing_request event. handleMandateReady is idempotent.
      if (type === "mandates" && (action === "created" || action === "active")) {
        if (links.billing_request) {
          const details = await gc.getMandateFromBillingRequest(links.billing_request);
          await academy.handleMandateReady({
            billingRequestId: links.billing_request,
            mandateId: links.mandate || details.mandateId,
            customerId: details.customerId,
            enrolmentId: details.enrolmentId,
          });
        }
        continue;
      }

      // ---- Monthly instalments ----
      if (type === "payments" && (action === "confirmed" || action === "paid_out")) {
        if (action === "paid_out") continue; // avoid counting the same payment twice
        await academy.handleInstallmentPaid({
          subscriptionId: links.subscription,
          enrolmentId: metadata.enrolment_id,
          amountPence: event.details?.amount,
        });
        continue;
      }

      if (type === "payments" && (action === "failed" || action === "charged_back")) {
        await academy.handleInstallmentFailed({
          subscriptionId: links.subscription,
          enrolmentId: metadata.enrolment_id,
          note: `Payment ${action} (${event.details?.description || event.details?.cause || ""}) @ ${
            event.created_at || new Date().toISOString()
          }`,
        });
        continue;
      }

      // ---- Cancellations / completion ----
      if (type === "subscriptions" && (action === "cancelled" || action === "finished")) {
        if (action === "cancelled") {
          await academy.handleSubscriptionCancelled({
            subscriptionId: links.subscription,
            note: `Subscription cancelled @ ${event.created_at || new Date().toISOString()}`,
          });
        }
        continue;
      }

      if (type === "mandates" && (action === "cancelled" || action === "failed" || action === "expired")) {
        await academy.handleSubscriptionCancelled({
          mandateId: links.mandate,
          note: `Mandate ${action} @ ${event.created_at || new Date().toISOString()}`,
        });
        continue;
      }
    } catch (err) {
      console.error(`GoCardless event ${type}.${action} failed:`, err.message);
    }
  }
}

/* ==================================================================== *
 * SignWell — POST /webhooks/signwell
 * ==================================================================== */

exports.handleSignWellWebhook = (req, res) => {
  let payload;
  try {
    payload = JSON.parse(
      Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body)
    );
  } catch {
    return res.status(400).send("Bad JSON");
  }

  const event = payload.event || {};

  if (!signwell.verifyEvent(event)) {
    console.error("SignWell webhook hash invalid");
    return res.status(401).send("Invalid hash");
  }

  res.status(200).send("OK");

  academy
    .handleAgreementEvent(event.type, payload.data?.object || payload.data || {})
    .catch((err) => console.error("SignWell webhook processing error:", err));
};