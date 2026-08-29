const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser, userCan } = require("../middleware/permissions");
const { getHistory, getStudentHistory } = require("../services/history.service");
const { getStudents, getStudentById } = require("../services/students.service");

// GET /history
router.get("/history", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin", "manager")) return res.redirect("/");
  const entries = await getHistory();
  res.render("history", { entries, currentUser });
});

// GET /student_history/:id
router.get("/student_history/:id", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) return res.redirect("/");
  const studentId = parseInt(req.params.id);
  const entries = await getStudentHistory(studentId);
  const student = await getStudentById(studentId);
  const activeBranch = (req.cookies && req.cookies.active_branch) || "";
  res.render("student_history", { student, entries, currentUser, activeBranch });
});

// JSON API /api/student_history/:id
router.get("/api/student_history/:id", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) return res.status(401).json({ error: "Unauthorized" });
  const studentId = parseInt(req.params.id);
  const entries = await getStudentHistory(studentId);
  const student = await getStudentById(studentId);
  res.json({ student, entries });
});

module.exports = router;
