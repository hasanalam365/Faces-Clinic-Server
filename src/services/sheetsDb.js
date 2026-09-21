// services/sheetsDb.js
//
// A tiny "Sheets as a database" layer. Each tab's ROW 1 is the schema (header
// names) — insertRow/updateRow map field names to columns dynamically, so you
// never hand-count column letters.
//
// IMPORTANT: row 1 of each tab MUST exist with the exact field names used by
// the controllers — see SHEETS_SETUP.md for the header list per tab.
//
// Changes vs the previous version:
//  • valueInputOption is RAW (was USER_ENTERED). With USER_ENTERED, Sheets
//    (a) turns the text "true" into TRUE, so `=== "true"` checks failed,
//    (b) drops the leading 0 / "+" of phone numbers, and
//    (c) executes anything starting with "=" as a formula (a form field like
//        =IMPORTXML(...) would run). RAW stores exactly what we send.
//  • A field with no matching column header now logs a warning instead of
//    being dropped silently.

const { sheets, SPREADSHEET_ID } = require("../config/sheetsClient");

function colLetter(index) {
  let letter = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function warnUnknownFields(tabName, headers, obj) {
  const unknown = Object.keys(obj).filter((k) => !headers.includes(k));
  if (unknown.length) {
    console.warn(
      `⚠️ sheetsDb: tab "${tabName}" has no column for [${unknown.join(", ")}] — ` +
        `those values were NOT saved. Add the header(s) to row 1 (see SHEETS_SETUP.md).`
    );
  }
}

async function getHeaders(tabName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tabName}!1:1`,
  });
  const headers = (res.data.values && res.data.values[0]) || [];
  if (!headers.length) {
    throw new Error(
      `Sheet tab "${tabName}" has no header row (row 1). Add the field names as headers first — see SHEETS_SETUP.md.`
    );
  }
  return headers;
}

async function getAllRows(tabName) {
  const headers = await getHeaders(tabName);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tabName}!A2:${colLetter(headers.length - 1)}100000`,
  });
  const rows = res.data.values || [];
  return { headers, rows };
}

async function insertRow(tabName, rowObject) {
  const headers = await getHeaders(tabName);
  warnUnknownFields(tabName, headers, rowObject);
  const row = headers.map((h) => (rowObject[h] !== undefined && rowObject[h] !== null ? rowObject[h] : ""));
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tabName}!A:A`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
  return rowObject;
}

async function findRowByField(tabName, fieldName, value) {
  if (!value) return null;
  const { headers, rows } = await getAllRows(tabName);
  const colIndex = headers.indexOf(fieldName);
  if (colIndex === -1) {
    throw new Error(`Sheet tab "${tabName}" has no "${fieldName}" column in its header row.`);
  }
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][colIndex] || "") === String(value)) {
      const data = {};
      headers.forEach((h, idx) => (data[h] = rows[i][idx] || ""));
      return { rowNumber: i + 2, data }; // +2: header row + 1-indexed sheet rows
    }
  }
  return null;
}

async function updateRowByNumber(tabName, rowNumber, updatesObject) {
  const headers = await getHeaders(tabName);
  warnUnknownFields(tabName, headers, updatesObject);
  const range = `${tabName}!A${rowNumber}:${colLetter(headers.length - 1)}${rowNumber}`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  const currentRow = (res.data.values && res.data.values[0]) || [];

  const merged = headers.map((h, idx) => {
    if (updatesObject[h] !== undefined) return updatesObject[h];
    return currentRow[idx] !== undefined ? currentRow[idx] : "";
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [merged] },
  });
}

// Finds the row by fieldName === value, then merges updatesObject into it.
// Returns the row as it was BEFORE the update (or null if not found), so
// callers can check previous state (e.g. idempotency guards).
async function updateRowByField(tabName, fieldName, value, updatesObject) {
  const found = await findRowByField(tabName, fieldName, value);
  if (!found) return null;
  await updateRowByNumber(tabName, found.rowNumber, updatesObject);
  return found;
}

module.exports = {
  getHeaders,
  getAllRows,
  insertRow,
  findRowByField,
  updateRowByNumber,
  updateRowByField,
};