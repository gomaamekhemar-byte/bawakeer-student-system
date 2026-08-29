const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser, userCan, userHasPermission } = require("../middleware/permissions");
const { getUsers, createUser, updateUser, deleteUser, getDefaultPermissions } = require("../services/users.service");
const { getBranchNames } = require("../services/branches.service");
const { addHistory } = require("../services/history.service");
const { ROLES, PERMISSIONS, PHASES } = require("../utils/constants");
const XLSX = require("xlsx");

// GET /users
router.get("/users", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin") || !userHasPermission(currentUser, "manage_users")) return res.redirect("/");
  let usersList = await getUsers();
  const query = (req.query.q || "").toLowerCase();
  const roleFilter = req.query.role_filter || "";
  if (query) usersList = usersList.filter(u => (u.full_name || "").toLowerCase().includes(query) || (u.username || "").toLowerCase().includes(query) || (u.phone || "").includes(query) || (u.job_title || "").toLowerCase().includes(query));
  if (roleFilter) usersList = usersList.filter(u => u.role === roleFilter);
  const branches = await getBranchNames();
  res.render("users", { users: usersList, message: req.query.msg || null, roles: ROLES, permissions: PERMISSIONS, branches, phases: PHASES, currentUser, query, roleFilter });
});

// POST /users - Create or Update User and Permissions
router.post("/users", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin") || !userHasPermission(currentUser, "manage_users")) return res.redirect("/");
  
  const { mode, username, password, role, full_name, phone, job_title } = req.body;
  
  let selectedBranches = req.body.branches ? (Array.isArray(req.body.branches) ? req.body.branches : [req.body.branches]) : [];
  let selectedPhases = req.body.phases ? (Array.isArray(req.body.phases) ? req.body.phases : [req.body.phases]) : [];
  
  // Parse permissions cleanly
  const permissionsObj = {};
  const rawPerms = req.body.permissions;
  for (const key of Object.keys(PERMISSIONS)) {
    if (Array.isArray(rawPerms)) {
      permissionsObj[key] = rawPerms.includes(key);
    } else if (typeof rawPerms === "string") {
      permissionsObj[key] = rawPerms === key;
    } else {
      permissionsObj[key] = req.body[key] === "1" || req.body[key] === "on";
    }
  }

  let usersList = await getUsers();

  if (mode === "edit" || mode === "update") {
    if (!username) return res.redirect("/users?msg=" + encodeURIComponent("اسم المستخدم مطلوب للتعديل"));
    
    const updates = {
      role: role || "viewer",
      full_name: full_name || "",
      phone: phone || "",
      job_title: job_title || "",
      permissions: permissionsObj,
      branches: selectedBranches,
      phases: selectedPhases,
      branch: selectedBranches[0] || "",
      phase: selectedPhases[0] || "",
    };

    if (password && password.trim()) {
      updates.password = password.trim();
    }

    await updateUser(username, updates);
    await addHistory("user_updated", `قام المدير بتعديل بيانات وصلاحيات المستخدم ${username}`, currentUser.username);
    return res.redirect("/users?msg=" + encodeURIComponent(`تم تحديث بيانات وصلاحيات المستخدم ${username} بنجاح ✅`));
  } else {
    // CREATE mode
    if (!username || !password || !full_name) {
      return res.redirect("/users?msg=" + encodeURIComponent("يرجى إدخال اسم المستخدم وكلمة المرور والاسم الكامل"));
    }
    if (usersList.find(u => u.username === username.trim())) {
      return res.redirect("/users?msg=" + encodeURIComponent("اسم المستخدم مسجل مسبقاً، يرجى اختيار اسم آخر"));
    }

    const newUser = await createUser({
      username: username.trim(),
      password: password.trim(),
      role: role || "viewer",
      full_name: full_name.trim(),
      phone: phone ? phone.trim() : "",
      tasks: "",
      job_title: job_title ? job_title.trim() : "",
      permissions: permissionsObj,
      branches: selectedBranches,
      phases: selectedPhases,
    });

    if (newUser) {
      await addHistory("user_created", `تم إنشاء المستخدم ${username} وتحديد صلاحياته`, currentUser.username);
      return res.redirect("/users?msg=" + encodeURIComponent(`تم إنشاء المستخدم ${username} بنجاح ✅`));
    } else {
      return res.redirect("/users?msg=" + encodeURIComponent("حدث خطأ أثناء إنشاء المستخدم"));
    }
  }
});

// POST /users/delete/:username
router.post("/users/delete/:username", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin") || !userHasPermission(currentUser, "manage_users")) return res.redirect("/");
  const username = req.params.username;
  if (username === "admin") return res.redirect("/users?msg=" + encodeURIComponent("لا يمكن حذف حساب مدير النظام الرئيسي"));
  await deleteUser(username);
  await addHistory("user_deleted", `تم حذف المستخدم ${username}`, currentUser.username);
  res.redirect("/users?msg=" + encodeURIComponent(`تم حذف المستخدم ${username}`));
});

// GET /users/export
router.get("/users/export", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin") || !userHasPermission(currentUser, "manage_users")) return res.redirect("/");
  const usersList = await getUsers();
  const wb = XLSX.utils.book_new();
  const rows = usersList.map(u => ({
    "الاسم الكامل": u.full_name || "",
    "اسم المستخدم": u.username || "",
    "رقم الجوال": u.phone || "",
    "الوظيفة": u.job_title || "",
    "الدور": ROLES[u.role] || u.role || "",
    "الصلاحيات": Object.entries(u.permissions || {}).filter(([, v]) => v).map(([k]) => PERMISSIONS[k] || k).join(", "),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "المستخدمين");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  await addHistory("export_users", "تم تصدير كشف المستخدمين", currentUser.username);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=users.xlsx");
  res.send(buf);
});

module.exports = router;
