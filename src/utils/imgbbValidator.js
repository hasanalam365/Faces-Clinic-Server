// utils/imgbbValidator.js
const ALLOWED_IMGBB_HOSTS = ["i.ibb.co", "ibb.co", "image.ibb.co"];

function isValidImgbbUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (!ALLOWED_IMGBB_HOSTS.includes(parsed.hostname)) return false;
    if (!parsed.pathname || parsed.pathname.length < 2) return false;
    return true;
  } catch {
    return false;
  }
}

module.exports = { isValidImgbbUrl };
