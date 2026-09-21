// config/signwell.js
module.exports = {
  SIGNWELL_API_KEY: process.env.SIGNWELL_API_KEY,
  TEMPLATE_ID: process.env.SIGNWELL_TEMPLATE_ID,
  WEBHOOK_SECRET: process.env.SIGNWELL_AGREEMENT_WEBHOOK_SECRET,
  BASE_URL: "https://www.signwell.com/api/v1",
  TEST_MODE: process.env.NODE_ENV !== "production",
  SENDER_NAME: process.env.SIGNWELL_SENDER_NAME || "Faces On Faces Academy",
  SENDER_EMAIL: process.env.SIGNWELL_SENDER_EMAIL || "info@facesonfaces.com",
};
