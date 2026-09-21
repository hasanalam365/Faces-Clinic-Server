// controllers/gocardless.webhook.controller.js
// NOTE: this route MUST receive the raw request body (Buffer), not
// JSON-parsed — see app.js, where it's mounted with express.raw() BEFORE
// express.json(). Signature verification fails otherwise.
const gocardlessModule = require("gocardless-nodejs");
const webhooks = gocardlessModule.webhooks || gocardlessModule.default?.webhooks;
const { updateRowByField } = require("../services/sheetsDb");

const TAB = "SubscriptionEnrollments";
const WEBHOOK_SECRET = process.env.GOCARDLESS_WEBHOOK_SECRET;

exports.handleWebhook = async (req, res) => {
  let events;
  try {
    events = webhooks.parse(req.body, WEBHOOK_SECRET, req.headers["webhook-signature"]);
  } catch (err) {
    if (err.name === "InvalidSignatureError") {
      console.warn("GoCardless webhook: invalid signature, rejecting.");
      return res.status(498).end();
    }
    console.error("GoCardless webhook parse error:", err);
    return res.status(400).end();
  }

  // Respond immediately — GoCardless just wants a 200 fast.
  res.status(200).send("OK");

  for (const event of events) {
    try {
      await processEvent(event);
    } catch (err) {
      console.error("Error processing GoCardless event", event.id, err);
    }
  }
};

async function processEvent(event) {
  switch (event.resource_type) {
    case "mandates": {
      if (event.action === "cancelled" || event.action === "failed") {
        await updateRowByField(TAB, "mandateId", event.links.mandate, {
          status: `Mandate ${event.action}`,
          updatedAt: new Date().toISOString(),
        });
      }
      break;
    }
    case "subscriptions": {
      if (event.action === "cancelled" || event.action === "finished") {
        await updateRowByField(TAB, "subscriptionId", event.links.subscription, {
          paymentStatus: event.action === "cancelled" ? "Cancelled" : "Finished",
          status: `Subscription ${event.action}`,
          updatedAt: new Date().toISOString(),
        });
      }
      break;
    }
    case "payments": {
      if (event.action === "failed") {
        await updateRowByField(TAB, "subscriptionId", event.links.subscription, {
          lastPaymentStatus: "Failed",
          updatedAt: new Date().toISOString(),
        });
      } else if (event.action === "confirmed") {
        await updateRowByField(TAB, "subscriptionId", event.links.subscription, {
          lastPaymentStatus: "Confirmed",
          updatedAt: new Date().toISOString(),
        });
      }
      break;
    }
    default:
      break;
  }
}