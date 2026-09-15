const express = require("express");
const router = express.Router();
const { bookConsultation } = require("../controllers/consultation.controller");

// POST /consultation/book
router.post("/consultation/book", bookConsultation);

module.exports = router;