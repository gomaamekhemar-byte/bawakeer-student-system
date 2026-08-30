const express = require("express");
const router = express.Router();
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");
const { withUser, userCan, userHasPermission, userMatchesScope } = require("../middleware/permissions");
const { getStudents, getStudentById, createStudent, updateStudent, deleteStudent } = require("../services/students.service");
const { getBranchNames } = require("../services/branches.service");
const { getActiveYear } = require("../services/academic_years.service");
const { addHistory, addStudentHistory, computeFieldChanges } = require("../services/history.service");
const supabase = require("../config/supabase");
const { INTERVIEW_RESULTS, FOLLOWUP_STATUSES, STUDENT_TYPES, PHASES, GRADES, TRACKS, NATIONALITIES, ROLES } = require("../utils/constants");

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

async function uploadFiles(files) {
  const uploaded = [];
  for (const file of files) {
    const fileName = Date.now() + "_" + file.originalname;
    const { error } = await supabase.storage.from("attachments").upload(fileName, file.buffer, { contentType: file.mimetype });
    if (!error) {
      const { data: pub } = supabase.storage.from("attachments").getPublicUrl(fileName);
      uploaded.push({ name: file.originalname, url: pub.publicUrl });
    }
  }
  return uploaded;
}

router.get("/", requireAuth, withUser, (req, res) => { res.redirect("/students"); });

router.get("/students", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) return res.redirect("/login");
  const activeBranch = (req.cookies && req.cookies.active_branch) || "";
  const canManageStudents = (userCan(currentUser, "admin", "manager", "employee")) && userHasPermission(currentUser, "manage_students");
  const canManageUsers = userCan(currentUser, "admin") && userHasPermission(currentUser, "manage_users");
  const canManageYears = userCan(currentUser, "admin") && userHasPermission(currentUser, "manage_years");
  const canViewAnalytics = userHasPermission(currentUser, "view_analytics");
  const canDeleteStudents = userCan(currentUser, "admin");
  const canUpdateStatusOnly = userCan(currentUser, "employee") && userHasPermission(currentUser, "manage_students") && !userCan(currentUser, "admin", "manager");
  const statusUpdateMode = req.query.status_update === "1";
  let students = await getStudents();
  const branches = await getBranchNames();
  const activeYear = await getActiveYear();
  if (activeBranch && activeBranch !== "الكل") { students = students.filter(s => s.branch === activeBranch); }
  if (currentUser && ["manager", "employee"].includes(currentUser.role)) { students = students.filter(s => userMatchesScope(currentUser, s)); }
  const editId = req.query.edit_id || "";
  let editingStudent = null;
  if (editId && canManageStudents) { editingStudent = students.find(s => String(s.id) === editId) || null; }
  const query = (req.query.q || "").toLowerCase();
  const neighborhoodQuery = (req.query.neighborhood || "").toLowerCase();
  const phoneQuery = (req.query.phone_search || "").trim();
  const interviewFilter = req.query.interview_filter || "";
  const followupFilter = req.query.followup_filter || "";
  const studentTypeFilter = req.query.student_type_filter || "";
  const phaseFilter = req.query.phase_filter || "";
  const gradeFilter = req.query.grade_filter || "";
  const statusFilter = req.query.status_filter || "";
  const branchFilter = req.query.branch_filter || "";
  let filtered = students.filter(s => {
    if (query && !(s.name || "").toLowerCase().includes(query)) return false;
    if (neighborhoodQuery && !(s.neighborhood || "").toLowerCase().includes(neighborhoodQuery)) return false;
    if (phoneQuery) { const mp = (s.phone || "").includes(phoneQuery); const mm = (s.mother_phone || "").includes(phoneQuery); if (!mp && !mm) return false; }
    if (interviewFilter && s.interview_result !== interviewFilter) return false;
    if (followupFilter && s.followup_status !== followupFilter) return false;
    if (studentTypeFilter && s.student_type !== studentTypeFilter) return false;
    if (phaseFilter && s.phase !== phaseFilter) return false;
    if (gradeFilter && s.grade !== gradeFilter) return false;
    if (branchFilter && s.branch !== branchFilter) return false;
    if (statusFilter === "لم يقابل" && s.interview_result) return false;
    if (statusFilter === "لم يسجل" && s.followup_status === "تم التسجيل") return false;
    if (statusFilter === "غير مقبول" && s.interview_result !== "غير مقبول") return false;
    if (statusFilter === "في انتظار التسجيل" && s.followup_status !== "في انتظار التسجيل") return false;
    if (statusFilter === "في انتظار المقابلة" && s.interview_result !== "في انتظار المقابلة") return false;
    return true;
  });
  const stats = {
    total: students.length,
    accepted: students.filter(s => s.interview_result === "مقبول").length,
    rejected: students.filter(s => s.interview_result === "غير مقبول").length,
    registered: students.filter(s => s.followup_status === "تم التسجيل").length,
    waiting: students.filter(s => s.followup_status === "في انتظار التسجيل").length,
    not_interested: students.filter(s => s.followup_status === "لا يرغب في التسجيل").length,
    not_registered: students.filter(s => s.followup_status !== "تم التسجيل").length,
    pending_interview: students.filter(s => s.interview_result === "في انتظار المقابلة").length,
  };
  const allPhonesMap = {};
  students.forEach(s => { if (s.phone) allPhonesMap[s.phone] = { name: s.name, branch: s.branch, id: s.id }; });
  res.render("index", {
    students: filtered, editingStudent, message: req.query.msg || null,
    interview_results: INTERVIEW_RESULTS, followup_statuses: FOLLOWUP_STATUSES,
    student_types: STUDENT_TYPES, phases: PHASES, grades: GRADES, tracks: TRACKS, nationalities: NATIONALITIES,
    query, interviewFilter, followupFilter, studentTypeFilter, phaseFilter,
    gradeFilter, statusFilter, branchFilter, stats, currentUser, activeBranch,
    canManageStudents, canManageUsers, canManageYears, canViewAnalytics,
    canDeleteStudents, canUpdateStatusOnly, statusUpdateMode,
    roles: ROLES, branches, activeYear, allPhonesMap,
  });
});

router.get("/reports", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) return res.redirect("/login");
  const activeBranch = (req.cookies && req.cookies.active_branch) || "";
  let students = await getStudents();
  const branches = await getBranchNames();
  const activeYear = await getActiveYear();
  if (activeBranch && activeBranch !== "الكل") { students = students.filter(s => s.branch === activeBranch); }
  if (currentUser && ["manager", "employee"].includes(currentUser.role)) { students = students.filter(s => userMatchesScope(currentUser, s)); }
  const interviewFilter = req.query.interview_filter || "";
  const followupFilter = req.query.followup_filter || "";
  const phaseFilter = req.query.phase_filter || "";
  const branchFilter = req.query.branch_filter || "";
  let filtered = students.filter(s => {
    if (interviewFilter && s.interview_result !== interviewFilter) return false;
    if (followupFilter && s.followup_status !== followupFilter) return false;
    if (phaseFilter && s.phase !== phaseFilter) return false;
    if (branchFilter && s.branch !== branchFilter) return false;
    return true;
  });
  res.render("reports", { students: filtered, interview_results: INTERVIEW_RESULTS, followup_statuses: FOLLOWUP_STATUSES, phases: PHASES, branches, activeYear, currentUser, interviewFilter, followupFilter, phaseFilter, branchFilter });
});

router.post("/api/quick_update_status", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) return res.status(401).json({ success: false, message: "غير مصرح" });
  const canManageStudents = (userCan(currentUser, "admin", "manager", "employee")) && userHasPermission(currentUser, "manage_students");
  if (!canManageStudents) return res.status(403).json({ success: false, message: "ليس لديك صلاحية" });
  const { student_id, field, value } = req.body;
  if (!student_id || !field) return res.status(400).json({ success: false, message: "بيانات ناقصة" });
  const allowedFields = ["followup_status", "interview_result"];
  if (!allowedFields.includes(field)) return res.status(400).json({ success: false, message: "حقل غير مسموح" });
  const existing = await getStudentById(parseInt(student_id));
  if (!existing) return res.status(404).json({ success: false, message: "الطالب غير موجود" });
  const updateData = { [field]: value };
  const fieldChanges = computeFieldChanges(existing, updateData);
  const updated = await updateStudent(parseInt(student_id), updateData);
  if (updated) {
    const fieldLabel = field === "followup_status" ? "حالة المتابعة" : "نتيجة المقابلة";
    const details = "تم تحديث " + fieldLabel + " للطالب " + existing.name + " إلى: " + (value || "غير محدد");
    await addStudentHistory(parseInt(student_id), "student_status_updated", details, currentUser.username, fieldChanges);
    await addHistory("student_status_updated", details, currentUser.username);
    return res.json({ success: true, message: "تم التحديث بنجاح" });
  }
  return res.status(500).json({ success: false, message: "حدث خطأ أثناء التحديث" });
});

router.post("/students", requireAuth, withUser, upload.array("attachments", 10), async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) return res.redirect("/login");
  const activeBranch = (req.cookies && req.cookies.active_branch) || "";
  const canManageStudents = (userCan(currentUser, "admin", "manager", "employee")) && userHasPermission(currentUser, "manage_students");
  const statusUpdateMode = req.body.status_update === "1";
  if (!canManageStudents) return res.redirect("/students?msg=" + encodeURIComponent("ليس لديك صلاحية لإضافة أو تعديل الطلاب"));
  const studentId = (req.body.student_id || "").trim();
  const name = (req.body.name || "").trim();
  const phone = (req.body.phone || "").trim();
  const mother_phone = (req.body.mother_phone || "").trim();
  const date_of_birth = (req.body.date_of_birth || "").trim();
  const nationality = (req.body.nationality || "").trim();
  const neighborhood = (req.body.neighborhood || "").trim();
  const interview_date = (req.body.interview_date || "").trim();
  const interview_result = (req.body.interview_result || "").trim();
  const interview_reason = (req.body.interview_reason || "").trim();
  const followup_status = (req.body.followup_status || "").trim();
  const registration_reason = (req.body.registration_reason || "").trim();
  const student_type = (req.body.student_type || "").trim();
  const track = (req.body.track || "").trim();
  const phase = (req.body.phase || "").trim();
  const grade = (req.body.grade || "").trim();
  const notes = (req.body.notes || "").trim();
  const student_branch = (req.body.student_branch || "").trim();
  const uploadedFiles = await uploadFiles(req.files || []);
  if (studentId) {
    const existing = await getStudentById(parseInt(studentId));
    if (!existing) return res.redirect("/students");
    const existingAttachments = Array.isArray(existing.attachments) ? existing.attachments : [];
    const newAttachments = [...existingAttachments, ...uploadedFiles];
    const newData = {
      name: name || existing.name, phone: phone || existing.phone,
      mother_phone: mother_phone || existing.mother_phone || "",
      date_of_birth: date_of_birth || existing.date_of_birth,
      nationality: nationality || existing.nationality,
      neighborhood: neighborhood || existing.neighborhood,
      interview_date: interview_date || existing.interview_date,
      interview_result, interview_reason: interview_reason || existing.interview_reason,
      followup_status, registration_reason: registration_reason || existing.registration_reason,
      student_type: student_type || existing.student_type, track: track || existing.track,
      phase: phase || existing.phase, grade: grade || existing.grade,
      notes: notes || existing.notes, branch: student_branch || existing.branch || activeBranch,
      attachments: newAttachments,
    };
    const fieldChanges = computeFieldChanges(existing, newData);
    await updateStudent(parseInt(studentId), newData);
    const actionLabel = statusUpdateMode ? "student_status_updated" : "student_updated";
    const details = statusUpdateMode ? "تم تحديث حالة الطالب " + newData.name : "تم تعديل بيانات الطالب " + newData.name;
    await addStudentHistory(parseInt(studentId), actionLabel, details, currentUser.username, fieldChanges);
    await addHistory(actionLabel, details, currentUser.username);
  } else {
    if (!name) return res.redirect("/students?msg=" + encodeURIComponent("يرجى إدخال اسم الطالب"));
    const allStudents = await getStudents();
    const nameLower = name.toLowerCase();
    const duplicateByName = allStudents.find(s => (s.name || "").toLowerCase() === nameLower);
    if (duplicateByName) return res.redirect("/students?msg=" + encodeURIComponent('يوجد طالب مسجل بنفس الاسم: "' + name + '" — يرجى مراجعة البيانات أو تعديل السجل الموجود'));
    if (phone) {
      const duplicateByPhone = allStudents.find(s => s.phone === phone || s.mother_phone === phone);
      if (duplicateByPhone) return res.redirect("/students?msg=" + encodeURIComponent('رقم الجوال ' + phone + ' مسجل مسبقاً باسم: "' + duplicateByPhone.name + '"'));
    }
    if (mother_phone) {
      const duplicateByMother = allStudents.find(s => s.phone === mother_phone || s.mother_phone === mother_phone);
      if (duplicateByMother) return res.redirect("/students?msg=" + encodeURIComponent('رقم جوال الأم ' + mother_phone + ' مسجل مسبقاً باسم: "' + duplicateByMother.name + '"'));
    }
    const newStudent = { name, phone, mother_phone, date_of_birth, nationality, neighborhood, interview_date, interview_result, interview_reason, followup_status, registration_reason, student_type, track, phase, grade, notes, branch: student_branch || activeBranch, attachments: uploadedFiles, updated_at: new Date().toISOString() };
    const created = await createStudent(newStudent);
    if (created) {
      await addStudentHistory(created.id, "student_created", "تم إضافة الطالب " + name, currentUser.username);
      await addHistory("student_created", "تم إضافة الطالب " + name, currentUser.username);
    }
  }
  res.redirect("/students");
});

router.post("/delete/:id", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin")) return res.redirect("/students");
  const studentId = parseInt(req.params.id);
  const student = await getStudentById(studentId);
  await deleteStudent(studentId);
  if (student) { await addStudentHistory(studentId, "student_deleted", "تم حذف الطالب " + student.name, currentUser.username); }
  await addHistory("student_deleted", "تم حذف الطالب رقم " + studentId, currentUser.username);
  res.redirect("/students");
});

module.exports = router;