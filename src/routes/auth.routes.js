const express = require("express");
const router = express.Router();
const { signToken, requireAuth, getCurrentUser } = require("../middleware/auth");
const { withUser } = require("../middleware/permissions");
const { verifyPassword, updateUser } = require("../services/users.service");
const { getBranchNames } = require("../services/branches.service");
const { addHistory } = require("../services/history.service");

// GET /login
router.get("/login", async (req, res) => {
  const token = req.cookies && req.cookies.auth_token;
  if (token) return res.redirect("/");
  const branches = await getBranchNames();
  res.render("login", { branches, error: null });
});

// POST /login
router.post("/login", async (req, res) => {
  const { username, password, branch } = req.body;
  const branches = await getBranchNames();
  const user = await verifyPassword((username || "").trim(), (password || "").trim());
  if (!user) {
    return res.render("login", { branches, error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
  }
  const branchVal = (branch || "").trim();
  if (branchVal && branchVal !== "الكل" && !branches.includes(branchVal)) {
    return res.render("login", { branches, error: "يرجى اختيار فرع صحيح" });
  }
  const token = signToken({ username: user.username, branch: branchVal });
  res.cookie("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  });
  res.cookie("active_branch", branchVal, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000,
  });
  await addHistory("login_success", `تم تسجيل دخول المستخدم ${user.username} للفرع ${branchVal}`, user.username);
  res.redirect("/");
});

// POST /change_password (Available for ANY logged in user)
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
  res.clearCookie("auth_token");
  res.clearCookie("active_branch");
  res.redirect("/login");
});

module.exports = router;
