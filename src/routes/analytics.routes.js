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
  const rejected = students.filter(s => s.interview_result === "غير مقبول").length;
  const waiting = students.filter(s => s.followup_status === "في انتظار التسجيل").length;
  const not_interested = students.filter(s => s.followup_status === "لا يرغب في التسجيل").length;
  const pending_interview = students.filter(s => s.interview_result === "في انتظار المقابلة").length;
  const not_registered = students.filter(s => s.followup_status !== "تم التسجيل").length;

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

  // Siblings Analysis
  const phoneGroup = {};
  students.forEach(s => {
    const p1 = (s.phone || "").trim();
    const p2 = (s.mother_phone || "").trim();
    const key = p1 || p2;
    if (key) {
      if (!phoneGroup[key]) phoneGroup[key] = [];
      phoneGroup[key].push(s);
    }
  });

  let siblingFamiliesCount = 0;
  let siblingStudentsTotal = 0;
  const siblingFamiliesList = [];

  Object.entries(phoneGroup).forEach(([phone, list]) => {
    if (list.length > 1) {
      siblingFamiliesCount++;
      siblingStudentsTotal += list.length;
      siblingFamiliesList.push({
        phone,
        count: list.length,
        students: list.map(st => ({ id: st.id, name: st.name, branch: st.branch, phase: st.phase, grade: st.grade }))
      });
    }
  });

  const acceptanceRate = total > 0 ? Math.round((accepted / total) * 1000) / 10 : 0;
  const registrationRate = total > 0 ? Math.round((registered / total) * 1000) / 10 : 0;
  const conversionRate = accepted > 0 ? Math.round((registered / accepted) * 1000) / 10 : 0;

  return {
    branchLabel: branchLabel || "جميع الفروع",
    total, accepted, rejected, registered, waiting, not_interested,
    pending_interview, not_registered,
    acceptanceRate, registrationRate, conversionRate,
    phaseStats, gradeStats, registrationStats, acceptanceStats, typeStats, trackStats, nationalityStats, branchStats,
    siblingStats: { siblingFamiliesCount, siblingStudentsTotal, siblingFamiliesList }
  };
}

router.get("/analytics", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userHasPermission(currentUser, "view_analytics")) return res.redirect("/");
  
  const allBranches = await getBranchNames();
  const allStudents = await getStudents();

  // Extract user branch & phase permissions
  const userBranches = Array.isArray(currentUser.branches) ? currentUser.branches : (currentUser.branch ? [currentUser.branch] : []);
  const userPhases = Array.isArray(currentUser.phases) ? currentUser.phases : (currentUser.phase ? [currentUser.phase] : []);
  
  // Single branch user check: strictly non-admin with exactly 1 branch and not 'الكل'
  const isSingleBranchUser = (currentUser.role !== "admin") && (!userBranches.includes("الكل")) && (userBranches.length === 1);
  const isFullBranchAccess = !isSingleBranchUser;

  let selectedBranch = "الكل";
  let allowedBranches = allBranches;
  let students = allStudents;

    if (isSingleBranchUser) {
    // 1. Single-branch employee: LOCKED strictly to their assigned branch
    const assignedBranch = userBranches[0];
    
    // URL PROTECTION: If employee attempts to access a different branch in query
    if (req.query.branch && req.query.branch.trim() && req.query.branch.trim() !== assignedBranch) {
      return res.redirect("/analytics?msg=" + encodeURIComponent("عفواً، غير مصرح لك بالوصول لبيانات فرع آخر"));
    }

    selectedBranch = assignedBranch;
    allowedBranches = [selectedBranch];
    students = allStudents.filter(s => s.branch === selectedBranch);

    if (userPhases.length && !userPhases.includes("الكل")) {
      students = students.filter(s => userPhases.includes(s.phase));
    }
  } else {
    // 2. Admin or Multi-Branch / All-Branches User: Full interactive dropdown
    allowedBranches = allBranches;
    
    // Check if user specifically requested a branch filter in the query string
    if (req.query.branch && req.query.branch.trim()) {
      selectedBranch = req.query.branch.trim();
    } else {
      selectedBranch = "الكل"; // Default to All Branches
    }

    if (selectedBranch && selectedBranch !== "الكل") {
      students = allStudents.filter(s => s.branch === selectedBranch);
    } else {
      selectedBranch = "الكل";
      students = allStudents;
    }
  }

  const branchLabel = selectedBranch === "الكل" ? "جميع الفروع" : ("فرع " + selectedBranch);
  const analyticsData = buildAnalytics(students, branchLabel);

  // Build Phase statistics breakdown for displayed branch(es)
  const detailedBranchPhaseStats = [];
  const targetBranches = (selectedBranch && selectedBranch !== "الكل") ? [selectedBranch] : allowedBranches;

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
    branches: allowedBranches,
    isFullBranchAccess,
    isSingleBranchUser,
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
