const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser, userCan } = require("../middleware/permissions");
const { getHistory, getStudentHistory } = require("../services/history.service");
const { getStudents } = require("../services/students.service");

// GET /history
router.get("/history", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin")) return res.redirect("/");
  const entries = await getHistory();
  res.render("history", { entries, currentUser });
});

// GET /student_history/:id
router.get("/student_history/:id", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin", "manager")) return res.redirect("/");
  const studentId = parseInt(req.params.id);
  const entries = await getStudentHistory(studentId);
  const allStudents = await getStudents();
  const student = allStudents.find(s => s.id === studentId) || null;
  const activeBranch = (req.cookies && req.cookies.active_branch) || "";
  res.render("student_history", { student, entries, currentUser, activeBranch });
});

module.exports = router;
