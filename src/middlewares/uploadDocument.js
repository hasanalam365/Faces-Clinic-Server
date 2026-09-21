// middlewares/uploadDocument.js
const multer = require("multer");

// Images only — the documents are hosted on ImgBB, which doesn't accept PDFs.
const ALLOWED_MIMETYPES = ["image/jpeg", "image/jpg", "image/png"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
    return cb(new Error("Invalid file type. Only JPG and PNG images are allowed."), false);
  }
  cb(null, true);
};

const upload = multer({ storage, limits: { fileSize: MAX_SIZE_BYTES }, fileFilter });

const uploadDocumentFields = upload.fields([
  { name: "addressProofFile", maxCount: 1 },
  { name: "identityFrontFile", maxCount: 1 },
  { name: "identityBackFile", maxCount: 1 },
]);

module.exports = (req, res, next) => {
  uploadDocumentFields(req, res, (err) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File too large (max 10MB)" });
    }
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};