// app.js
// Same as your previous app.js, plus ONE new line (marked "// NEW"):
// the subscription first-payment / status routes.
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const { handleStripeWebhook } = require("./controllers/payments.controller");
const { handleWebhook: handleGoCardlessWebhook } = require("./controllers/gocardless.webhook.controller");

const app = express();

/* =======================
   GLOBAL CORS CONFIG
======================= */
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://facesonfaces-academy.vercel.app",
    process.env.CLIENT_URL,
  ].filter(Boolean),
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* =======================
   RAW-BODY WEBHOOKS — MUST COME BEFORE express.json()
   Both Stripe and GoCardless verify a signature computed over the exact raw
   bytes of the request body — express.json() would parse (and therefore
   mutate) the body before the signature check runs, causing every webhook
   call to fail verification.
======================= */
app.post("/payments/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);
app.post("/gc/webhook", express.raw({ type: "application/json" }), handleGoCardlessWebhook);

/* =======================
   MIDDLEWARE
======================= */
app.use(express.json());

/* =======================
   RATE LIMITING (applied only to the payment/enrollment routes)
======================= */
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/* =======================
   ROUTES
======================= */
app.use("/", require("./routes/auth.routes"));
app.use("/", require("./routes/payments.routes")); // treatment deposits — unchanged
app.use("/", require("./routes/consultation.routes"));
app.use("/", require("./routes/callback.routes"));

// Course enrollment system (Full / Deposit / Subscription)
app.use("/", require("./routes/courses.routes"));
app.use("/", strictLimiter, require("./routes/enrollment.routes"));
app.use("/", strictLimiter, require("./routes/depositEnrollment.routes"));
app.use("/", strictLimiter, require("./routes/subscriptionEnrollment.routes"));
app.use("/", strictLimiter, require("./routes/identityVerification.routes"));
app.use("/", strictLimiter, require("./routes/gocardless.routes"));
app.use("/", require("./routes/subscriptionAgreement.routes")); // has its own pollingLimiter on the GET route
app.use("/", require("./routes/subscriptionPayment.routes")); // NEW — has its own limiters (status is polled)

/* =======================
   ROOT
======================= */
app.get("/", (req, res) => {
  res.send("Faces On Faces Server is Working");
});

/* =======================
   404 HANDLER
======================= */
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

/* =======================
   GLOBAL ERROR HANDLER
======================= */
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;