// config/sheetsClient.js
//
// Generic Google Sheets client used by services/sheetsDb.js.
//
// NOTE: this replaces the previous config/googleSheets.js. It is renamed
// because "googleSheets.js" and your existing "googlesheets.js" (used by the
// consultation / callback forms) differ only by letter case — on Windows and
// macOS those two names are the SAME file and overwrite each other.
// Leave your original googlesheets.js exactly as it is.

const { google } = require("googleapis");

const RAW_KEY = process.env.GOOGLE_PRIVATE_KEY || "";
const PRIVATE_KEY = RAW_KEY.replace(/\\n/g, "\n");

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

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

auth
  .authorize()
  .then(() => console.log("✅ Google Sheets auth ready"))
  .catch((err) => console.error("❌ Google Sheets auth failed at startup:", err.message));

module.exports = { sheets, SPREADSHEET_ID };