const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser, userCan, userHasPermission } = require("../middleware/permissions");
const { addHistory } = require("../services/history.service");
const { getUsers, updateUser } = require("../services/users.service");
const supabase = require("../config/supabase");

// GET /setup
router.get("/setup", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin") || !userHasPermission(currentUser, "manage_settings")) return res.redirect("/");
  
  // Load settings from supabase
  const { data: settingsData } = await supabase.from("settings").select("*");
  const settings = {};
  if (settingsData) settingsData.forEach(row => { settings[row.key] = row.value; });
  const defaults = {
    school_name: "مدارس بواكير",
    max_upload_size_mb: 10,
    allow_registration_without_interview: false,
    require_interview_reason: true,
    require_registration_reason: true,
    session_timeout_minutes: 60,
  };
  const mergedSettings = { ...defaults, ...settings };

  res.render("setup", { settings: mergedSettings, message: null, message_type: "info", currentUser });
});

// POST /setup
router.post("/setup", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin") || !userHasPermission(currentUser, "manage_settings")) return res.redirect("/");
  const { action } = req.body;
  let message = null;
  let messageType = "info";

  if (action === "save_settings") {
    const toSave = {
      school_name: (req.body.school_name || "").trim() || "مدارس بواكير",
      max_upload_size_mb: parseInt(req.body.max_upload_size_mb || "10") || 10,
      allow_registration_without_interview: !!req.body.allow_registration_without_interview,
      require_interview_reason: !!req.body.require_interview_reason,
      require_registration_reason: !!req.body.require_registration_reason,
      session_timeout_minutes: parseInt(req.body.session_timeout_minutes || "60") || 60,
    };
    for (const [key, value] of Object.entries(toSave)) {
      await supabase.from("settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    }
    await addHistory("settings_updated", "تم تحديث إعدادات البرنامج", currentUser.username);
    message = "تم حفظ الإعدادات بنجاح";
    messageType = "success";
  } else if (action === "reset_admin_password") {
    const newPassword = (req.body.new_password || "").trim();
    if (newPassword.length < 6) {
      message = "كلمة المرور يجب أن تكون 6 أحرف على الأقل";
      messageType = "error";
    } else {
      await updateUser("admin", { password: newPassword });
      await addHistory("admin_password_reset", "تم إعادة تعيين كلمة مرور الأدمن", currentUser.username);
      message = "تم تغيير كلمة مرور الأدمن بنجاح";
      messageType = "success";
    }
  } else if (action === "reset_data") {
    const resetType = (req.body.reset_type || "").trim();
    const confirm = (req.body.confirm_reset || "").trim();
    if (confirm !== "تأكيد") {
      message = "يرجى كتابة كلمة 'تأكيد' للمتابعة";
      messageType = "error";
    } else {
      if (resetType === "students" || resetType === "all") {
        await supabase.from("students").delete().neq("id", 0);
      }
      if (resetType === "history" || resetType === "all") {
        await supabase.from("history").delete().neq("id", 0);
      }
      if (resetType === "student_history" || resetType === "all") {
        await supabase.from("student_history").delete().neq("id", 0);
      }
      await addHistory("system_reset", `تم إعادة تهيئة البيانات: ${resetType}`, currentUser.username);
      message = "تم إعادة التهيئة بنجاح";
      messageType = "success";
    }
  }

  const { data: settingsData } = await supabase.from("settings").select("*");
  const settings = {};
  if (settingsData) settingsData.forEach(row => { settings[row.key] = row.value; });
  const defaults = { school_name: "مدارس بواكير", max_upload_size_mb: 10, allow_registration_without_interview: false, require_interview_reason: true, require_registration_reason: true, session_timeout_minutes: 60 };
  res.render("setup", { settings: { ...defaults, ...settings }, message, message_type: messageType, currentUser });
});

module.exports = router;
