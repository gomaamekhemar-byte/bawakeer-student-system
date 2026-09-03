const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser } = require("../middleware/permissions");
const {
  getExternalSettings,
  saveExternalSettings,
  isGradeAvailable,
  getAvailableHierarchy,
  buildMatrixKey
} = require("../services/settings.service");
const { getBranches } = require("../services/branches.service");
const { addHistory } = require("../services/history.service");
const { PHASE_STRUCTURE, PHASES, STUDENT_TYPES } = require("../utils/constants");

// GET /external_settings - Exclusive to Admin (General Manager)
router.get("/external_settings", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || currentUser.role !== "admin") {
    return res.redirect("/");
  }

  const settings = await getExternalSettings();
  const branches = await getBranches(false);

  res.render("external_settings", {
    currentUser,
    settings,
    branches,
    phaseStructure: PHASE_STRUCTURE,
    phases: PHASES,
    studentTypes: STUDENT_TYPES,
    isGradeAvailable,
    buildMatrixKey,
    message: req.query.msg || null
  });
});

// POST /external_settings - Update portal configuration, branch WhatsApp numbers & Grade Matrix
router.post("/external_settings", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || currentUser.role !== "admin") {
    return res.redirect("/");
  }

  const branches = await getBranches(false);
  const currentSettings = await getExternalSettings();

  const is_portal_open = req.body.is_portal_open === "1";
  const portal_announcement = (req.body.portal_announcement || "").trim();
  const portal_closed_message = (req.body.portal_closed_message || "").trim();
  const whatsapp_template = (req.body.whatsapp_template || "").trim();
  const show_mother_phone = req.body.show_mother_phone === "1";
  const show_nationality = req.body.show_nationality === "1";
  const show_neighborhood = req.body.show_neighborhood === "1";
  const show_track = req.body.show_track === "1";
  const show_notes = req.body.show_notes === "1";

  // 1. Build branch_phones map keyed by branch ID and branch Name
  const branch_phones = {};
  branches.forEach(b => {
    const val = (req.body[`branch_phone_${b.id}`] || req.body[`branch_phone_${b.name}`] || "").trim();
    if (val) {
      branch_phones[String(b.id)] = val;
      branch_phones[b.name] = val;
    }
  });

  // 2. Process Dynamic Grade Matrix toggles
  // If matrix form was submitted, reconstruct matrix for all known branch combinations
  const grade_matrix = { ...(currentSettings.grade_matrix || {}) };

  if (req.body.matrix_form_submitted === "1") {
    branches.forEach(b => {
      STUDENT_TYPES.forEach(st => {
        Object.entries(PHASE_STRUCTURE).forEach(([pName, pInfo]) => {
          pInfo.grades.forEach(gItem => {
            pInfo.tracks.forEach(tName => {
              const key = buildMatrixKey(b.name, st, pName, gItem.id, tName);
              const fieldName = `matrix_${key}`;
              // If checkbox was checked, it will be in req.body as '1'
              grade_matrix[key] = req.body[fieldName] === "1";
            });
          });
        });
      });
    });
  }

  const updatedConfig = {
    is_portal_open,
    portal_announcement,
    portal_closed_message,
    whatsapp_template,
    show_mother_phone,
    show_nationality,
    show_neighborhood,
    show_track,
    show_notes,
    branch_phones,
    grade_matrix
  };

  await saveExternalSettings(updatedConfig, currentUser.username);
  await addHistory("settings_updated", "تم تحديث إعدادات بوابة التسجيل ومصفوفة الفصول والمسارات", currentUser.username);

  const settings = await getExternalSettings();
  res.render("external_settings", {
    currentUser,
    settings,
    branches,
    phaseStructure: PHASE_STRUCTURE,
    phases: PHASES,
    studentTypes: STUDENT_TYPES,
    isGradeAvailable,
    buildMatrixKey,
    message: "تم حفظ وتطبيق إعدادات التسجيل ومصفوفة الفصول والمسارات بنجاح ✅"
  });
});

// POST /api/matrix/toggle - AJAX Instant Matrix Toggle
router.post("/api/matrix/toggle", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || currentUser.role !== "admin") {
    return res.status(403).json({ success: false, error: "غير مصرح" });
  }

  const { key, enabled } = req.body;
  if (!key) {
    return res.status(400).json({ success: false, error: "المفتاح مطلوب" });
  }

  const currentSettings = await getExternalSettings();
  const grade_matrix = { ...(currentSettings.grade_matrix || {}) };
  grade_matrix[key] = !!enabled;

  await saveExternalSettings({ grade_matrix }, currentUser.username);
  return res.json({ success: true, key, enabled: grade_matrix[key] });
});

// GET /api/matrix/hierarchy - Public API for Cascading Dropdowns
router.get("/api/matrix/hierarchy", async (req, res) => {
  const branch = (req.query.branch || "").trim();
  const student_type = (req.query.student_type || "بنين").trim();
  const settings = await getExternalSettings();

  const hierarchy = getAvailableHierarchy(branch, student_type, settings);
  res.json({ success: true, ...hierarchy });
});

module.exports = router;
