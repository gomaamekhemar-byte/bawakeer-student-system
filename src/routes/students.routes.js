const express = require("express");
const router = express.Router();
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");
const { withUser, userCan, userHasPermission, userMatchesScope } = require("../middleware/permissions");
const { getStudents, getStudentById, createStudent, updateStudent, deleteStudent } = require("../services/students.service");
const { getBranchNames } = require("../services/branches.service");
const { getActiveYear, getAcademicYears } = require("../services/academic_years.service");
const { addHistory, addStudentHistory, computeFieldChanges } = require("../services/history.service");
const { sendWhatsAppNotification, getWhatsAppDirectUrl } = require("../services/whatsapp.service");
const { getExternalSettings } = require("../services/settings.service");
const supabase = require("../config/supabase");
const { INTERVIEW_RESULTS, FOLLOWUP_STATUSES, STUDENT_TYPES, PHASES, GRADES, TRACKS, NATIONALITIES, ROLES } = require("../utils/constants");
const { cleanNotesForDisplay } = require("../utils/timeline");

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
        .from("student-attachments")
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });
      if (error) {
        console.error("Storage upload error:", error);
        continue;
      }
      const { data: publicUrlData } = supabase.storage
        .from("student-attachments")
        .getPublicUrl(fileName);
      
      const fileTitle = (customTitle && customTitle.trim()) 
        ? (files.length > 1 ? `${customTitle.trim()} (${i + 1})` : customTitle.trim())
        : (file.originalname || "مرفق");

      uploaded.push({
        id: `${timestamp}_${i}`,
        name: fileTitle,
        original_name: file.originalname,
        filename: fileName,
        url: publicUrlData.publicUrl,
        size: file.size,
        type: file.mimetype,
        uploaded_at: new Date().toISOString()
      });
    } catch (e) {
      console.error("Upload error:", e);
    }
  }
  return uploaded;
}

// =============================================
// PUBLIC REGISTRATION PORTAL (No Auth Required)
// =============================================
router.get("/apply", async (req, res) => {
  const branches = await getBranchNames();
  const activeYear = await getActiveYear();
  const settings = await getExternalSettings();
  res.render("apply", { branches, activeYear, settings, submitted: false, error: null });
});

router.get("/register", (req, res) => res.redirect("/apply"));

router.post("/apply", async (req, res) => {
  const branches = await getBranchNames();
  const activeYear = await getActiveYear();
  const settings = await getExternalSettings();

  if (settings.is_portal_open === false) {
    return res.render("apply", { branches, activeYear, settings, submitted: false, error: null });
  }

  // 1. Anti-Spam Honeypot check
  if (req.body.website_trap) {
    return res.redirect("/apply");
  }

  const name = (req.body.name || "").trim();
  const phone = (req.body.phone || "").trim();
  const mother_phone = (req.body.mother_phone || "").trim();
  const student_type = (req.body.student_type || "بنين").trim();
  const date_of_birth = (req.body.date_of_birth || "").trim();
  const nationality = (req.body.nationality || "سعودي").trim();
  const student_branch = (req.body.student_branch || (branches[0] || "الروابي")).trim();
  const phase = (req.body.phase || "ابتدائي").trim();
  const grade = (req.body.grade || "1").trim();
  const track = (req.body.track || "عام").trim();
  const neighborhood = (req.body.neighborhood || "").trim();
  const notes = (req.body.notes || "").trim();

  if (!name || !phone) {
    return res.render("apply", {
      branches,
      activeYear,
      submitted: false,
      error: "يرجى تعبئة كافة الحقول الإلزامية المطلوبة (اسم الطالب ورقم الجوال)"
    });
  }

  const newStudent = {
    name,
    phone,
    mother_phone,
    student_type,
    date_of_birth,
    nationality,
    branch: student_branch,
    phase,
    grade,
    track,
    neighborhood,
    notes: cleanNotesForDisplay(notes),
    interview_result: "في انتظار المقابلة",
    interview_reason: "",
    followup_status: "في انتظار المقابلة",
    registration_reason: "",
    registration_source: "رابط خارجي",
    academic_year_id: activeYear ? activeYear.id : 1,
    attachments: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const created = await createStudent(newStudent);
  if (!created) {
    return res.render("apply", {
      branches,
      activeYear,
      submitted: false,
      error: "تعذر إرسال الطلب حالياً، يرجى المحاولة مرة أخرى أو التواصل مع إدارة المدارس"
    });
  }

  await addHistory("online_application", `طلب تسجيل جديد عبر الإنترنت للطالب ${name} بفرع ${student_branch}`, "بوابة التسجيل العامة");

  // Send WhatsApp confirmation
  const waResult = await sendWhatsAppNotification(created, phone);

  return res.render("apply", {
    branches,
    activeYear,
    settings,
    submitted: true,
    student: created,
    whatsappUrl: waResult.directUrl,
    error: null
  });
});

// =============================================
// INTERNAL PORTAL ROUTES (Require Auth)
// =============================================

// GET / - Clean Home Dashboard Hub
router.get("/", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) return res.redirect("/login");

  const rawCookieBranch = req.cookies && req.cookies.active_branch ? req.cookies.active_branch : "";
  let activeBranch = rawCookieBranch ? decodeURIComponent(rawCookieBranch) : "";

  if (currentUser && ["manager", "employee"].includes(currentUser.role)) {
    const userBranches = Array.isArray(currentUser.branches) ? currentUser.branches : (currentUser.branch ? [currentUser.branch] : []);
    if (userBranches.length && !userBranches.includes("الكل")) {
      activeBranch = userBranches[0];
    }
  }

  const activeYear = await getActiveYear();
  const canViewAnalytics = userHasPermission(currentUser, "view_analytics");
  const canManageYears = userCan(currentUser, "admin") && userHasPermission(currentUser, "manage_years");
  const canManageUsers = userCan(currentUser, "admin") && userHasPermission(currentUser, "manage_users");

  res.render("home", {
    currentUser,
    activeBranch,
    activeYear,
    message: req.query.msg || null,
    canViewAnalytics,
    canManageYears,
    canManageUsers,
    isReadOnlyYear: req.isReadOnlyYear,
    sessionYear: req.sessionYear
  });
});

// GET /students - Students Management Table
async function handleGetStudents(req, res) {
  const currentUser = req.currentUser;
  if (!currentUser) return res.redirect("/login");

  const canManageStudents = (userCan(currentUser, "admin", "manager", "employee")) && userHasPermission(currentUser, "manage_students");
  const canManageUsers = userCan(currentUser, "admin") && userHasPermission(currentUser, "manage_users");
  const canManageYears = userCan(currentUser, "admin") && userHasPermission(currentUser, "manage_years");
  const canViewAnalytics = userHasPermission(currentUser, "view_analytics");
  const canDeleteStudents = userCan(currentUser, "admin");
  const canUpdateStatusOnly = userCan(currentUser, "employee") && userHasPermission(currentUser, "manage_students") && !userCan(currentUser, "admin", "manager");
  
  const canManageInterviews = userCan(currentUser, "admin") || userHasPermission(currentUser, "manage_interviews");
  const canManageRegistration = userCan(currentUser, "admin") || userHasPermission(currentUser, "manage_registration");

  const statusUpdateMode = req.query.status_update === "1";
  const openNewModal = req.query.new === "1";

  let students = await getStudents();
  const branches = await getBranchNames();
  const activeYear = await getActiveYear();

  // Academic Year Scoping
  const sessionYear = req.sessionYear;
  if (sessionYear && sessionYear.id) {
    students = students.filter(s => String(s.academic_year_id || (activeYear ? activeYear.id : "")) === String(sessionYear.id));
  }

  // Active Branch Cookie / Query
  const rawCookieBranch = req.cookies && req.cookies.active_branch ? req.cookies.active_branch : "";
  let activeBranch = rawCookieBranch ? decodeURIComponent(rawCookieBranch) : "";

  // Scope Filtering by User Branch / Phase
  if (currentUser && ["manager", "employee"].includes(currentUser.role)) {
    const userBranches = Array.isArray(currentUser.branches) ? currentUser.branches : (currentUser.branch ? [currentUser.branch] : []);
    if (userBranches.length && !userBranches.includes("الكل")) {
      activeBranch = userBranches[0];
    }
    students = students.filter(s => userMatchesScope(currentUser, s));
  } else if (activeBranch && activeBranch !== "الكل") {
    students = students.filter(s => s.branch === activeBranch);
  }

  const editId = req.query.edit_id || "";
  let editingStudent = null;
  if (editId && canManageStudents) {
    editingStudent = students.find(s => String(s.id) === String(editId)) || null;
  }

  // Filters
  const query = (req.query.q || "").toLowerCase().trim();
  const interviewFilter = req.query.interview_filter || "";
  const followupFilter = req.query.followup_filter || "";
  const studentTypeFilter = req.query.student_type_filter || "";
  const phaseFilter = req.query.phase_filter || "";
  const gradeFilter = req.query.grade_filter || "";
  const statusFilter = req.query.status_filter || "";
  const branchFilter = req.query.branch_filter || "";
  const sourceFilter = req.query.source_filter || "";

  let filtered = students.filter(s => {
    if (query) {
      const q = query;
      const n = (s.name || "").toLowerCase();
      const p = (s.phone || "");
      const g = (s.grade || "");
      const ph = (s.phase || "");
      const b = (s.branch || "");
      const nat = (s.nationality || "");
      const tr = (s.track || "");
      const mm = (s.notes || "").includes(q);
      if (!n.includes(q) && !p.includes(q) && !g.includes(q) && !ph.includes(q) && !b.includes(q) && !nat.includes(q) && !tr.includes(q) && !mm) {
        return false;
      }
    }
    if (interviewFilter && s.interview_result !== interviewFilter) return false;
    if (followupFilter && s.followup_status !== followupFilter) return false;
    if (studentTypeFilter && s.student_type !== studentTypeFilter) return false;
    if (phaseFilter && s.phase !== phaseFilter) return false;
    if (gradeFilter && s.grade !== gradeFilter) return false;
    if (branchFilter && s.branch !== branchFilter) return false;
    if (sourceFilter && s.registration_source !== sourceFilter) return false;
    
    // Status filters
    if (statusFilter === "لم يقابل" && (s.interview_result || s.interview_result === "مقبول" || s.interview_result === "غير مقبول")) return false;
    if (statusFilter === "لم يسجل" && s.followup_status === "تم التسجيل") return false;
    if (statusFilter === "غير مقبول" && s.interview_result !== "غير مقبول") return false;
    if (statusFilter === "في انتظار التسجيل" && s.followup_status !== "في انتظار التسجيل") return false;
    if (statusFilter === "في انتظار المقابلة" && s.interview_result !== "في انتظار المقابلة") return false;
    return true;
  });

  const onlineApplicantsCount = students.filter(s => s.registration_source === "رابط خارجي" && s.followup_status === "في انتظار المقابلة").length;

  const stats = {
    total: students.length,
    accepted: students.filter(s => s.interview_result === "مقبول").length,
    rejected: students.filter(s => s.interview_result === "غير مقبول").length,
    registered: students.filter(s => s.followup_status === "تم التسجيل").length,
    waiting: students.filter(s => s.followup_status === "في انتظار التسجيل").length,
    not_interested: students.filter(s => s.followup_status === "لا يرغب في التسجيل").length,
    not_registered: students.filter(s => s.followup_status !== "تم التسجيل").length,
    pending_interview: students.filter(s => s.interview_result === "في انتظار المقابلة").length,
    online_total: students.filter(s => s.registration_source === "رابط خارجي").length,
    internal_total: students.filter(s => s.registration_source !== "رابط خارجي").length,
  };

  const allPhonesMap = {};
  students.forEach(s => {
    if (s.phone) {
      allPhonesMap[s.phone] = { name: s.name, branch: s.branch, id: s.id };
    }
  });

  res.render("index", {
    students: filtered,
    editingStudent,
    message: req.query.msg || null,
    interview_results: INTERVIEW_RESULTS,
    followup_statuses: FOLLOWUP_STATUSES,
    student_types: STUDENT_TYPES,
    phases: PHASES,
    grades: GRADES,
    tracks: TRACKS,
    nationalities: NATIONALITIES,
    query,
    interviewFilter,
    followupFilter,
    studentTypeFilter,
    phaseFilter,
    gradeFilter,
    statusFilter,
    branchFilter,
    sourceFilter,
    onlineApplicantsCount,
    stats,
    currentUser,
    activeBranch,
    canManageStudents,
    canManageUsers,
    canManageYears,
    canViewAnalytics,
    canDeleteStudents,
    canUpdateStatusOnly,
    canManageInterviews,
    canManageRegistration,
    statusUpdateMode,
    openNewModal,
    roles: ROLES,
    branches,
    activeYear,
    allPhonesMap,
    getWhatsAppDirectUrl
  });
}

router.get("/students", requireAuth, withUser, handleGetStudents);

// POST /api/delete_attachment
router.post("/api/delete_attachment", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) return res.status(401).json({ success: false, message: "غير مصرح" });

  if (req.isReadOnlyYear) return res.status(403).json({ success: false, message: "عفواً، لا يمكن حذف المرفقات في عام دراسي مؤرشف" });

  const canManageStudents = (userCan(currentUser, "admin", "manager", "employee")) && userHasPermission(currentUser, "manage_students");
  if (!canManageStudents) return res.status(403).json({ success: false, message: "ليس لديك صلاحية لحذف المرفقات" });

  const { student_id, file_id, filename } = req.body;
  if (!student_id || (!file_id && !filename)) {
    return res.status(400).json({ success: false, message: "بيانات المرفق غير مكتملة" });
  }

  const student = await getStudentById(parseInt(student_id));
  if (!student) return res.status(404).json({ success: false, message: "الطالب غير موجود" });

  let attachments = Array.isArray(student.attachments) ? student.attachments : [];
  const removedFile = attachments.find(att => (file_id && att.id === file_id) || (filename && att.filename === filename));
  attachments = attachments.filter(att => !((file_id && att.id === file_id) || (filename && att.filename === filename)));

  if (removedFile && removedFile.filename) {
    try {
      await supabase.storage.from("student-attachments").remove([removedFile.filename]);
    } catch (e) {
      console.error("Storage delete error:", e);
    }
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

  const fieldChanges = computeFieldChanges(existing, updateData);
  const updated = await updateStudent(parseInt(student_id), updateData);
  
  if (updated) {
    const actionLabel = "student_status_updated";
    const fieldNameAr = field === "interview_result" ? "نتيجة المقابلة" : "حالة المتابعة";
    let details = `تم تحديث ${fieldNameAr} للطالب ${existing.name} إلى: ${value}`;
    if (autoFollowupStatus) {
      details += ` (وتحديث حالة التسجيل تلقائياً إلى ${autoFollowupStatus})`;
    }
    await addStudentHistory(parseInt(student_id), actionLabel, details, currentUser.username, fieldChanges);
    await addHistory(actionLabel, details, currentUser.username);
    return res.json({ success: true, message: "تم تحديث الحالة بنجاح", student: updated, autoFollowupStatus });
  }

  return res.status(500).json({ success: false, message: "تعذر تحديث الحالة في قاعدة البيانات" });
});

// POST /students - Create or Update Student (Internal)
router.post("/students", requireAuth, withUser, upload.array("attachments", 10), async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) return res.redirect("/login");

  if (req.isReadOnlyYear) {
    return res.redirect("/students?msg=" + encodeURIComponent("عفواً، لا يمكن إضافة أو تعديل البيانات في عام دراسي مؤرشف (وضع القراءة فقط)"));
  }

  const rawCookieBranch = req.cookies && req.cookies.active_branch ? req.cookies.active_branch : "";
  const activeBranch = rawCookieBranch ? decodeURIComponent(rawCookieBranch) : "";

  const canManageStudents = (userCan(currentUser, "admin", "manager", "employee")) && userHasPermission(currentUser, "manage_students");
  const canManageInterviews = userCan(currentUser, "admin") || userHasPermission(currentUser, "manage_interviews");
  const canManageRegistration = userCan(currentUser, "admin") || userHasPermission(currentUser, "manage_registration");
  const statusUpdateMode = req.body.status_update === "1";

  if (!canManageStudents) {
    return res.redirect("/students?msg=" + encodeURIComponent("ليس لديك صلاحية لإضافة أو تعديل الطلاب"));
  }

  const studentId = (req.body.student_id || "").trim();
  const currentId = studentId ? parseInt(studentId) : null;

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
  const attachment_title = (req.body.attachment_title || "").trim();
  const uploadedFiles = await uploadFiles(req.files || [], attachment_title);

  const allStudents = await getStudents();
  const otherStudents = currentId ? allStudents.filter(s => s.id !== currentId) : allStudents;

  if (name) {
    const nameLower = name.toLowerCase();
    const exactDuplicate = otherStudents.find(s => {
      const matchName = (s.name || "").trim().toLowerCase() === nameLower;
      const matchPhone = phone && s.phone === phone;
      return matchName && matchPhone;
    });

    if (exactDuplicate) {
      return res.redirect("/students?msg=" + encodeURIComponent("⚠️ يوجد طالب آخر بنفس الاسم ونفس رقم الجوال مسجل مسبقاً"));
    }
  }

  const siblingStudent = otherStudents.find(s => phone && s.phone === phone);

  if (currentId) {
    // UPDATE logic
    const existing = await getStudentById(currentId);
    if (!existing) return res.redirect("/students");
    const existingAttachments = Array.isArray(existing.attachments) ? existing.attachments : [];
    const newAttachments = [...existingAttachments, ...uploadedFiles];

    const finalNotes = (typeof req.body.notes !== "undefined") ? notes : cleanNotesForDisplay(existing.notes || "");

    let finalInterviewResult = existing.interview_result || "في انتظار المقابلة";
    let finalFollowupStatus = existing.followup_status || "في انتظار المقابلة";

    if (canManageInterviews && interview_result) {
      finalInterviewResult = interview_result;
      if (interview_result === "مقبول" && existing.interview_result !== "مقبول") {
        finalFollowupStatus = "في انتظار التسجيل";
      } else if (interview_result === "غير مقبول" && existing.interview_result !== "غير مقبول") {
        finalFollowupStatus = "لم يجتز المقابلة";
      }
    }

    if (canManageRegistration && followup_status) {
      if (!canManageInterviews || (interview_result === existing.interview_result)) {
        finalFollowupStatus = followup_status;
      }
    }
    
    const newData = {
      name: name || existing.name,
      phone: phone || existing.phone,
      mother_phone: mother_phone || existing.mother_phone,
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
    // CREATE LOGIC
    if (!name) return res.redirect("/students?msg=" + encodeURIComponent("يرجى إدخال اسم الطالب"));
    
    const finalNotes = cleanNotesForDisplay(notes || "");
    const activeYear = await getActiveYear();

    const targetBranch = student_branch || activeBranch || "الندى";

    const newStudent = {
      name,
      phone,
      mother_phone,
      date_of_birth,
      nationality: nationality || "سعودي",
      neighborhood,
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
      branch: targetBranch,
      registration_source: "تسجيل داخلي",
      academic_year_id: (req.sessionYear && req.sessionYear.id) ? req.sessionYear.id : (activeYear ? activeYear.id : 1),
      attachments: uploadedFiles,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const created = await createStudent(newStudent);
    if (created) {
      await addStudentHistory(created.id, "student_created", `تم إضافة الطالب ${name}`, currentUser.username);
      await addHistory("student_created", `تم إضافة الطالب ${name}`, currentUser.username);
      
      // WhatsApp notification
      await sendWhatsAppNotification(name, targetBranch, phone);

      let msg = "تم إضافة الطالب " + name + " بنجاح";
      if (siblingStudent) {
        msg = "تم إضافة الطالب بنجاح، ورقم الجوال مرتبط بطلاب آخرين (إخوة: " + siblingStudent.name + ")";
      }
      return res.redirect("/students?msg=" + encodeURIComponent(msg));
    } else {
      return res.redirect("/students?msg=" + encodeURIComponent("❌ فشل حفظ الطالب في قاعدة البيانات، يرجى المحاولة مرة أخرى"));
    }
  }
});

// POST /delete/:id
router.post("/delete/:id", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin")) return res.redirect("/");
  if (req.isReadOnlyYear) return res.redirect("/students?msg=" + encodeURIComponent("عفواً، لا يمكن حذف الطلاب في عام دراسي مؤرشف"));

  const studentId = parseInt(req.params.id);
  const student = await getStudentById(studentId);
  await deleteStudent(studentId);
  if (student) {
    await addStudentHistory(studentId, "student_deleted", `تم حذف الطالب ${student.name}`, currentUser.username);
  }
  await addHistory("student_deleted", `تم حذف الطالب رقم ${studentId}`, currentUser.username);
  res.redirect("/students?msg=" + encodeURIComponent("تم حذف الطالب بنجاح"));
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

  const matches = allStudents.filter(s => {
    const p1 = (s.phone || "").trim();
    const p2 = (s.notes || "");
    const p3 = (s.mother_phone || "").trim();
    return p1 === queryPhone || p2.includes(queryPhone) || p3 === queryPhone;
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
