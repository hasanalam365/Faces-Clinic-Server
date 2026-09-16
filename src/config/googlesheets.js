const { google } = require("googleapis");

/**
 * Required .env vars:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_PRIVATE_KEY     (keep the \n as literal "\n" inside .env, wrapped in double quotes)
 *   GOOGLE_SPREADSHEET_ID
 *   GOOGLE_SHEET_NAME      (tab name for consultation bookings, e.g. "Consultations")
 *   GOOGLE_SHEET_NAME2     (tab name for callback requests, e.g. "RequestCallBack")
 *
 * Both tabs live in the same spreadsheet (GOOGLE_SPREADSHEET_ID) — only the
 * tab/range name differs, so appendRow() takes the sheet name as a second
 * argument instead of hardcoding it.
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
if (!process.env.GOOGLE_SHEET_NAME2) {
  throw new Error("❌ GOOGLE_SHEET_NAME2 missing in environment variables");
}

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

// Tab names, keyed so callers can pass a short key instead of the raw env var.
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME; // Consultations
const SHEET_NAME2 = process.env.GOOGLE_SHEET_NAME2; // RequestCallBack

// Verify the credentials actually authenticate at startup (mirrors mailer.js's transporter.verify)
auth
  .authorize()
  .then(() => console.log("✅ Google Sheets auth ready"))
  .catch((err) =>
    console.error("❌ Google Sheets auth failed at startup:", err.message)
  );

/**
 * Appends one row to a sheet tab.
 * @param {Array<string>} row - values in column order
 * @param {string} [sheetName] - the tab/range to append to. Defaults to
 *   GOOGLE_SHEET_NAME (Consultations) so existing callers don't need to change.
 *   Pass SHEET_NAME2 (or any other tab name) to write elsewhere, e.g.:
 *     appendRow(row, SHEET_NAME2)
 */
async function appendRow(row, sheetName = SHEET_NAME) {
  return sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

module.exports = { appendRow, SHEET_NAME, SHEET_NAME2 };