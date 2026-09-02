const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser } = require("../middleware/permissions");
const { getExternalSettings, saveExternalSettings } = require("../services/settings.service");
const { addHistory } = require("../services/history.service");

// GET /external_settings - Exclusive to Admin (General Manager)
router.get("/external_settings", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || currentUser.role !== "admin") {
    return res.redirect("/");
  }

  const settings = await getExternalSettings();
  res.render("external_settings", {
    currentUser,
    settings,
    message: req.query.msg || null
  });
});

// POST /external_settings - Update portal configuration
router.post("/external_settings", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || currentUser.role !== "admin") {
    return res.redirect("/");
  }

  const is_portal_open = req.body.is_portal_open === "1";
  const portal_announcement = (req.body.portal_announcement || "").trim();
  const portal_closed_message = (req.body.portal_closed_message || "").trim();
  const whatsapp_template = (req.body.whatsapp_template || "").trim();
  const show_mother_phone = req.body.show_mother_phone === "1";
  const show_nationality = req.body.show_nationality === "1";
  const show_neighborhood = req.body.show_neighborhood === "1";
  const show_track = req.body.show_track === "1";
  const show_notes = req.body.show_notes === "1";

  const updatedConfig = {
    is_portal_open,
    portal_announcement,
    portal_closed_message,
    whatsapp_template,
    show_mother_phone,
    show_nationality,
    show_neighborhood,
    show_track,
    show_notes
  };

  await saveExternalSettings(updatedConfig, currentUser.username);
  await addHistory("settings_updated", "تم تحديث إعدادات بوابة التسجيل الخارجي ورسائل الواتساب", currentUser.username);

  const settings = await getExternalSettings();
  res.render("external_settings", {
    currentUser,
    settings,
    message: "تم حفظ وتطبيق إعدادات التسجيل الخارجي بنجاح ✅"
  });
});

module.exports = router;
