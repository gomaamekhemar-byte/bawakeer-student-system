const express = require("express");
const router = express.Router();
const multer = require("multer");
const supabase = require("../config/supabase");
const { requireAuth } = require("../middleware/auth");
const { withUser } = require("../middleware/permissions");
const {
  getExternalSettings,
  saveExternalSettings,
  getSystemIdentity,
  saveSystemIdentity,
  updateBranchWhatsAppNumber,
  isGradeAvailable,
  isBranchMasterActive,
  getActiveBranches,
  getAvailableHierarchy,
  buildMatrixKey
} = require("../services/settings.service");
const { getBranches } = require("../services/branches.service");
const { addHistory } = require("../services/history.service");
const { PHASE_STRUCTURE, PHASES, STUDENT_TYPES } = require("../utils/constants");

// Multer in-memory storage for logo upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

async function processLogoUpload(file) {
  if (!file || !file.buffer) return null;
  const timestamp = Date.now();
  const safeName = (file.originalname || "logo.png").replace(/[/\\]/g, "_");
  const fileName = `logo_${timestamp}_${safeName}`;

  try {
    const { data, error } = await supabase.storage
      .from("student-attachments")
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      });
    if (!error) {
      const { data: publicUrlData } = supabase.storage
        .from("student-attachments")
        .getPublicUrl(fileName);
      if (publicUrlData && publicUrlData.publicUrl) {
        return publicUrlData.publicUrl;
      }
    }
  } catch (e) {
    console.error("Storage upload failed, fallback to base64:", e.message);
  }

  // Fallback to Base64 Data URL (Ultra reliable across all serverless & local environments)
  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
}

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
    isBranchMasterActive,
    buildMatrixKey,
    message: req.query.msg || null
  });
});

// POST /external_settings - Update portal configuration, branch WhatsApp numbers, Master switches & Grade Matrix
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
  const branch_phones = { ...(currentSettings.branch_phones || {}) };
  branches.forEach(b => {
    const rawVal = req.body[`branch_phone_${b.id}`] !== undefined
      ? req.body[`branch_phone_${b.id}`]
      : req.body[`branch_phone_${b.name}`];
    if (rawVal !== undefined) {
      const val = String(rawVal).trim();
      branch_phones[String(b.id)] = val;
      branch_phones[b.name] = val;
    }
  });

  // 2. Process Branch Master Switches
  const branch_master_switches = { ...(currentSettings.branch_master_switches || {}) };
  branches.forEach(b => {
    const isMasterOn = req.body[`branch_master_${b.id}`] === "1" || req.body[`branch_master_${b.name}`] === "1";
    branch_master_switches[b.name] = isMasterOn;
    branch_master_switches[String(b.id)] = isMasterOn;
  });

  // 3. Process Dynamic Grade Matrix toggles
  const grade_matrix = { ...(currentSettings.grade_matrix || {}) };

  if (req.body.matrix_form_submitted === "1") {
    branches.forEach(b => {
      STUDENT_TYPES.forEach(st => {
        Object.entries(PHASE_STRUCTURE).forEach(([pName, pInfo]) => {
          pInfo.grades.forEach(gItem => {
            ['عام', 'تحفيظ'].forEach(tName => {
              const key = buildMatrixKey(b.name, st, pName, gItem.id, tName);
              const fieldName = `matrix_${key}`;
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
    branch_master_switches,
    grade_matrix
  };

  await saveExternalSettings(updatedConfig, currentUser.username);
  await addHistory("settings_updated", "تم تحديث إعدادات بوابة التسجيل ومصفوفة الفصول الشاملة ومفاتيح الفروع الرئيسية", currentUser.username);

  const settings = await getExternalSettings();
  res.render("external_settings", {
    currentUser,
    settings,
    branches,
    phaseStructure: PHASE_STRUCTURE,
    phases: PHASES,
    studentTypes: STUDENT_TYPES,
    isGradeAvailable,
    isBranchMasterActive,
    buildMatrixKey,
    message: "تم حفظ وتطبيق إعدادات التسجيل ومصفوفة الفصول والمسارات بنجاح ✅"
  });
});

// POST /api/matrix/toggle - AJAX Instant Matrix & Branch Master Toggle
router.post("/api/matrix/toggle", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || currentUser.role !== "admin") {
    return res.status(403).json({ success: false, error: "غير مصرح" });
  }

  const { key, enabled, type, branch } = req.body;
  const currentSettings = await getExternalSettings();

  // If it's a branch master switch toggle
  if (type === "branch_master" && branch) {
    const branch_master_switches = { ...(currentSettings.branch_master_switches || {}) };
    branch_master_switches[branch] = !!enabled;
    await saveExternalSettings({ branch_master_switches }, currentUser.username);
    return res.json({ success: true, branch, enabled: !!enabled, type: "branch_master" });
  }

  if (!key) {
    return res.status(400).json({ success: false, error: "المفتاح مطلوب" });
  }

  const grade_matrix = { ...(currentSettings.grade_matrix || {}) };
  grade_matrix[key] = !!enabled;

  await saveExternalSettings({ grade_matrix }, currentUser.username);
  return res.json({ success: true, key, enabled: grade_matrix[key] });
});

// GET /api/matrix/hierarchy - Public API for Cascading Dropdowns & Active Branches
router.get("/api/matrix/hierarchy", async (req, res) => {
  const branch = (req.query.branch || "").trim();
  const student_type = (req.query.student_type || "بنين").trim();
  const settings = await getExternalSettings();
  const allBranches = await getBranches(true);
  const activeBranchList = getActiveBranches(allBranches, settings).map(b => b.name);

  const hierarchy = getAvailableHierarchy(branch, student_type, settings);
  res.json({
    success: true,
    active_branches: activeBranchList,
    ...hierarchy
  });
});

// =============================================================
// SYSTEM IDENTITY & WHITE-LABELING (General Settings)
// =============================================================

// GET /general_settings - Dedicated identity settings view (Admin only)
router.get("/general_settings", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || currentUser.role !== "admin") {
    return res.redirect("/");
  }

  const identity = await getSystemIdentity();
  res.render("general_settings", {
    currentUser,
    identity,
    message: req.query.msg || null,
    error: req.query.err || null
  });
});

// Alias for convenience
router.get("/settings/identity", requireAuth, withUser, (req, res) => res.redirect("/general_settings"));

// POST /general_settings - Save system identity with logo upload
router.post("/general_settings", requireAuth, withUser, upload.single("logo"), async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || currentUser.role !== "admin") {
    return res.redirect("/");
  }

  try {
    const school_name = (req.body.school_name || "مدارس بواكير الأهلية").trim();
    const ministry_line = (req.body.ministry_line || "المملكة العربية السعودية - وزارة التعليم").trim();
    const slogan = (req.body.slogan || "").trim();
    const action = req.body.action || "save";

    const currentIdentity = await getSystemIdentity();
    let school_logo_url = currentIdentity.school_logo_url || "";

    if (action === "reset_logo") {
      school_logo_url = "";
    } else if (req.file) {
      const uploadedUrl = await processLogoUpload(req.file);
      if (uploadedUrl) {
        school_logo_url = uploadedUrl;
      }
    } else if (req.body.logo_url && req.body.logo_url.trim()) {
      school_logo_url = req.body.logo_url.trim();
    }

    await saveSystemIdentity({
      school_name,
      school_logo_url,
      ministry_line,
      slogan
    }, currentUser.username);

    await addHistory("system_identity_updated", `تم تحديث هوية المؤسسة (${school_name})`, currentUser.username);

    return res.redirect("/general_settings?msg=" + encodeURIComponent("تم حفظ وتحديث هوية النظام بنجاح ✅"));
  } catch (err) {
    console.error("Error updating system identity:", err);
    return res.redirect("/general_settings?err=" + encodeURIComponent("حدث خطأ أثناء حفظ هوية النظام: " + err.message));
  }
});

// GET /api/settings/identity - JSON API for Client-Side Global State
router.get("/api/settings/identity", async (req, res) => {
  try {
    const identity = await getSystemIdentity();
    res.json({
      success: true,
      identity
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings/identity - AJAX/REST API for updating identity
router.post("/api/settings/identity", requireAuth, withUser, upload.single("logo"), async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || currentUser.role !== "admin") {
    return res.status(403).json({ success: false, error: "صلاحية المدير العام مطلوبة" });
  }

  try {
    const school_name = (req.body.school_name || "مدارس بواكير الأهلية").trim();
    const ministry_line = (req.body.ministry_line || "المملكة العربية السعودية - وزارة التعليم").trim();
    const slogan = (req.body.slogan || "").trim();
    const action = req.body.action || "save";

    const currentIdentity = await getSystemIdentity();
    let school_logo_url = currentIdentity.school_logo_url || "";

    if (action === "reset_logo") {
      school_logo_url = "";
    } else if (req.file) {
      const uploadedUrl = await processLogoUpload(req.file);
      if (uploadedUrl) school_logo_url = uploadedUrl;
    } else if (req.body.logo_url && req.body.logo_url.trim()) {
      school_logo_url = req.body.logo_url.trim();
    }

    const saved = await saveSystemIdentity({
      school_name,
      school_logo_url,
      ministry_line,
      slogan
    }, currentUser.username);

    await addHistory("system_identity_updated", `تم تحديث هوية المؤسسة (${school_name})`, currentUser.username);

    res.json({
      success: true,
      identity: {
        school_name: saved.school_name,
        school_logo_url: saved.school_logo_url,
        ministry_line: saved.ministry_line,
        slogan: saved.slogan
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// Branch Contact & WhatsApp Endpoints (REST API)
// =========================================================================
async function handleUpdateBranchWhatsApp(req, res) {
  try {
    const branchId = req.params.id;
    const whatsapp_number = req.body.whatsapp_number !== undefined
      ? req.body.whatsapp_number
      : (req.body.branch_phone !== undefined
        ? req.body.branch_phone
        : (req.body.phone !== undefined
          ? req.body.phone
          : (req.body.contact_phone !== undefined ? req.body.contact_phone : "")));

    const username = (req.currentUser && req.currentUser.username) || "admin";
    const updatedBranch = await updateBranchWhatsAppNumber(branchId, whatsapp_number, username);

    await addHistory("branch_whatsapp_updated", `تم تحديث رقم واتساب فرع ${updatedBranch.name} إلى ${updatedBranch.whatsapp_number}`, username);

    return res.status(200).json({
      success: true,
      message: `تم تحديث رقم واتساب فرع ${updatedBranch.name} بنجاح ✅`,
      branch: updatedBranch
    });
  } catch (err) {
    console.error("Error in handleUpdateBranchWhatsApp:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "حدث خطأ أثناء تحديث رقم واتساب الفرع"
    });
  }
}

// Support PUT, PATCH, POST for branch update
router.put("/api/branches/:id", withUser, handleUpdateBranchWhatsApp);
router.patch("/api/branches/:id", withUser, handleUpdateBranchWhatsApp);
router.post("/api/branches/:id", withUser, handleUpdateBranchWhatsApp);
router.put("/api/branches/:id/whatsapp", withUser, handleUpdateBranchWhatsApp);
router.post("/api/branches/:id/whatsapp", withUser, handleUpdateBranchWhatsApp);

// GET /api/branches - List all branches with their WhatsApp routing number
router.get("/api/branches", async (req, res) => {
  try {
    const branches = await getBranches(false);
    const settings = await getExternalSettings();
    const phones = settings.branch_phones || {};
    const result = branches.map(b => {
      const p = phones[b.id] || phones[b.name] || "0553620441";
      return {
        ...b,
        whatsapp_number: p,
        contact_phone: p,
        phone: p
      };
    });
    return res.status(200).json({ success: true, branches: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/branches/:id - Get specific branch with WhatsApp number
router.get("/api/branches/:id", async (req, res) => {
  try {
    const branches = await getBranches(false);
    const idStr = String(req.params.id);
    const branch = branches.find(b => String(b.id) === idStr || b.name === idStr);
    if (!branch) {
      return res.status(404).json({ success: false, error: "الفرع غير موجود" });
    }
    const settings = await getExternalSettings();
    const phones = settings.branch_phones || {};
    const p = phones[branch.id] || phones[branch.name] || "0553620441";
    return res.status(200).json({
      success: true,
      branch: {
        ...branch,
        whatsapp_number: p,
        contact_phone: p,
        phone: p
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
