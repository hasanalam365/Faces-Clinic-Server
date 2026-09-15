const { google } = require("googleapis");

/**
 * Required .env vars:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_PRIVATE_KEY     (keep the \n as literal "\n" inside .env, wrapped in double quotes)
 *   GOOGLE_SPREADSHEET_ID
 *   GOOGLE_SHEET_NAME      (the tab name, e.g. "Consultations")
 */

const RAW_KEY = process.env.GOOGLE_PRIVATE_KEY || "";
const PRIVATE_KEY = RAW_KEY.replace(/\\n/g, "\n");

// ---- Startup sanity checks (fail loud instead of a vague Google API error) ----
if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
  throw new Error("❌ GOOGLE_SERVICE_ACCOUNT_EMAIL missing in environment variables");
}
if (!RAW_KEY) {
  throw new Error("❌ GOOGLE_PRIVATE_KEY missing in environment variables");
}
if (!PRIVATE_KEY.includes("BEGIN PRIVATE KEY")) {
  throw new Error(
    "❌ GOOGLE_PRIVATE_KEY looks malformed (no 'BEGIN PRIVATE KEY' found). " +
      "Check that it's wrapped in double quotes in .env and newlines are written as literal \\n"
  );
}
if (!process.env.GOOGLE_SPREADSHEET_ID) {
  throw new Error("❌ GOOGLE_SPREADSHEET_ID missing in environment variables");
}
if (!process.env.GOOGLE_SHEET_NAME) {
  throw new Error("❌ GOOGLE_SHEET_NAME missing in environment variables");
}

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME;

// Verify the credentials actually authenticate at startup (mirrors mailer.js's transporter.verify)
auth
  .authorize()
  .then(() => console.log("✅ Google Sheets auth ready"))
  .catch((err) =>
    console.error("❌ Google Sheets auth failed at startup:", err.message)
  );

/**
 * Appends one row to the configured sheet tab.
 * @param {Array<string>} row - values in column order
 */
async function appendRow(row) {
  return sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_NAME,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

module.exports = { appendRow };