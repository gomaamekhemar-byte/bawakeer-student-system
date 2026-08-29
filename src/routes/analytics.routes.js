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
  
  const branches = await getBranchNames();
  const allStudents = await getStudents();

  // Allow dynamic branch filter from query params
  const selectedBranch = req.query.branch || (req.cookies && req.cookies.active_branch) || "";
  
  let students = allStudents;
  if (["manager", "employee"].includes(currentUser.role)) {
    students = students.filter(s => userMatchesScope(currentUser, s));
  } else if (selectedBranch && selectedBranch !== "الكل") {
    students = students.filter(s => s.branch === selectedBranch);
  }

  const branchLabel = selectedBranch === "الكل" ? "جميع الفروع" : selectedBranch ? `فرع ${selectedBranch}` : "جميع الفروع";
  const analyticsData = buildAnalytics(students, branchLabel);

  // Compute detailed Branch + Phase breakdown
  const detailedBranchPhaseStats = [];
  const targetBranches = (selectedBranch && selectedBranch !== "الكل") ? [selectedBranch] : branches;

  targetBranches.forEach(bName => {
    const branchStudents = allStudents.filter(s => s.branch === bName);
    const phasesData = PHASES.map(pName => {
      const pStudents = branchStudents.filter(s => s.phase === pName);
      return {
        phase: pName,
        total: pStudents.length,
        registered: pStudents.filter(s => s.followup_status === "تم التسجيل").length,
        accepted: pStudents.filter(s => s.interview_result === "مقبول").length,
        pending_interview: pStudents.filter(s => s.interview_result === "في انتظار المقابلة").length,
        waiting_registration: pStudents.filter(s => s.followup_status === "في انتظار التسجيل").length,
        rejected: pStudents.filter(s => s.interview_result === "غير مقبول").length,
      };
    });

    detailedBranchPhaseStats.push({
      branch: bName,
      total: branchStudents.length,
      registered: branchStudents.filter(s => s.followup_status === "تم التسجيل").length,
      accepted: branchStudents.filter(s => s.interview_result === "مقبول").length,
      phasesData,
    });
  });

  res.render("analytics", {
    analytics: analyticsData,
    currentUser,
    selectedBranch,
    branches,
    phases: PHASES,
    grades: GRADES,
    interview_results: INTERVIEW_RESULTS,
    followup_statuses: FOLLOWUP_STATUSES,
    student_types: STUDENT_TYPES,
    tracks: TRACKS,
    nationalities: NATIONALITIES,
    detailedBranchPhaseStats,
  });
});

module.exports = router;
