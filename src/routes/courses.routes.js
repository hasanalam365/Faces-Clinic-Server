const express = require("express");
const router = express.Router();
const controller = require("../controllers/courses.controller");

router.get("/courses", controller.listCourses);
router.get("/courses/:courseId", controller.getCourse);

module.exports = router;
