// controllers/courses.controller.js
const courses = require("../config/courses");

const pounds = (pence) => (pence / 100).toFixed(2);

const toDisplay = (id, c) => ({
  id,
  name: c.name,
  currency: c.currency,
  fullPrice: pounds(c.fullPrice),
  depositAmount: pounds(c.depositAmount),
  remainingAfterDeposit: pounds(c.remainingAfterDeposit),
  subscription: {
    setupFee: pounds(c.subscription.setupFee), // one-off, via Stripe
    monthlyFee: pounds(c.subscription.monthlyFee), // ongoing, via GoCardless — no end date
  },
});

exports.listCourses = (req, res) => {
  const list = Object.entries(courses).map(([id, c]) => toDisplay(id, c));
  res.status(200).json(list);
};

exports.getCourse = (req, res) => {
  const { courseId } = req.params;
  const c = courses[courseId];
  if (!c) return res.status(404).json({ message: "Course not found." });
  res.status(200).json(toDisplay(courseId, c));
};