const express = require("express");
const router = express.Router();
const querystring = require("querystring");
const { signToken, requireAuth, getCurrentUser } = require("../middleware/auth");
const { withUser } = require("../middleware/permissions");
const { verifyPassword, updateUser } = require("../services/users.service");
const { getBranchNames } = require("../services/branches.service");
const { getAcademicYears, getActiveYear } = require("../services/academic_years.service");
const { addHistory } = require("../services/history.service");

// GET /login - Always render clean login screen with no autofill
router.get("/login", async (req, res) => {
  res.clearCookie("auth_token", { path: "/" });
  res.clearCookie("active_branch", { path: "/" });
  res.clearCookie("active_year_id", { path: "/" });
  res.clearCookie("active_year_name", { path: "/" });

  const branches = await getBranchNames();
  const academic_years = await getAcademicYears();
  res.render("login", { branches, academic_years, error: null });
});

// POST /login - Authenticate, Verify Branch Authorization & Smart Route
router.post("/login", async (req, res) => {
  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch(e) {
      try { body = querystring.parse(body); } catch(e2) {}
    }
  }

  const username = (body.username || "").trim();
  const password = (body.password || "").trim();
  const branch = (body.branch || "").trim();
  const academic_year_id = (body.academic_year_id || "").trim();

  const branches = await getBranchNames();
  const academic_years = await getAcademicYears();
  const activeYear = await getActiveYear();

  if (!username || !password) {
    return res.render("login", { branches, academic_years, error: "يرجى إدخال اسم المستخدم وكلمة المرور" });
  }

  const user = await verifyPassword(username, password);
  if (!user) {
    return res.render("login", { branches, academic_years, error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
  }

  // Branch Authorization Check
  const userBranches = Array.isArray(user.branches) ? user.branches : (user.branch ? [user.branch] : []);
  const isFullAccess = user.role === "admin" || userBranches.includes("الكل") || userBranches.length === 0;

  let branchVal = branch;

  if (!isFullAccess) {
    const assignedBranch = userBranches[0] || user.branch || "";
    if (branchVal && branchVal !== assignedBranch && branchVal !== "") {
      return res.render("login", {
        branches,
        academic_years,
        error: "عفواً، غير مصرح لك بالدخول إلى بيانات هذا الفرع"
      });
    }
    branchVal = assignedBranch;
  } else {
    if (!branchVal) branchVal = "الكل";
  }

  const selectedYear = academic_years.find(y => String(y.id) === String(academic_year_id)) || activeYear || { id: 1, year_name: "1448هـ", is_active: true };
  const isYearActive = Boolean(selectedYear && selectedYear.is_active);

  const token = signToken({
    username: user.username,
    branch: branchVal,
    academic_year_id: selectedYear.id,
    academic_year_name: selectedYear.year_name,
    is_year_active: isYearActive
  });

  const isHttps = Boolean(req.secure || req.headers["x-forwarded-proto"] === "https" || process.env.NODE_ENV === "production");

  // Dynamic Session Cookies
  res.cookie("auth_token", token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? "none" : "lax",
    path: "/"
  });

  res.cookie("active_branch", encodeURIComponent(branchVal), {
    httpOnly: false,
    secure: isHttps,
    sameSite: isHttps ? "none" : "lax",
    path: "/"
  });

  res.cookie("active_year_id", String(selectedYear.id || ""), {
    httpOnly: false,
    secure: isHttps,
    sameSite: isHttps ? "none" : "lax",
    path: "/"
  });

  res.cookie("active_year_name", encodeURIComponent(selectedYear.year_name || ""), {
    httpOnly: false,
    secure: isHttps,
    sameSite: isHttps ? "none" : "lax",
    path: "/"
  });

  await addHistory("login_success", "تم تسجيل دخول المستخدم " + user.username + " للفرع " + branchVal + " والعام " + selectedYear.year_name, user.username);
  
  res.redirect("/");
});

// POST /change_password
router.post("/change_password", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) return res.redirect("/login");

  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch(e) { body = querystring.parse(body); }
  }

  const { current_password, new_password, confirm_password } = body;
  if (!current_password || !new_password || !confirm_password) {
    return res.redirect("/?msg=" + encodeURIComponent("يرجى ملء جميع حقول كلمة المرور"));
  }

  if (new_password !== confirm_password) {
    return res.redirect("/?msg=" + encodeURIComponent("كلمة المرور الجديدة غير متطابقة"));
  }

  if (new_password.length < 6) {
    return res.redirect("/?msg=" + encodeURIComponent("يجب أن تكون كلمة المرور 6 أحرف على الأقل"));
  }

  const user = await verifyPassword(currentUser.username, current_password);
  if (!user) {
    return res.redirect("/?msg=" + encodeURIComponent("كلمة المرور الحالية غير صحيحة"));
  }

  await updateUser(currentUser.username, { password: new_password });
  await addHistory("password_changed", "تم تغيير كلمة المرور للمستخدم " + currentUser.username, currentUser.username);
  res.redirect("/?msg=" + encodeURIComponent("تم تغيير كلمة المرور بنجاح"));
});

// GET /logout - Fully terminate session
router.get("/logout", (req, res) => {
  res.clearCookie("auth_token", { path: "/" });
  res.clearCookie("active_branch", { path: "/" });
  res.clearCookie("active_year_id", { path: "/" });
  res.clearCookie("active_year_name", { path: "/" });
  res.redirect("/login");
});

module.exports = router;
