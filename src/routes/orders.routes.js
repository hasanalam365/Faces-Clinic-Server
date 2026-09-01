const express = require("express");
const router = express.Router();
const controller = require("../controllers/orders.controller");
const verifyToken = require("../middlewares/verifyToken");
const verifyAdmin = require("../middlewares/verifyAdmin");

// CREATE ORDER (user)
router.post("/", verifyToken, controller.createOrder);

// GET USER ORDERS (logged-in user only)
router.get("/user", verifyToken, controller.getUserOrders);

// ADMIN ROUTES
router.get("/details/:id", verifyToken, verifyAdmin, controller.getSingleOrder);
router.get("/admin/recent", verifyToken, verifyAdmin, controller.getRecentOrders);
router.get("/", verifyToken, verifyAdmin, controller.getPendingOrders);
router.get("/confirmOrders", verifyToken, verifyAdmin, controller.getConfirmedOrders);

router.patch("/:id/confirm", verifyToken, verifyAdmin, controller.confirmOrder);
router.patch("/:id/status", verifyToken, verifyAdmin, controller.updateOrderStatus);
router.patch("/:id/cancel", verifyToken, verifyAdmin, controller.cancelOrder);
router.delete("/:id", verifyToken, verifyAdmin, controller.deleteOrder);

module.exports = router;
