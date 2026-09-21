// config/stripe.js — unchanged from your current site, included here only
// for completeness. No edits needed.
const Stripe = require("stripe");
module.exports = new Stripe(process.env.STRIPE_SECRET_KEY);
