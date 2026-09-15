const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { handleStripeWebhook } = require("./controllers/payments.controller");

const app = express();

/* =======================
   GLOBAL CORS CONFIG
======================= */
const corsOptions = {
  origin: [
    "http://localhost:5173",
    process.env.CLIENT_URL,
  ].filter(Boolean),
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// 🔥 MUST BE FIRST
app.use(cors(corsOptions));

// 🔥 MUST HANDLE PREFLIGHT
app.options("*", cors(corsOptions));

/* =======================
   STRIPE WEBHOOK
   Must come BEFORE express.json(), because Stripe needs the raw,
   unparsed request body to verify the webhook signature.
======================= */
app.post(
  "/payments/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

/* =======================
   MIDDLEWARE
======================= */
app.use(express.json());

/* =======================
   ROUTES
======================= */
app.use("/", require("./routes/auth.routes"));
app.use("/", require("./routes/payments.routes"));
app.use("/", require("./routes/consultation.routes"));

/* =======================
   ROOT
======================= */
app.get("/", (req, res) => {
  res.send("Faces On Faces Server is Working");
});

module.exports = app;