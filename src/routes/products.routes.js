const express = require("express");
const router = express.Router();
const controller = require("../controllers/products.controller");
const verifyToken = require("../middlewares/verifyToken");
const verifyAdmin = require("../middlewares/verifyAdmin");

router.get("/", controller.getAllProducts);
router.get("/:id", controller.getSingleProduct);
router.post("/", verifyToken, verifyAdmin, controller.addProduct);
router.delete("/:id", verifyToken, verifyAdmin, controller.deleteProduct);

module.exports = router;
