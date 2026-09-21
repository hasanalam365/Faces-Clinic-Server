const express = require("express");
const router = express.Router();
const controller = require("../controllers/gocardless.controller");

router.post("/gc/create-redirect-flow", controller.createGoCardlessRedirectFlow);
router.post("/gc/complete-flow", controller.completeGoCardlessFlow);
router.post("/gc/create-subscription", controller.createSubscription);

module.exports = router;
