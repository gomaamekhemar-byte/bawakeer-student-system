const express = require("express");
const router = express.Router();
const { signToken, requireAuth, getCurrentUser } = require("../middleware/auth");
const { withUser } = require("../middleware/permissions");
const { verifyPassword, updateUser } = require("../services/users.service");
const { getBranchNames } = require("../services/branches.service");
const { getAcademicYears, getActiveYear } = require("../services/academic_years.service");
const { addHistory } = require("../services/history.service");

// GET /login - Always render clean login screen with no autofill
router.get("/login", async (req, res) => {
  // Clear any existing session cookie completely
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
  const { username, password, branch, academic_year_id } = req.body;
  const branches = await getBranchNames();
  const academic_years = await getAcademicYears();
  const activeYear = await getActiveYear();

  const user = await verifyPassword((username || "").trim(), (password || "").trim());
  if (!user) {
    return res.render("login", { branches, academic_years, error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
  }

  // Branch Authorization Check
  const userBranches = Array.isArray(user.branches) ? user.branches : (user.branch ? [user.branch] : []);
  const isFullAccess = user.role === "admin" || userBranches.includes("الكل") || userBranches.length === 0;

  let branchVal = (branch || "").trim();

  if (!isFullAccess) {
    const assignedBranch = userBranches[0] || user.branch || "";
    // If user explicitly chose a different branch:
    if (branchVal && branchVal !== assignedBranch && branchVal !== "") {
      return res.render("login", {
        branches,
        academic_years,
        error: "عفواً، غير مصرح لك بالدخول إلى بيانات هذا الفرع"
      });
    }
    // Smart auto-routing: force branch to their assigned branch
    branchVal = assignedBranch;
  } else {
    // Admin / Full Access user: default to 'الكل' if left empty
    if (!branchVal) branchVal = "الكل";
  }

  const selectedYear = academic_years.find(y => String(y.id) === String(academic_year_id)) || activeYear || { id: null, year_name: "", is_active: true };
  const isYearActive = Boolean(selectedYear && selectedYear.is_active);

  const token = signToken({
    username: user.username,
    branch: branchVal,
    academic_year_id: selectedYear.id,
    academic_year_name: selectedYear.year_name,
    is_year_active: isYearActive
  });

  // Session Cookies (Expires when browser session ends)
  res.cookie("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });

  res.cookie("active_branch", encodeURIComponent(branchVal), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });

  res.cookie("active_year_id", String(selectedYear.id || ""), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });

  res.cookie("active_year_name", encodeURIComponent(selectedYear.year_name || ""), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });

  await addHistory("login_success", `تم تسجيل دخول المستخدم ${user.username} للفرع ${branchVal} والعام ${selectedYear.year_name}`, user.username);
  
  // Smart Routing: Single-branch employees go directly to /analytics or /
  res.redirect("/");
});

// POST /change_password
router.post("/change_password", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) return res.redirect("/login");

  const { current_password, new_password, confirm_password } = req.body;
  if (!current_password || !new_password || !confirm_password) {
    return res.redirect("/?msg=" + encodeURIComponent("يرجى ملء جميع حقول تغيير كلمة المرور"));
  }
  if (new_password !== confirm_password) {
    return res.redirect("/?msg=" + encodeURIComponent("كلمة المرور الجديدة غير متطابقة مع التأكيد"));
  }
  if (new_password.length < 4) {
    return res.redirect("/?msg=" + encodeURIComponent("يجب أن تكون كلمة المرور 4 أحرف على الأقل"));
  }

  const verified = await verifyPassword(currentUser.username, current_password);
  if (!verified) {
    return res.redirect("/?msg=" + encodeURIComponent("كلمة المرور الحالية غير صحيحة"));
  }

  const updated = await updateUser(currentUser.username, { password: new_password });
  if (updated) {
    await addHistory("password_changed", `قام المستخدم ${currentUser.username} بتغيير كلمة المرور الخاصة به`, currentUser.username);
    return res.redirect("/?msg=" + encodeURIComponent("تم تغيير كلمة المرور بنجاح ✅"));
  } else {
    return res.redirect("/?msg=" + encodeURIComponent("حدث خطأ أثناء تحديث كلمة المرور"));
  }
});

// GET /logout
router.get("/logout", (req, res) => {
  res.clearCookie("auth_token", { path: "/" });
  res.clearCookie("active_branch", { path: "/" });
  res.clearCookie("active_year_id", { path: "/" });
  res.clearCookie("active_year_name", { path: "/" });
  res.redirect("/login");
});

module.exports = router;
