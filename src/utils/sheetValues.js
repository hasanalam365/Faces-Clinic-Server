// utils/sheetValues.js
//
// Google Sheets hands every cell back as text, and can turn a typed "true"
// into "TRUE". Never compare against "true" directly — use this.
const isTrue = (v) => String(v ?? "").trim().toLowerCase() === "true";

module.exports = { isTrue };