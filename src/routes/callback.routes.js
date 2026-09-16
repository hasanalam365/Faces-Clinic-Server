const express = require("express");
const router = express.Router();
const { requestCallback } = require("../controllers/callback.controller");

// POST /callback/request
router.post("/callback/request", requestCallback);

module.exports = router;