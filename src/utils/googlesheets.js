const { google } = require("googleapis");

/**
 * Required .env vars:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_PRIVATE_KEY     (keep the \n as literal "\n" inside .env)
 *   GOOGLE_SPREADSHEET_ID
 *   GOOGLE_SHEET_NAME      (the tab name, e.g. "Consultations")
 *
 * Setup (one-time):
 *  1. Google Cloud Console -> create Service Account -> generate JSON key.
 *  2. Enable "Google Sheets API".
 *  3. Open the target Sheet -> Share -> add the service account's
 *     client_email as Editor.
 */

const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME;

/**
 * Appends one row to the configured sheet tab.
 * @param {Array<string>} row - values in column order
 */
async function appendRow(row) {
  if (!SPREADSHEET_ID) {
    throw new Error("GOOGLE_SPREADSHEET_ID is not set in .env");
  }
  if (!SHEET_NAME) {
    throw new Error("GOOGLE_SHEET_NAME is not set in .env");
  }

  return sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_NAME,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

module.exports = { appendRow };