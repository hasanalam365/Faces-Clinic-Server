// utils/generateId.js
// No MongoDB ObjectId here (Sheets is the store) — a UUID is the enrollmentId
// used everywhere: Sheets row key, Stripe metadata, GoCardless session_token,
// SignWell metadata.
const crypto = require("crypto");

function generateId() {
  return crypto.randomUUID();
}

module.exports = { generateId };
