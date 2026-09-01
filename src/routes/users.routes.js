const express = require("express");
const router = express.Router();
const controller = require("../controllers/users.controller");
const verifyToken = require("../middlewares/verifyToken");
const verifyAdmin = require("../middlewares/verifyAdmin");

// REGISTER / UPSERT USER
router.put("/:email", controller.createOrUpdateUser);

// ADMIN
router.get("/", verifyToken, verifyAdmin, controller.getAllUsers);
router.get("/admin/:email", verifyToken, controller.checkAdmin);

// PROFILE
router.get("/profile", controller.getUserProfile);
router.patch("/profile", controller.updateUserProfile);

// ROLE & DELETE
router.patch("/role/:id", verifyToken, verifyAdmin, controller.updateUserRole);
router.delete("/:id", verifyToken, verifyAdmin, controller.deleteUser);

module.exports = router;
