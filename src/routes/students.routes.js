const { parseTimeTrackMeta, encodeTimeTrackMeta } = require('../utils/timeline');
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");
const { withUser, userCan, userHasPermission, userMatchesScope } = require("../middleware/permissions");
const { getStudents, getStudentById, createStudent, updateStudent, deleteStudent } = require("../services/students.service");
const { getBranchNames } = require("../services/branches.service");
const { getActiveYear, getAcademicYears } = require("../services/academic_years.service");
const { addHistory, addStudentHistory, computeFieldChanges } = require("../services/history.service");
const supabase = require("../config/supabase");
const { INTERVIEW_RESULTS, FOLLOWUP_STATUSES, STUDENT_TYPES, PHASES, GRADES, TRACKS, NATIONALITIES, ROLES } = require("../utils/constants");

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

async function uploadFiles(files, customTitle) {
  const uploaded = [];
  if (!files || !files.length) return uploaded;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const timestamp = Date.now();
      const safeName = (file.originalname || "file").replace(/[/\\]/g, "_");
      const fileName = `${timestamp}_${safeName}`;
      const { data, error } = await supabase.storage
        .from("uploads")
        .upload(fileName, file.buffer, { contentType: file.mimetype || "application/octet-stream", upsert: true });
      if (!error) {
        const { data: pub } = supabase.storage.from("uploads").getPublicUrl(fileName);
        const displayName = customTitle ? (files.length === 1 ? customTitle : `${customTitle} (${i + 1})`) : file.originalname;
        uploaded.push({
          name: displayName,
          original_name: file.originalname,
          filename: fileName,
          url: pub ? pub.publicUrl : "",
          type: file.mimetype || "",
          size: file.size || 0,
          uploaded_at: new Date().toISOString()
        });
      } else {
        console.error("Storage upload error for", file.originalname, error);
      }
    } catch (e) {
      console.error("Upload exception for", file.originalname, e);
    }
  }
  return uploaded;
}

// GET / - Clean Home Dashboard Hub
router.get("/", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) return res.redirect("/login");

  const activeBranch = (req.cookies && req.cookies.active_branch) ? decodeURIComponent(req.cookies.active_branch) : "";
  const canManageStudents = userCan(currentUser, "admin", "manager", "employee") && userHasPermission(currentUser, "manage_students");
  const canManageInterviews = userCan(currentUser, "admin") || userHasPermission(currentUser, "manage_interviews");
  const canManageRegistration = userCan(currentUser, "admin") || userHasPermission(currentUser, "manage_registration");
  const canManageUsers = userCan(currentUser, "admin") && userHasPermission(currentUser, "manage_users");
  const canManageYears = userCan(currentUser, "admin") && userHasPermission(currentUser, "manage_years");
  const canViewAnalytics = userHasPermission(currentUser, "view_analytics");

  let students = await getStudents();
  if (activeBranch && activeBranch !== "الكل") {
    students = students.filter(s => s.branch === activeBranch);
  }
  if (currentUser && ["manager", "employee"].includes(currentUser.role)) {
    students = students.filter(s => userMatchesScope(currentUser, s));
  }

  const branches = await getBranchNames();
  const activeYear = await getActiveYear();

  const stats = {
    total: students.length,
    accepted: students.filter(s => s.interview_result === "مقبول").length,
    registered: students.filter(s => s.followup_status === "تم التسجيل").length,
    waiting: students.filter(s => s.followup_status === "في انتظار التسجيل").length,
  };

  res.render("home", {
    pageTitle: "الرئيسية",
    currentUser,
    activeBranch,
    activeYear,
    branches,
    stats,
    canManageStudents,
    canManageUsers,
    canManageYears,
    canViewAnalytics,
    message: req.query.msg || null
  });
});

// GET /students - Main Students Management Table & Filters
router.get("/students", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) return res.redirect("/login");

  const activeBranch = (req.cookies && req.cookies.active_branch) ? decodeURIComponent(req.cookies.active_branch) : "";
  const canManageStudents = userCan(currentUser, "admin", "manager", "employee") && userHasPermission(currentUser, "manage_students");
  const canManageInterviews = userCan(currentUser, "admin") || userHasPermission(currentUser, "manage_interviews");
  const canManageRegistration = userCan(currentUser, "admin") || userHasPermission(currentUser, "manage_registration");
  const canManageUsers = userCan(currentUser, "admin") && userHasPermission(currentUser, "manage_users");
  const canManageYears = userCan(currentUser, "admin") && userHasPermission(currentUser, "manage_years");
  const canViewAnalytics = userHasPermission(currentUser, "view_analytics");
  const canDeleteStudents = userCan(currentUser, "admin");
  const canUpdateStatusOnly = userCan(currentUser, "employee") && userHasPermission(currentUser, "manage_students") && !userCan(currentUser, "admin", "manager");
  const statusUpdateMode = req.query.status_update === "1";

  let students = await getStudents();
  const branches = await getBranchNames();
  const activeYear = await getActiveYear();

  // Academic Year Scoping
  const sessionYear = req.sessionYear;
  if (sessionYear && sessionYear.id) {
    // If student has an academic_year_id, filter by it; if null, show in active year
    students = students.filter(s => String(s.academic_year_id || (activeYear ? activeYear.id : '')) === String(sessionYear.id));
  }

  if (activeBranch && activeBranch !== "الكل") {
    students = students.filter(s => s.branch === activeBranch);
  }
  if (currentUser && ["manager", "employee"].includes(currentUser.role)) {
    students = students.filter(s => userMatchesScope(currentUser, s));
  }

  const editId = req.query.edit_id || "";
  let editingStudent = null;
  if (editId && canManageStudents) {
    editingStudent = students.find(s => String(s.id) === String(editId)) || null;
  }

  const openNewModal = req.query.open_modal === "1";

  const query = (req.query.q || "").toLowerCase();
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
    if (phoneQuery) {
      const mp = (s.phone || "").includes(phoneQuery);
      const mm = (s.notes || "").includes(phoneQuery);
      if (!mp && !mm) return false;
    }
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
    pageTitle: "متابعة وتسجيل الطلاب",
    students: filtered,
    editingStudent,
    openNewModal,
    message: req.query.msg || null,
    interview_results: INTERVIEW_RESULTS,
    followup_statuses: FOLLOWUP_STATUSES,
    student_types: STUDENT_TYPES,
    phases: PHASES,
    grades: GRADES,
    tracks: TRACKS,
    nationalities: NATIONALITIES,
    query, phoneQuery,
    interviewFilter, followupFilter, studentTypeFilter, phaseFilter,
    gradeFilter, statusFilter, branchFilter,
    stats, currentUser, activeBranch,
    canManageStudents, canManageUsers, canManageYears, canViewAnalytics,
    canDeleteStudents, canUpdateStatusOnly, statusUpdateMode, canManageInterviews, canManageRegistration,
    roles: ROLES, branches, activeYear, allPhonesMap,
  });
});

// GET /reports
router.get("/reports", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) return res.redirect("/login");
  const activeBranch = (req.cookies && req.cookies.active_branch) ? decodeURIComponent(req.cookies.active_branch) : "";
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
  res.render("reports", {
    pageTitle: "مركز التقارير والتصدير",
    students: filtered,
    interview_results: INTERVIEW_RESULTS,
    followup_statuses: FOLLOWUP_STATUSES,
    phases: PHASES,
    branches,
    activeYear,
    activeBranch,
    currentUser,
    interviewFilter,
    followupFilter,
    phaseFilter,
    branchFilter
  });
});

// POST /api/delete_attachment
router.post("/api/delete_attachment", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) return res.status(401).json({ success: false, message: "غير مصرح" });
  
  const canManageStudents = userCan(currentUser, "admin", "manager", "employee") && userHasPermission(currentUser, "manage_students");
  const canManageInterviews = userCan(currentUser, "admin") || userHasPermission(currentUser, "manage_interviews");
  const canManageRegistration = userCan(currentUser, "admin") || userHasPermission(currentUser, "manage_registration");
  if (req.isReadOnlyYear) return res.status(403).json({ success: false, message: "عفواً، لا يمكن حذف المرفقات في عام دراسي مؤرشف" });
  if (!canManageStudents) return res.status(403).json({ success: false, message: "ليس لديك صلاحية لحذف المرفقات" });

  const { student_id, file_index, file_url, filename } = req.body;
  if (!student_id) return res.status(400).json({ success: false, message: "معرف الطالب مفقود" });

  const student = await getStudentById(parseInt(student_id));
  if (!student) return res.status(404).json({ success: false, message: "الطالب غير موجود" });

  let attachments = Array.isArray(student.attachments) ? [...student.attachments] : [];
  
  let removedFile = null;
  if (typeof file_index === "number" && file_index >= 0 && file_index < attachments.length) {
    removedFile = attachments.splice(file_index, 1)[0];
  } else if (file_url) {
    const idx = attachments.findIndex(a => a.url === file_url || (a.filename && file_url.includes(a.filename)));
    if (idx !== -1) {
      removedFile = attachments.splice(idx, 1)[0];
    }
  } else if (filename) {
    const idx = attachments.findIndex(a => a.filename === filename || a.name === filename);
    if (idx !== -1) {
      removedFile = attachments.splice(idx, 1)[0];
    }
  }

  if (!removedFile) {
    return res.status(404).json({ success: false, message: "المرفق غير موجود" });
  }

  try {
    const storageFilename = removedFile.filename || (removedFile.url ? removedFile.url.split("/").pop() : null);
    if (storageFilename) {
      await supabase.storage.from("uploads").remove([storageFilename]);
    }
  } catch (err) {
    console.error("Storage remove error:", err);
  }

  const updated = await updateStudent(parseInt(student_id), { attachments });
  
  if (updated) {
    const details = "تم حذف المرفق \"" + (removedFile.name || removedFile.original_name || "ملف") + "\" من ملف الطالب " + student.name;
    await addStudentHistory(parseInt(student_id), "attachment_deleted", details, currentUser.username);
    await addHistory("attachment_deleted", details, currentUser.username);
    return res.json({ success: true, message: "تم حذف المرفق بنجاح", remainingCount: attachments.length, attachments });
  }

  return res.status(500).json({ success: false, message: "فشل تحديث بيانات الطالب بعد الحذف" });
});

// POST /api/quick_update_status
router.post("/api/quick_update_status", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) return res.status(401).json({ success: false, message: "غير مصرح" });

  if (req.isReadOnlyYear) return res.status(403).json({ success: false, message: "عفواً، لا يمكن تعديل الحالة في عام دراسي مؤرشف (وضع القراءة فقط)" });
  const { student_id, field, value } = req.body;
  if (!student_id || !field) return res.status(400).json({ success: false, message: "بيانات غير مكتملة" });

  const canManageInterviews = userCan(currentUser, "admin") || userHasPermission(currentUser, "manage_interviews");
  const canManageRegistration = userCan(currentUser, "admin") || userHasPermission(currentUser, "manage_registration");

  // Field-level permission security checks
  if (field === "interview_result" && !canManageInterviews) {
    return res.status(403).json({ success: false, message: "عفواً، ليس لديك صلاحية مسؤول المقابلات لتعديل نتيجة المقابلة" });
  }

  if (field === "followup_status" && !canManageRegistration) {
    return res.status(403).json({ success: false, message: "عفواً، ليس لديك صلاحية مسؤول التسجيل لتعديل حالة التسجيل" });
  }

  const existing = await getStudentById(parseInt(student_id));
  if (!existing) return res.status(404).json({ success: false, message: "الطالب غير موجود" });

  const updateData = {};
  updateData[field] = value;

  // AUTOMATED WORKFLOW TRANSITION:
  // When interview result changes:
  // مقبول -> auto transition to 'في انتظار التسجيل'
  // غير مقبول -> auto transition to 'لم يجتز المقابلة'
  let autoFollowupStatus = null;
  if (field === "interview_result") {
    if (value === "مقبول") {
      autoFollowupStatus = "في انتظار التسجيل";
      updateData.followup_status = autoFollowupStatus;
    } else if (value === "غير مقبول") {
      autoFollowupStatus = "لم يجتز المقابلة";
      updateData.followup_status = autoFollowupStatus;
    }
  }

    // Update time tracking metadata
  
    const newData = {
      name: name || existing.name,
      phone: phone || existing.phone,
      date_of_birth: date_of_birth || existing.date_of_birth,
      nationality: nationality || existing.nationality,
      neighborhood: neighborhood || existing.neighborhood,
      interview_date: interview_date || existing.interview_date,
      interview_result: finalInterviewResult,
      interview_reason: interview_reason || existing.interview_reason,
      followup_status: finalFollowupStatus,
      registration_reason: registration_reason || existing.registration_reason,
      student_type: student_type || existing.student_type,
      track: track || existing.track,
      phase: phase || existing.phase,
      grade: grade || existing.grade,
      notes: cleanNotesForDisplay(finalNotes),
      branch: student_branch || existing.branch || activeBranch,
      attachments: newAttachments,
    };
    
    const fieldChanges = computeFieldChanges(existing, newData);
    const updatedResult = await updateStudent(currentId, newData);

    if (!updatedResult) {
      return res.redirect("/students?msg=" + encodeURIComponent("❌ تعذر حفظ التعديلات في قاعدة البيانات"));
    }

    const actionLabel = statusUpdateMode ? "student_status_updated" : "student_updated";
    const details = statusUpdateMode ? ("تم تحديث حالة الطالب " + newData.name) : ("تم تعديل بيانات الطالب " + newData.name);
    await addStudentHistory(currentId, actionLabel, details, currentUser.username, fieldChanges);
    await addHistory(actionLabel, details, currentUser.username);

    let msg = "تم تعديل بيانات الطالب " + newData.name + " بنجاح";
    if (siblingStudent) {
      msg = "تم تحديث البيانات بنجاح، ورقم الجوال مرتبط بطلاب آخرين (إخوة: " + siblingStudent.name + ")";
    }
    return res.redirect("/students?msg=" + encodeURIComponent(msg));
  } else {
    // CREATE LOGIC: Automatically set Default Initial States:
    // interview_result = 'في انتظار المقابلة'
    // followup_status = 'في انتظار المقابلة'
    if (!name) return res.redirect("/students?msg=" + encodeURIComponent("يرجى إدخال اسم الطالب"));
    
    // Keep notes strictly empty unless manually written by user
    const finalNotes = cleanNotesForDisplay(notes || "");
    const newStudent = {
      name, phone, date_of_birth, nationality, neighborhood,
      interview_date,
      interview_result: "في انتظار المقابلة",
      interview_reason: "",
      followup_status: "في انتظار المقابلة",
      registration_reason: "",
      student_type: student_type || "بنين",
      track: track || "عام",
      phase: phase || "ابتدائي",
      grade: grade || "1",
      notes: finalNotes,
      branch: student_branch || activeBranch || "الندى",
      academic_year_id: (req.sessionYear && req.sessionYear.id) ? req.sessionYear.id : (activeYear ? activeYear.id : null),
      attachments: uploadedFiles,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const created = await createStudent(newStudent);
    if (!created) {
      return res.redirect("/students?msg=" + encodeURIComponent("❌ تعذر حفظ الطالب في قاعدة البيانات. يرجى مراجعة البيانات والمحاولة مجدداً"));
    }

    let msg = "تم إضافة الطالب " + name + " بنجاح (الحالة الافتراضية: في انتظار المقابلة)";
    if (siblingStudent) {
      msg = "تم التسجيل بنجاح، ورقم الجوال مرتبط بطلاب آخرين (إخوة: " + siblingStudent.name + ")";
    }

    await addStudentHistory(created.id, "student_created", "تم إضافة الطالب " + name, currentUser.username);
    await addHistory("student_created", "تم إضافة الطالب " + name, currentUser.username);
    return res.redirect("/students?msg=" + encodeURIComponent(msg));
  }
});

// POST /delete/:id
router.post("/delete/:id", requireAuth, withUser, async (req, res) => {
  if (req.isReadOnlyYear) return res.redirect("/students?msg=" + encodeURIComponent("عفواً، لا يمكن حذف الطلاب في عام دراسي مؤرشف"));
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin")) return res.redirect("/students");
  const studentId = parseInt(req.params.id);
  const student = await getStudentById(studentId);
  await deleteStudent(studentId);
  if (student) { await addStudentHistory(studentId, "student_deleted", "تم حذف الطالب " + student.name, currentUser.username); }
  await addHistory("student_deleted", "تم حذف الطالب رقم " + studentId, currentUser.username);
  res.redirect("/students");
});

// GET /api/lookup_parent?phone=05xxxxxxxx
router.get("/api/lookup_parent", requireAuth, withUser, async (req, res) => {
  const queryPhone = (req.query.phone || "").trim();
  if (!queryPhone || queryPhone.length < 8) {
    return res.json({ found: false });
  }

  const allStudents = await getStudents();
  const academicYears = await getAcademicYears();
  const yearMap = {};
  academicYears.forEach(y => { yearMap[y.id] = y.year_name; });

  // Find matches across ALL academic years
  const matches = allStudents.filter(s => {
    const p1 = (s.phone || "").trim();
    const p2 = (s.notes || "");
    return p1 === queryPhone || p2.includes(queryPhone);
  });

  if (!matches.length) {
    return res.json({ found: false });
  }

  const first = matches[0];
  const siblings = matches.map(m => {
    const yr = yearMap[m.academic_year_id] || (m.academic_year_id ? ("عام " + m.academic_year_id) : "عام دراسي سابق");
    return {
      id: m.id,
      name: m.name,
      branch: m.branch,
      phase: m.phase,
      grade: m.grade,
      year_name: yr
    };
  });

  const yearsMentioned = [...new Set(siblings.map(s => s.year_name))].join(" و ");
  const siblingsNames = siblings.map(s => (s.name + " (" + s.branch + " - " + s.phase + " " + s.grade + ")")).join("، ");

  return res.json({
    found: true,
    student: {
      name: first.name,
      neighborhood: first.neighborhood || "",
      nationality: first.nationality || "سعودي",
      branch: first.branch || "",
    },
    siblings,
    years_mentioned: yearsMentioned,
    message: "تنبيه: ولي الأمر هذا مسجل في النظام مسبقاً خلال العام الدراسي [" + yearsMentioned + "] ولديه أبناء مسجلين: (" + siblingsNames + ")"
  });
});

module.exports = router;
