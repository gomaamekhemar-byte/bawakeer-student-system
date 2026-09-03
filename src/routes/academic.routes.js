const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser, userCan, userHasPermission } = require("../middleware/permissions");
const { getAcademicYears, getActiveYear, createAcademicYear, activateYear, deleteYear } = require("../services/academic_years.service");
const { getBranches, createBranch, updateBranch, deleteBranch } = require("../services/branches.service");
const { getStudents } = require("../services/students.service");
const { addHistory } = require("../services/history.service");
const {
  getExternalSettings,
  saveExternalSettings,
  isBranchMasterActive,
  isPhaseActiveInBranch,
  isGradeAvailable,
  buildMatrixKey,
  buildPhaseKey
} = require("../services/settings.service");
const { PHASE_STRUCTURE, PHASES, STUDENT_TYPES } = require("../utils/constants");

// GET/POST /academic_years
router.get("/academic_years", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin") || !userHasPermission(currentUser, "manage_years")) return res.redirect("/");
  const years = await getAcademicYears();
  res.render("academic_years", { years, message: null, currentUser });
});

router.post("/academic_years", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin") || !userHasPermission(currentUser, "manage_years")) return res.redirect("/");
  const { action, year_name, year_id } = req.body;
  let message = null;
  if (action === "create") {
    if (!year_name || !year_name.trim()) { message = "يرجى إدخال اسم العام الدراسي"; }
    else {
      await createAcademicYear({ year_name: year_name.trim(), username: currentUser.username });
      await addHistory("academic_year_created", `تم إنشاء العام الدراسي ${year_name}`, currentUser.username);
      message = `تم إنشاء العام الدراسي ${year_name} بنجاح`;
    }
  } else if (action === "activate") {
    await activateYear(parseInt(year_id));
    await addHistory("academic_year_activated", `تم تفعيل عام دراسي`, currentUser.username);
    message = "تم تفعيل العام الدراسي";
  } else if (action === "delete") {
    await deleteYear(parseInt(year_id));
    await addHistory("academic_year_deleted", `تم حذف عام دراسي`, currentUser.username);
    message = "تم حذف العام الدراسي";
  }
  const years = await getAcademicYears();
  res.render("academic_years", { years, message, currentUser });
});

// GET /branches
router.get("/branches", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin") || !userHasPermission(currentUser, "manage_years")) return res.redirect("/");
  const branchesData = await getBranches(false);
  const settings = await getExternalSettings();
  res.render("branches", {
    branches: branchesData,
    settings,
    phaseStructure: PHASE_STRUCTURE,
    phases: PHASES,
    studentTypes: STUDENT_TYPES,
    isBranchMasterActive,
    isPhaseActiveInBranch,
    isGradeAvailable,
    buildMatrixKey,
    buildPhaseKey,
    message: req.query.msg || null,
    currentUser
  });
});

// POST /branches
router.post("/branches", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin") || !userHasPermission(currentUser, "manage_years")) return res.redirect("/");
  const { action, branch_id, name, location } = req.body;
  let message = null;

  const currentSettings = await getExternalSettings();
  const branch_master_switches = { ...(currentSettings.branch_master_switches || {}) };
  const branch_phase_switches = { ...(currentSettings.branch_phase_switches || {}) };
  const grade_matrix = { ...(currentSettings.grade_matrix || {}) };

  if (action === "create") {
    const cleanName = (name || "").trim();
    if (!cleanName) {
      message = "يرجى إدخال اسم الفرع";
    } else {
      const result = await createBranch({ name: cleanName, location: (location || "").trim(), username: currentUser.username });
      if (result) {
        // 1. Set branch master switch ON
        branch_master_switches[cleanName] = true;

        // 2. Set phase master switches & grade matrix from wizard
        Object.entries(PHASE_STRUCTURE).forEach(([pName, pInfo]) => {
          const phaseKey = buildPhaseKey(cleanName, pName);
          const phaseEnabled = req.body[`create_phase_${pName}`] === "1";
          branch_phase_switches[phaseKey] = phaseEnabled;

          STUDENT_TYPES.forEach(st => {
            pInfo.grades.forEach(gItem => {
              ['عام', 'تحفيظ'].forEach(tName => {
                const k = buildMatrixKey(cleanName, st, pName, gItem.id, tName);
                const fieldName = `create_matrix_${st}_${pName}_${gItem.id}_${tName}`;
                // If phase is enabled and checkbox is checked, set true
                const isChecked = req.body[fieldName] === "1";
                grade_matrix[k] = phaseEnabled && isChecked;
              });
            });
          });
        });

        await saveExternalSettings({
          branch_master_switches,
          branch_phase_switches,
          grade_matrix
        }, currentUser.username);

        await addHistory("branch_created", `تم إنشاء الفرع ${cleanName} بالهيكل الأكاديمي المعتمد`, currentUser.username);
        message = `تم إنشاء الفرع ${cleanName} وبناء هيكله الأكاديمي بنجاح ✅`;
      } else {
        message = `الفرع ${cleanName} موجود مسبقاً`;
      }
    }
  } else if (action === "edit_structure") {
    // Post-creation full structure save
    const targetBranch = (req.body.target_branch_name || "").trim();
    if (targetBranch) {
      Object.entries(PHASE_STRUCTURE).forEach(([pName, pInfo]) => {
        const phaseKey = buildPhaseKey(targetBranch, pName);
        const phaseEnabled = req.body[`edit_phase_${targetBranch}_${pName}`] === "1";
        branch_phase_switches[phaseKey] = phaseEnabled;

        STUDENT_TYPES.forEach(st => {
          pInfo.grades.forEach(gItem => {
            ['عام', 'تحفيظ'].forEach(tName => {
              const k = buildMatrixKey(targetBranch, st, pName, gItem.id, tName);
              const fieldName = `edit_matrix_${k}`;
              grade_matrix[k] = req.body[fieldName] === "1";
            });
          });
        });
      });

      await saveExternalSettings({
        branch_phase_switches,
        grade_matrix
      }, currentUser.username);

      await addHistory("branch_structure_updated", `تم تحديث الهيكل الأكاديمي لفرع ${targetBranch}`, currentUser.username);
      message = `تم حفظ الهيكل الأكاديمي لفرع ${targetBranch} بنجاح ✅`;
    }
  } else if (action === "edit") {
    await updateBranch(parseInt(branch_id), { name: (name || "").trim(), location: (location || "").trim() });
    await addHistory("branch_updated", `تم تعديل بيانات الفرع ${name}`, currentUser.username);
    message = "تم تحديث بيانات الفرع";
  } else if (action === "toggle_active") {
    const branches = await getBranches(false);
    const branch = branches.find(b => String(b.id) === String(branch_id));
    if (branch) {
      const newActiveState = !branch.is_active;
      await updateBranch(parseInt(branch_id), { is_active: newActiveState });
      branch_master_switches[branch.name] = newActiveState;
      await saveExternalSettings({ branch_master_switches }, currentUser.username);
      message = `تم ${newActiveState ? 'تفعيل' : 'تعطيل'} الفرع`;
    }
  } else if (action === "delete") {
    const allStudents = await getStudents();
    const branches = await getBranches(false);
    const branch = branches.find(b => String(b.id) === String(branch_id));
    const inBranch = branch ? allStudents.filter(s => s.branch === branch.name).length : 0;
    if (inBranch > 0) {
      message = `لا يمكن حذف الفرع لوجود ${inBranch} طالب مسجل فيه مسبقاً (حماية البيانات التاريخية)`;
    } else {
      await deleteBranch(parseInt(branch_id));
      await addHistory("branch_deleted", `تم حذف فرع`, currentUser.username);
      message = "تم حذف الفرع";
    }
  }

  const branchesData = await getBranches(false);
  const settings = await getExternalSettings();
  res.render("branches", {
    branches: branchesData,
    settings,
    phaseStructure: PHASE_STRUCTURE,
    phases: PHASES,
    studentTypes: STUDENT_TYPES,
    isBranchMasterActive,
    isPhaseActiveInBranch,
    isGradeAvailable,
    buildMatrixKey,
    buildPhaseKey,
    message,
    currentUser
  });
});

// POST /api/branches/structure/toggle - Instant AJAX toggle for branch structure
router.post("/api/branches/structure/toggle", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || currentUser.role !== "admin") {
    return res.status(403).json({ success: false, error: "غير مصرح" });
  }

  const { type, branch, phase, key, enabled } = req.body;
  const currentSettings = await getExternalSettings();

  if (type === "phase_master" && branch && phase) {
    // 1. Toggle Phase Master Switch
    const branch_phase_switches = { ...(currentSettings.branch_phase_switches || {}) };
    const phaseKey = buildPhaseKey(branch, phase);
    branch_phase_switches[phaseKey] = !!enabled;

    await saveExternalSettings({ branch_phase_switches }, currentUser.username);
    return res.json({
      success: true,
      type: "phase_master",
      branch,
      phase,
      enabled: !!enabled
    });
  }

  if (type === "grade_track" && key) {
    // 2. Toggle Individual Grade/Track Switch
    const grade_matrix = { ...(currentSettings.grade_matrix || {}) };
    grade_matrix[key] = !!enabled;

    await saveExternalSettings({ grade_matrix }, currentUser.username);
    return res.json({
      success: true,
      type: "grade_track",
      key,
      enabled: !!enabled
    });
  }

  if (type === "branch_master" && branch) {
    // 3. Toggle Branch Master Switch
    const branch_master_switches = { ...(currentSettings.branch_master_switches || {}) };
    branch_master_switches[branch] = !!enabled;

    await saveExternalSettings({ branch_master_switches }, currentUser.username);
    return res.json({
      success: true,
      type: "branch_master",
      branch,
      enabled: !!enabled
    });
  }

  return res.status(400).json({ success: false, error: "طلب غير صالح" });
});

module.exports = router;
