// controllers/gocardless.controller.js
//
// Subscription flow, step 5: Direct Debit via GoCardless's classic
// RedirectFlow API.
//   POST /gc/create-redirect-flow  -> send the student to GC's hosted page
//   POST /gc/complete-flow         -> exchange the completed flow for a mandate
//   POST /gc/create-subscription   -> schedule the monthly instalments
//
// The enrollmentId doubles as the GoCardless session_token everywhere (see
// utils/generateId.js), so nothing extra needs to be stored to complete the
// flow later.
const gocardless = require("../config/gocardless");
const { findRowByField, updateRowByField } = require("../services/sheetsDb");
const { sendSubscriptionActiveEmails } = require("../services/emailService");

const TAB = "SubscriptionEnrollments";
const CLIENT_URL = () => process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";

exports.createGoCardlessRedirectFlow = async (req, res) => {
  try {
    const enrollmentId = String(req.body?.enrollmentId || "").trim();
    if (!enrollmentId) return res.status(400).json({ message: "Missing enrollment ID." });

    const found = await findRowByField(TAB, "enrollmentId", enrollmentId);
    if (!found) return res.status(404).json({ message: "Enrollment not found." });

    const d = found.data;
    if (d.firstPaymentStatus !== "Paid") {
      return res.status(403).json({ message: "Please complete your first payment first." });
    }
    if (d.mandateId) {
      return res.status(409).json({ message: "Direct Debit is already set up." });
    }

    const nameParts = String(d.name || "").trim().split(/\s+/);
    const givenName = nameParts[0] || d.name || "Student";
    const familyName = nameParts.slice(1).join(" ") || givenName;

    const redirectFlow = await gocardless.redirectFlows.create({
      description: `${d.courseName} — Monthly Direct Debit`,
      session_token: enrollmentId,
      success_redirect_url: `${CLIENT_URL()}/subscription-continue?enrollmentId=${enrollmentId}`,
      prefilled_customer: {
        given_name: givenName,
        family_name: familyName,
        email: d.email,
      },
    });

    await updateRowByField(TAB, "enrollmentId", enrollmentId, {
      gcRedirectFlowId: redirectFlow.id,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({ redirectUrl: redirectFlow.redirect_url });
  } catch (err) {
    console.error("Create GoCardless redirect flow error:", err.response?.body || err.message);
    return res.status(500).json({ message: "Could not start Direct Debit setup. Please try again." });
  }
};

exports.completeGoCardlessFlow = async (req, res) => {
  try {
    const enrollmentId = String(req.body?.enrollmentId || "").trim();
    const redirectFlowId = String(req.body?.redirectFlowId || "").trim();
    if (!enrollmentId || !redirectFlowId) {
      return res.status(400).json({ message: "Missing enrollment ID or redirect flow ID." });
    }

    const found = await findRowByField(TAB, "enrollmentId", enrollmentId);
    if (!found) return res.status(404).json({ message: "Enrollment not found." });

    if (found.data.mandateId) {
      return res.status(200).json({ success: true, mandateId: found.data.mandateId, alreadyCompleted: true });
    }

    const completed = await gocardless.redirectFlows.complete(redirectFlowId, {
      session_token: enrollmentId,
    });

    const mandateId = completed.links.mandate;
    const gcCustomerId = completed.links.customer;

    await updateRowByField(TAB, "enrollmentId", enrollmentId, {
      mandateId,
      gcCustomerId,
      status: "Mandate Active — Pending Subscription",
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({ success: true, mandateId });
  } catch (err) {
    console.error("Complete GoCardless flow error:", err.response?.body || err.message);
    return res.status(500).json({ message: "Could not confirm Direct Debit setup. Please try again." });
  }
};

exports.createSubscription = async (req, res) => {
  try {
    const enrollmentId = String(req.body?.enrollmentId || "").trim();
    if (!enrollmentId) return res.status(400).json({ message: "Missing enrollment ID." });

    const found = await findRowByField(TAB, "enrollmentId", enrollmentId);
    if (!found) return res.status(404).json({ message: "Enrollment not found." });

    const d = found.data;
    if (!d.mandateId) {
      return res.status(403).json({ message: "Please complete Direct Debit setup first." });
    }
    if (d.subscriptionId) {
      return res.status(200).json({ success: true, subscriptionId: d.subscriptionId, alreadyCreated: true });
    }

    const monthlyAmountPence = Math.round(parseFloat(d.subscriptionAmount) * 100);
    const installments = Number(d.installments);
    if (!Number.isFinite(monthlyAmountPence) || monthlyAmountPence <= 0 || !installments) {
      console.error(
        "Invalid subscription amount/installments on row",
        enrollmentId,
        d.subscriptionAmount,
        d.installments
      );
      return res.status(500).json({ message: "Could not start Direct Debit. Please contact us." });
    }

    const subscription = await gocardless.subscriptions.create({
      amount: monthlyAmountPence,
      currency: (d.currency || "GBP").toUpperCase(),
      name: `${d.courseName} — Monthly Payment`,
      interval_unit: "monthly",
      count: installments,
      links: { mandate: d.mandateId },
    });

    await updateRowByField(TAB, "enrollmentId", enrollmentId, {
      subscriptionId: subscription.id,
      paymentStatus: "Active",
      status: "Direct Debit Active",
      updatedAt: new Date().toISOString(),
    });

    // Confirmation emails go out now — this is the last step of the flow.
    sendSubscriptionActiveEmails({
      name: d.name,
      email: d.email,
      phone: d.phone,
      courseName: d.courseName,
      firstPaymentAmount: d.firstPaymentAmount,
      monthlyAmount: d.subscriptionAmount,
      installments,
      mandateId: d.mandateId,
      subscriptionId: subscription.id,
    }).catch((e) => console.error("Subscription active email error:", e.message));

    return res.status(200).json({ success: true, subscriptionId: subscription.id });
  } catch (err) {
    console.error("Create GoCardless subscription error:", err.response?.body || err.message);
    return res.status(500).json({ message: "Could not start Direct Debit. Please try again." });
  }
};