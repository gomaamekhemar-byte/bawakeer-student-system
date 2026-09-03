const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser, userHasPermission, userMatchesScope, userCan } = require("../middleware/permissions");
const { getStudents } = require("../services/students.service");
const { getBranchNames } = require("../services/branches.service");
const { getExternalSettings, getActiveBranches, isBranchMasterActive } = require("../services/settings.service");
const { INTERVIEW_RESULTS, FOLLOWUP_STATUSES, STUDENT_TYPES, PHASES, GRADES, TRACKS, NATIONALITIES, PHASE_STRUCTURE } = require("../utils/constants");

// 1. Build Demographic Matrix Grid (Auto-Hiding Zero Rows & Zero Branches)
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

        // CRITICAL REQUIREMENT 1: HIDE EMPTY ROWS WHERE COUNT IS 0
        if (rowTotal === 0) {
          return;
        }

        totalBoysGeneral += boysGeneral;
        totalBoysTahfeez += boysTahfeez;
        totalGirlsGeneral += girlsGeneral;
        totalGirlsTahfeez += girlsTahfeez;

        // Concise inline summary strings omitting 0 tracks
        const boysParts = [];
        if (boysGeneral > 0) boysParts.push(`عام: ${boysGeneral}`);
        if (boysTahfeez > 0) boysParts.push(`تحفيظ: ${boysTahfeez}`);
        const boysSummaryText = boysParts.length ? boysParts.join("، ") : "لا يوجد";

        const girlsParts = [];
        if (girlsGeneral > 0) girlsParts.push(`عام: ${girlsGeneral}`);
        if (girlsTahfeez > 0) girlsParts.push(`تحفيظ: ${girlsTahfeez}`);
        const girlsSummaryText = girlsParts.length ? girlsParts.join("، ") : "لا يوجد";

        const rowGeneral = boysGeneral + girlsGeneral;
        const rowTahfeez = boysTahfeez + girlsTahfeez;

        branchRows.push({
          phase: pName,
          gradeId: gItem.id,
          gradeName: gItem.name,
          boysGeneral,
          boysTahfeez,
          boysTotal,
          boysSummaryText,
          girlsGeneral,
          girlsTahfeez,
          girlsTotal,
          girlsSummaryText,
          generalTotal: rowGeneral,
          tahfeezTotal: rowTahfeez,
          rowTotal
        });
      });
    });

    const branchTotal = totalBoysGeneral + totalBoysTahfeez + totalGirlsGeneral + totalGirlsTahfeez;

    // Only include branch in the grid if it has at least one active grade with students
    if (branchRows.length > 0) {
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
          generalTotal: totalBoysGeneral + totalGirlsGeneral,
          tahfeezTotal: totalBoysTahfeez + totalGirlsTahfeez,
          branchTotal
        }
      });
    }
  });

  return grid;
}

// 2. Compute Dynamic Adaptive Filters based on actual active records
function computeAdaptiveFilters(baseStudents, currentFilters) {
  function poolExcluding(field) {
    return baseStudents.filter(s => {
      if (field !== 'branch' && currentFilters.branch && currentFilters.branch !== 'الكل' && s.branch !== currentFilters.branch) return false;
      if (field !== 'phase' && currentFilters.phase && currentFilters.phase !== 'الكل' && s.phase !== currentFilters.phase) return false;
      if (field !== 'grade' && currentFilters.grade && currentFilters.grade !== 'الكل' && s.grade !== currentFilters.grade) return false;
      if (field !== 'type' && currentFilters.type && currentFilters.type !== 'الكل' && s.student_type !== currentFilters.type) return false;
      if (field !== 'track' && currentFilters.track && currentFilters.track !== 'الكل' && (s.track || 'عام') !== currentFilters.track) return false;
      if (field !== 'source' && currentFilters.source && currentFilters.source !== 'الكل' && currentFilters.source !== 'جميع المصادر') {
        const isOnline = s.registration_source === 'رابط خارجي';
        if (currentFilters.source === 'الرابط الخارجي' || currentFilters.source === 'رابط خارجي') {
          if (!isOnline) return false;
        } else {
          if (isOnline) return false;
        }
      }
      return true;
    });
  }

  const branchPool = poolExcluding('branch');
  const phasePool = poolExcluding('phase');
  const gradePool = poolExcluding('grade');
  const typePool = poolExcluding('type');
  const trackPool = poolExcluding('track');
  const sourcePool = poolExcluding('source');

  const branches = [...new Set(branchPool.map(s => s.branch).filter(Boolean))];
  const phases = [...new Set(phasePool.map(s => s.phase).filter(Boolean))];
  const grades = [...new Set(gradePool.map(s => s.grade).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b)));
  const types = [...new Set(typePool.map(s => s.student_type).filter(Boolean))];
  const tracks = [...new Set(trackPool.map(s => s.track || 'عام').filter(Boolean))];

  const hasOnline = sourcePool.some(s => s.registration_source === 'رابط خارجي');
  const hasInternal = sourcePool.some(s => s.registration_source !== 'رابط خارجي');
  const sources = [];
  if (hasOnline) sources.push('الرابط الخارجي');
  if (hasInternal) sources.push('التسجيل الداخلي (المدرسة)');

  return {
    branches,
    phases,
    grades,
    types,
    tracks,
    sources
  };
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
  PHASES.forEach(p => {
    const c = students.filter(s => s.phase === p).length;
    if (c > 0) phaseStats[p] = c;
  });
  
  const gradeStats = {};
  GRADES.forEach(g => {
    const c = students.filter(s => s.grade === g).length;
    if (c > 0) gradeStats[g] = c;
  });
  
  const registrationStats = {};
  FOLLOWUP_STATUSES.forEach(st => {
    const c = students.filter(s => s.followup_status === st).length;
    if (c > 0) registrationStats[st] = c;
  });
  const unassignedFollowup = students.filter(s => !s.followup_status).length;
  if (unassignedFollowup > 0) registrationStats["غير محدد"] = unassignedFollowup;
  
  const acceptanceStats = {};
  INTERVIEW_RESULTS.forEach(r => {
    const c = students.filter(s => s.interview_result === r).length;
    if (c > 0) acceptanceStats[r] = c;
  });
  const notInterviewed = students.filter(s => !s.interview_result).length;
  if (notInterviewed > 0) acceptanceStats["لم يقابل"] = notInterviewed;
  
  const typeStats = {};
  STUDENT_TYPES.forEach(t => {
    const c = students.filter(s => s.student_type === t).length;
    if (c > 0) typeStats[t] = c;
  });
  
  const trackStats = {};
  TRACKS.forEach(t => {
    const c = students.filter(s => s.track === t).length;
    if (c > 0) trackStats[t] = c;
  });
  
  const nationalityStats = {};
  students.forEach(s => {
    const n = s.nationality || "غير محدد";
    nationalityStats[n] = (nationalityStats[n] || 0) + 1;
  });
  
  const branchStats = {};
  students.forEach(s => {
    const b = s.branch || "غير محدد";
    branchStats[b] = (branchStats[b] || 0) + 1;
  });

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

  let userAccessibleStudents = allStudents;

  if (isSingleBranchUser) {
    const assignedBranch = userBranches[0];
    if (req.query.branch && req.query.branch.trim() && req.query.branch.trim() !== assignedBranch) {
      return res.redirect("/analytics?msg=" + encodeURIComponent("عفواً، غير مصرح لك بالوصول لبيانات فرع آخر"));
    }
    selectedBranch = assignedBranch;
    userAccessibleStudents = allStudents.filter(s => s.branch === selectedBranch);

    if (userPhases.length && !userPhases.includes("الكل")) {
      userAccessibleStudents = userAccessibleStudents.filter(s => userPhases.includes(s.phase));
    }
  }

  // Compute Adaptive Filters on user-accessible data
  const availableFilters = computeAdaptiveFilters(userAccessibleStudents, {
    branch: selectedBranch,
    phase: selectedPhase,
    grade: selectedGrade,
    type: selectedType,
    track: selectedTrack,
    source: selectedSource
  });

  // Apply active filters to get the current dataset
  let students = userAccessibleStudents;

  if (selectedBranch && selectedBranch !== "الكل") {
    students = students.filter(s => s.branch === selectedBranch);
  }

  if (selectedPhase && selectedPhase !== "الكل") {
    students = students.filter(s => s.phase === selectedPhase);
  }

  if (selectedGrade && selectedGrade !== "الكل") {
    students = students.filter(s => s.grade === selectedGrade);
  }

  if (selectedType && selectedType !== "الكل") {
    students = students.filter(s => s.student_type === selectedType);
  }

  if (selectedTrack && selectedTrack !== "الكل") {
    students = students.filter(s => (s.track || "عام") === selectedTrack);
  }

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

  // Build Demographic Matrix Data Grid (Only populated rows/branches)
  const targetBranches = (selectedBranch && selectedBranch !== "الكل") ? [selectedBranch] : (availableFilters.branches.length ? availableFilters.branches : allBranches);
  const demographicMatrixGrid = buildDemographicMatrixGrid(userAccessibleStudents, targetBranches, selectedGrade);

  // Build Phase statistics breakdown for displayed branch(es) (Omit 0 counts)
  const detailedBranchPhaseStats = [];
  targetBranches.forEach(bName => {
    let branchStudents = userAccessibleStudents.filter(s => s.branch === bName);
    if (selectedType && selectedType !== "الكل") branchStudents = branchStudents.filter(s => s.student_type === selectedType);
    if (selectedTrack && selectedTrack !== "الكل") branchStudents = branchStudents.filter(s => (s.track || "عام") === selectedTrack);
    if (selectedGrade && selectedGrade !== "الكل") branchStudents = branchStudents.filter(s => s.grade === selectedGrade);
    if (selectedSource && selectedSource !== "الكل" && selectedSource !== "جميع المصادر") {
      const isOnline = selectedSource === "الرابط الخارجي" || selectedSource === "رابط خارجي" || selectedSource === "external";
      branchStudents = branchStudents.filter(s => isOnline ? (s.registration_source === "رابط خارجي") : (s.registration_source !== "رابط خارجي"));
    }

    if (branchStudents.length === 0) return; // Skip zero branches

    const phasesData = PHASES.map(pName => {
      const pStudents = branchStudents.filter(s => s.phase === pName);
      if (pStudents.length === 0) return null; // Skip zero phases
      return {
        phase: pName,
        total: pStudents.length,
        registered: pStudents.filter(s => s.followup_status === "تم التسجيل").length,
        accepted: pStudents.filter(s => s.interview_result === "مقبول").length,
        pending_interview: pStudents.filter(s => s.interview_result === "في انتظار المقابلة").length,
        waiting_registration: pStudents.filter(s => s.followup_status === "في انتظار التسجيل").length,
        rejected: pStudents.filter(s => s.interview_result === "غير مقبول").length,
      };
    }).filter(Boolean);

    if (phasesData.length > 0) {
      detailedBranchPhaseStats.push({
        branch: bName,
        total: branchStudents.length,
        registered: branchStudents.filter(s => s.followup_status === "تم التسجيل").length,
        accepted: branchStudents.filter(s => s.interview_result === "مقبول").length,
        phasesData,
      });
    }
  });

  // Support JSON API response
  if (req.query.format === "json" || req.headers["x-requested-with"] === "XMLHttpRequest") {
    return res.json({
      success: true,
      analytics: analyticsData,
      demographicMatrixGrid,
      detailedBranchPhaseStats,
      availableFilters,
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
    availableFilters,
    currentUser,
    selectedBranch,
    selectedPhase,
    selectedGrade,
    selectedType,
    selectedTrack,
    selectedSource,
    branches: availableFilters.branches,
    isFullBranchAccess,
    isSingleBranchUser,
    phases: availableFilters.phases,
    grades: availableFilters.grades,
    interview_results: INTERVIEW_RESULTS,
    followup_statuses: FOLLOWUP_STATUSES,
    student_types: availableFilters.types,
    tracks: availableFilters.tracks,
    nationalities: NATIONALITIES,
    phaseStructure: PHASE_STRUCTURE
  });
});

module.exports = router;
