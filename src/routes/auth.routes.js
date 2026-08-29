const express = require("express");
const router = express.Router();
const { signToken } = require("../middleware/auth");
const { verifyPassword } = require("../services/users.service");
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

// GET /logout
router.get("/logout", (req, res) => {
  res.clearCookie("auth_token");
  res.clearCookie("active_branch");
  res.redirect("/login");
});

module.exports = router;
