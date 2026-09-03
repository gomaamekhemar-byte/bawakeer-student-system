const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser, userHasPermission, userMatchesScope, userCan } = require("../middleware/permissions");
const { getStudents } = require("../services/students.service");
const { getBranchNames } = require("../services/branches.service");
const { getExternalSettings, getActiveBranches, isBranchMasterActive } = require("../services/settings.service");
const { INTERVIEW_RESULTS, FOLLOWUP_STATUSES, STUDENT_TYPES, PHASES, GRADES, TRACKS, NATIONALITIES, PHASE_STRUCTURE } = require("../utils/constants");

function buildDemographicMatrixGrid(students, branches, selectedGrade) {
  const grid = [];

  branches.forEach(bName => {
    const branchStudents = students.filter(s => s.branch === bName);
    const branchRows = [];

    let totalBoysGeneral = 0;
    let totalBoysTahfeez = 0;
    let totalGirlsGeneral = 0;
    let totalGirlsTahfeez = 0;

    Object.entries(PHASE_STRUCTURE).forEach(([pName, pInfo]) => {
      pInfo.grades.forEach(gItem => {
        if (selectedGrade && selectedGrade !== "الكل" && selectedGrade !== gItem.id) {
          return;
        }

        const gradeStudents = branchStudents.filter(s => s.phase === pName && s.grade === gItem.id);
        const boysGeneral = gradeStudents.filter(s => s.student_type === "بنين" && (s.track === "عام" || !s.track)).length;
        const boysTahfeez = gradeStudents.filter(s => s.student_type === "بنين" && s.track === "تحفيظ").length;
        const girlsGeneral = gradeStudents.filter(s => s.student_type === "بنات" && (s.track === "عام" || !s.track)).length;
        const girlsTahfeez = gradeStudents.filter(s => s.student_type === "بنات" && s.track === "تحفيظ").length;

        const boysTotal = boysGeneral + boysTahfeez;
        const girlsTotal = girlsGeneral + girlsTahfeez;
        const rowTotal = boysTotal + girlsTotal;

        totalBoysGeneral += boysGeneral;
        totalBoysTahfeez += boysTahfeez;
        totalGirlsGeneral += girlsGeneral;
        totalGirlsTahfeez += girlsTahfeez;

        branchRows.push({
          phase: pName,
          gradeId: gItem.id,
          gradeName: gItem.name,
          boysGeneral,
          boysTahfeez,
          boysTotal,
          girlsGeneral,
          girlsTahfeez,
          girlsTotal,
          rowTotal
        });
      });
    });

    grid.push({
      branch: bName,
      rows: branchRows,
      totals: {
        boysGeneral: totalBoysGeneral,
        boysTahfeez: totalBoysTahfeez,
        boysTotal: totalBoysGeneral + totalBoysTahfeez,
        girlsGeneral: totalGirlsGeneral,
        girlsTahfeez: totalGirlsTahfeez,
        girlsTotal: totalGirlsGeneral + totalGirlsTahfeez,
        branchTotal: totalBoysGeneral + totalBoysTahfeez + totalGirlsGeneral + totalGirlsTahfeez
      }
    });
  });

  return grid;
}

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

  // Demand tracking for unavailable grades (Waitlist)
  const waitlist_count = students.filter(s => s.followup_status === "صف غير متاح").length;
  const waitlist_rate = total > 0 ? Math.round((waitlist_count / total) * 1000) / 10 : 0;

  // Source Stats (Online vs Internal)
  const online_count = students.filter(s => s.registration_source === "رابط خارجي").length;
  const internal_count = students.filter(s => s.registration_source !== "رابط خارجي").length;
  const online_percent = total > 0 ? Math.round((online_count / total) * 1000) / 10 : 0;
  const internal_percent = total > 0 ? Math.round((internal_count / total) * 1000) / 10 : 0;

  const online_accepted = students.filter(s => s.registration_source === "رابط خارجي" && s.interview_result === "مقبول").length;
  const online_registered = students.filter(s => s.registration_source === "رابط خارجي" && s.followup_status === "تم التسجيل").length;
  const online_waiting = students.filter(s => s.registration_source === "رابط خارجي" && (s.followup_status === "في انتظار التسجيل" || s.followup_status === "في انتظار المقابلة")).length;

  const internal_accepted = students.filter(s => s.registration_source !== "رابط خارجي" && s.interview_result === "مقبول").length;
  const internal_registered = students.filter(s => s.registration_source !== "رابط خارجي" && s.followup_status === "تم التسجيل").length;
  const internal_waiting = students.filter(s => s.registration_source !== "رابط خارجي" && (s.followup_status === "في انتظار التسجيل" || s.followup_status === "في انتظار المقابلة")).length;

  const sourceStats = {
    online_count,
    internal_count,
    online_percent,
    internal_percent,
    online_accepted,
    online_registered,
    online_waiting,
    internal_accepted,
    internal_registered,
    internal_waiting
  };

  return {
    branchLabel: branchLabel || "جميع الفروع",
    total, accepted, rejected, registered, waiting, not_interested,
    pending_interview, not_registered,
    acceptanceRate, registrationRate, conversionRate, waitlist_count, waitlist_rate,
    phaseStats, gradeStats, registrationStats, acceptanceStats, typeStats, trackStats, nationalityStats, branchStats,
    siblingStats: { siblingFamiliesCount, siblingStudentsTotal, siblingFamiliesList },
    sourceStats
  };
}

router.get("/analytics", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userHasPermission(currentUser, "view_analytics")) return res.redirect("/");
  
  const allBranches = await getBranchNames();
  const allStudents = await getStudents();
  const settings = await getExternalSettings();

  // Active branches only (respect master switch)
  const activeBranchNames = getActiveBranches(allBranches, settings);

  // Extract user branch & phase permissions
  const userBranches = Array.isArray(currentUser.branches) ? currentUser.branches : (currentUser.branch ? [currentUser.branch] : []);
  const userPhases = Array.isArray(currentUser.phases) ? currentUser.phases : (currentUser.phase ? [currentUser.phase] : []);
  
  const isSingleBranchUser = (currentUser.role !== "admin") && (!userBranches.includes("الكل")) && (userBranches.length === 1);
  const isFullBranchAccess = !isSingleBranchUser;

  // Filter Query Params
  let selectedBranch = (req.query.branch || "الكل").trim();
  let selectedPhase = (req.query.phase || "الكل").trim();
  let selectedGrade = (req.query.grade || "الكل").trim();
  let selectedType = (req.query.type || req.query.student_type || "الكل").trim();
  let selectedTrack = (req.query.track || "الكل").trim();
  let selectedSource = (req.query.source || req.query.source_filter || "الكل").trim();

  let allowedBranches = activeBranchNames.length ? activeBranchNames : allBranches;
  let students = allStudents;

  if (isSingleBranchUser) {
    const assignedBranch = userBranches[0];
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
    if (selectedBranch && selectedBranch !== "الكل") {
      students = allStudents.filter(s => s.branch === selectedBranch);
    } else {
      selectedBranch = "الكل";
      students = allStudents;
    }
  }

  // 1. Phase Filter
  if (selectedPhase && selectedPhase !== "الكل") {
    students = students.filter(s => s.phase === selectedPhase);
  }

  // 2. Grade Filter
  if (selectedGrade && selectedGrade !== "الكل") {
    students = students.filter(s => s.grade === selectedGrade);
  }

  // 3. Student Type Filter (بنين / بنات)
  if (selectedType && selectedType !== "الكل") {
    students = students.filter(s => s.student_type === selectedType);
  }

  // 4. Track Filter (عام / تحفيظ)
  if (selectedTrack && selectedTrack !== "الكل") {
    students = students.filter(s => (s.track || "عام") === selectedTrack);
  }

  // 5. Registration Source Filter (الرابط الخارجي / المدرسة)
  if (selectedSource && selectedSource !== "الكل" && selectedSource !== "جميع المصادر") {
    if (selectedSource === "الرابط الخارجي" || selectedSource === "رابط خارجي" || selectedSource === "external") {
      students = students.filter(s => s.registration_source === "رابط خارجي");
    } else if (selectedSource === "التسجيل الداخلي (المدرسة)" || selectedSource === "تسجيل داخلي" || selectedSource === "التسجيل الداخلي" || selectedSource === "internal") {
      students = students.filter(s => s.registration_source !== "رابط خارجي");
    }
  }

  let branchLabel = selectedBranch === "الكل" ? "جميع الفروع" : ("فرع " + selectedBranch);
  const filterTags = [];
  if (selectedPhase !== "الكل") filterTags.push(selectedPhase);
  if (selectedGrade !== "الكل") filterTags.push("صف " + selectedGrade);
  if (selectedType !== "الكل") filterTags.push(selectedType);
  if (selectedTrack !== "الكل") filterTags.push(selectedTrack);
  if (selectedSource !== "الكل" && selectedSource !== "جميع المصادر") filterTags.push(selectedSource);
  if (filterTags.length > 0) {
    branchLabel += ` • [${filterTags.join(" | ")}]`;
  }

  const analyticsData = buildAnalytics(students, branchLabel);

  // Build Demographic Matrix Data Grid
  const targetBranches = (selectedBranch && selectedBranch !== "الكل") ? [selectedBranch] : allowedBranches;
  const demographicMatrixGrid = buildDemographicMatrixGrid(allStudents, targetBranches, selectedGrade);

  // Build Phase statistics breakdown for displayed branch(es)
  const detailedBranchPhaseStats = [];
  targetBranches.forEach(bName => {
    let branchStudents = allStudents.filter(s => s.branch === bName);
    if (selectedType && selectedType !== "الكل") branchStudents = branchStudents.filter(s => s.student_type === selectedType);
    if (selectedTrack && selectedTrack !== "الكل") branchStudents = branchStudents.filter(s => (s.track || "عام") === selectedTrack);
    if (selectedGrade && selectedGrade !== "الكل") branchStudents = branchStudents.filter(s => s.grade === selectedGrade);
    if (selectedSource && selectedSource !== "الكل" && selectedSource !== "جميع المصادر") {
      const isOnline = selectedSource === "الرابط الخارجي" || selectedSource === "رابط خارجي" || selectedSource === "external";
      branchStudents = branchStudents.filter(s => isOnline ? (s.registration_source === "رابط خارجي") : (s.registration_source !== "رابط خارجي"));
    }

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

  // Support JSON API response
  if (req.query.format === "json" || req.headers["x-requested-with"] === "XMLHttpRequest") {
    return res.json({
      success: true,
      analytics: analyticsData,
      demographicMatrixGrid,
      detailedBranchPhaseStats,
      selectedBranch,
      selectedPhase,
      selectedGrade,
      selectedType,
      selectedTrack,
      selectedSource
    });
  }

  res.render("analytics", {
    analytics: analyticsData,
    demographicMatrixGrid,
    detailedBranchPhaseStats,
    currentUser,
    selectedBranch,
    selectedPhase,
    selectedGrade,
    selectedType,
    selectedTrack,
    selectedSource,
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
    phaseStructure: PHASE_STRUCTURE
  });
});

module.exports = router;
