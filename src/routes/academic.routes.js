const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser, userCan, userHasPermission } = require("../middleware/permissions");
const { getAcademicYears, getActiveYear, createAcademicYear, activateYear, deleteYear } = require("../services/academic_years.service");
const { getBranches, createBranch, updateBranch, deleteBranch } = require("../services/branches.service");
const { getStudents } = require("../services/students.service");
const { addHistory } = require("../services/history.service");

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

// GET/POST /branches
router.get("/branches", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin") || !userHasPermission(currentUser, "manage_years")) return res.redirect("/");
  const branchesData = await getBranches(false);
  res.render("branches", { branches: branchesData, message: null, currentUser });
});

router.post("/branches", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin") || !userHasPermission(currentUser, "manage_years")) return res.redirect("/");
  const { action, branch_id, name, location } = req.body;
  let message = null;
  if (action === "create") {
    if (!name || !name.trim()) { message = "يرجى إدخال اسم الفرع"; }
    else {
      const result = await createBranch({ name: name.trim(), location: (location || "").trim(), username: currentUser.username });
      if (result) {
        await addHistory("branch_created", `تم إنشاء الفرع ${name}`, currentUser.username);
        message = `تم إنشاء الفرع ${name} بنجاح`;
      } else { message = `الفرع ${name} موجود مسبقاً`; }
    }
  } else if (action === "edit") {
    await updateBranch(parseInt(branch_id), { name: (name || "").trim(), location: (location || "").trim() });
    await addHistory("branch_updated", `تم تعديل الفرع ${name}`, currentUser.username);
    message = "تم تحديث بيانات الفرع";
  } else if (action === "toggle_active") {
    const branches = await getBranches(false);
    const branch = branches.find(b => String(b.id) === String(branch_id));
    if (branch) {
      await updateBranch(parseInt(branch_id), { is_active: !branch.is_active });
      message = `تم ${branch.is_active ? 'تعطيل' : 'تفعيل'} الفرع`;
    }
  } else if (action === "delete") {
    const allStudents = await getStudents();
    const branches = await getBranches(false);
    const branch = branches.find(b => String(b.id) === String(branch_id));
    const inBranch = branch ? allStudents.filter(s => s.branch === branch.name).length : 0;
    if (inBranch > 0) { message = `لا يمكن حذف الفرع لوجود ${inBranch} طالب مسجل فيه`; }
    else {
      await deleteBranch(parseInt(branch_id));
      await addHistory("branch_deleted", `تم حذف فرع`, currentUser.username);
      message = "تم حذف الفرع";
    }
  }
  const branchesData = await getBranches(false);
  res.render("branches", { branches: branchesData, message, currentUser });
});

module.exports = router;
