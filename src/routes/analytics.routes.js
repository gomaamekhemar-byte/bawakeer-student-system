const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser, userHasPermission, userMatchesScope, userCan } = require("../middleware/permissions");
const { getStudents } = require("../services/students.service");
const { getBranchNames } = require("../services/branches.service");
const { INTERVIEW_RESULTS, FOLLOWUP_STATUSES, STUDENT_TYPES, PHASES, GRADES, TRACKS, NATIONALITIES } = require("../utils/constants");

function buildAnalytics(students, branchLabel) {
  const total = students.length;
  const accepted = students.filter(s => s.interview_result === "مقبول").length;
  const registered = students.filter(s => s.followup_status === "تم التسجيل").length;
  const phaseStats = {};
  PHASES.forEach(p => phaseStats[p] = students.filter(s => s.phase === p).length);
  const gradeStats = {};
  GRADES.forEach(g => gradeStats[g] = students.filter(s => s.grade === g).length);
  const registrationStats = {};
  FOLLOWUP_STATUSES.forEach(st => registrationStats[st] = students.filter(s => s.followup_status === st).length);
  registrationStats["غير محدد"] = students.filter(s => !s.followup_status).length;
  const acceptanceStats = {};
  INTERVIEW_RESULTS.forEach(r => acceptanceStats[r] = students.filter(s => s.interview_result === r).length);
  acceptanceStats["لم يقابل"] = students.filter(s => !s.interview_result).length;
  const typeStats = {};
  STUDENT_TYPES.forEach(t => typeStats[t] = students.filter(s => s.student_type === t).length);
  const trackStats = {};
  TRACKS.forEach(t => trackStats[t] = students.filter(s => s.track === t).length);
  const nationalityStats = {};
  students.forEach(s => { const n = s.nationality || "غير محدد"; nationalityStats[n] = (nationalityStats[n] || 0) + 1; });
  const branchStats = {};
  students.forEach(s => { const b = s.branch || "غير محدد"; branchStats[b] = (branchStats[b] || 0) + 1; });
  return {
    branchLabel: branchLabel || "جميع الفروع",
    total, accepted,
    rejected: students.filter(s => s.interview_result === "غير مقبول").length,
    registered,
    waiting: students.filter(s => s.followup_status === "في انتظار التسجيل").length,
    not_interested: students.filter(s => s.followup_status === "لا يرغب في التسجيل").length,
    pending_interview: students.filter(s => s.interview_result === "في انتظار المقابلة").length,
    not_registered: students.filter(s => s.followup_status !== "تم التسجيل").length,
    acceptanceRate: total > 0 ? Math.round(accepted / total * 1000) / 10 : 0,
    registrationRate: total > 0 ? Math.round(registered / total * 1000) / 10 : 0,
    conversionRate: accepted > 0 ? Math.round(registered / accepted * 1000) / 10 : 0,
    phaseStats, gradeStats, registrationStats, acceptanceStats, typeStats, trackStats, nationalityStats, branchStats,
  };
}

router.get("/analytics", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userHasPermission(currentUser, "view_analytics")) return res.redirect("/");
  const activeBranch = (req.cookies && req.cookies.active_branch) || "";
  let students = await getStudents();
  if (["manager", "employee"].includes(currentUser.role)) {
    students = students.filter(s => userMatchesScope(currentUser, s));
  } else if (activeBranch && activeBranch !== "الكل") {
    students = students.filter(s => s.branch === activeBranch);
  }
  const branchLabel = activeBranch === "الكل" ? "جميع الفروع" : activeBranch ? `فرع ${activeBranch}` : "جميع الفروع";
  const analyticsData = buildAnalytics(students, branchLabel);
  const branchAnalytics = {};
  if (!activeBranch || activeBranch === "الكل") {
    const allBranches = await getBranchNames();
    const allStudents = await getStudents();
    for (const b of allBranches) {
      branchAnalytics[b] = buildAnalytics(allStudents.filter(s => s.branch === b), `فرع ${b}`);
    }
  }
  const branches = await getBranchNames();
  res.render("analytics", {
    analytics: analyticsData, branchAnalytics, currentUser, activeBranch,
    phases: PHASES, grades: GRADES, interview_results: INTERVIEW_RESULTS,
    followup_statuses: FOLLOWUP_STATUSES, student_types: STUDENT_TYPES,
    tracks: TRACKS, nationalities: NATIONALITIES, branches,
  });
});

module.exports = router;
