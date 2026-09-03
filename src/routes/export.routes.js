const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser, userHasPermission, userMatchesScope } = require("../middleware/permissions");
const { getStudents } = require("../services/students.service");
const { getBranchNames } = require("../services/branches.service");
const { getActiveYear } = require("../services/academic_years.service");
const { addHistory } = require("../services/history.service");
const { INTERVIEW_RESULTS, FOLLOWUP_STATUSES, STUDENT_TYPES, PHASES, GRADES, TRACKS, NATIONALITIES, ROLES } = require("../utils/constants");
const XLSX = require("xlsx");

function cleanNotesForDisplay(notes) {
  if (!notes) return "";
  return notes
    .replace(/__METADATA_START__[\s\S]*?__METADATA_END__/g, "")
    .replace(/__SYSTEM_DATA__:[\s\S]*$/g, "")
    .trim();
}

function matchSourceFilter(student, sourceFilter) {
  if (!sourceFilter || sourceFilter === "الكل" || sourceFilter === "جميع المصادر") {
    return true;
  }
  const isOnline = student.registration_source === "رابط خارجي";
  if (sourceFilter === "التسجيل الخارجي (الرابط)" || sourceFilter === "رابط خارجي" || sourceFilter === "الرابط الخارجي") {
    return isOnline;
  }
  if (sourceFilter === "التسجيل الداخلي (المدرسة)" || sourceFilter === "تسجيل داخلي" || sourceFilter === "التسجيل الداخلي") {
    return !isOnline;
  }
  return true;
}

// GET /reports - Reports page
router.get("/reports", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userHasPermission(currentUser, "export_reports")) return res.redirect("/");

  const rawCookieBranch = req.cookies && req.cookies.active_branch ? req.cookies.active_branch : "";
  let activeBranch = rawCookieBranch ? decodeURIComponent(rawCookieBranch) : "";

  let students = await getStudents();
  const branches = await getBranchNames();
  const activeYear = await getActiveYear();

  if (activeBranch && activeBranch !== "الكل") {
    students = students.filter(s => s.branch === activeBranch);
  }

  if (currentUser && ["manager", "employee"].includes(currentUser.role)) {
    const userBranches = Array.isArray(currentUser.branches) ? currentUser.branches : (currentUser.branch ? [currentUser.branch] : []);
    if (userBranches.length && !userBranches.includes("الكل")) {
      activeBranch = userBranches[0];
    }
    students = students.filter(s => userMatchesScope(currentUser, s));
  } else if (activeBranch && activeBranch !== "الكل") {
    students = students.filter(s => s.branch === activeBranch);
  }

  const query = (req.query.q || "").toLowerCase().trim();
  const interviewFilter = req.query.interview_filter || "";
  const followupFilter = req.query.followup_filter || "";
  const studentTypeFilter = req.query.student_type_filter || "";
  const trackFilter = req.query.track_filter || "";
  const phaseFilter = req.query.phase_filter || "";
  const gradeFilter = req.query.grade_filter || "";
  const branchFilter = req.query.branch_filter || "";
  const sourceFilter = req.query.source_filter || "";

  let filtered = students.filter(s => {
    if (query) {
      const q = query;
      const n = (s.name || "").toLowerCase();
      const p = (s.phone || "");
      if (!n.includes(q) && !p.includes(q)) return false;
    }
    if (interviewFilter && s.interview_result !== interviewFilter) return false;
    if (followupFilter && s.followup_status !== followupFilter) return false;
    if (studentTypeFilter && s.student_type !== studentTypeFilter) return false;
    if (trackFilter && (s.track || "عام") !== trackFilter) return false;
    if (phaseFilter && s.phase !== phaseFilter) return false;
    if (gradeFilter && s.grade !== gradeFilter) return false;
    if (branchFilter && s.branch !== branchFilter) return false;
    if (!matchSourceFilter(s, sourceFilter)) return false;
    return true;
  });

  const filtered_online_count = filtered.filter(s => s.registration_source === "رابط خارجي").length;
  const filtered_internal_count = filtered.filter(s => s.registration_source !== "رابط خارجي").length;
  const filtered_total = filtered.length;
  const filtered_online_percent = filtered_total > 0 ? Math.round((filtered_online_count / filtered_total) * 1000) / 10 : 0;
  const filtered_internal_percent = filtered_total > 0 ? Math.round((filtered_internal_count / filtered_total) * 1000) / 10 : 0;

  // Demographic metrics on filtered dataset
  const boys_general_count = filtered.filter(s => s.student_type === "بنين" && (s.track === "عام" || !s.track)).length;
  const boys_tahfeez_count = filtered.filter(s => s.student_type === "بنين" && s.track === "تحفيظ").length;
  const girls_general_count = filtered.filter(s => s.student_type === "بنات" && (s.track === "عام" || !s.track)).length;
  const girls_tahfeez_count = filtered.filter(s => s.student_type === "بنات" && s.track === "تحفيظ").length;

  const stats = {
    total: students.length,
    accepted: students.filter(s => s.interview_result === "مقبول").length,
    rejected: students.filter(s => s.interview_result === "غير مقبول").length,
    registered: students.filter(s => s.followup_status === "تم التسجيل").length,
    waiting: students.filter(s => s.followup_status === "في انتظار التسجيل").length,
    not_interested: students.filter(s => s.followup_status === "لا يرغب في التسجيل").length,
    not_registered: students.filter(s => s.followup_status !== "تم التسجيل").length,
    pending_interview: students.filter(s => s.interview_result === "في انتظار المقابلة").length,
    online_count: students.filter(s => s.registration_source === "رابط خارجي").length,
    internal_count: students.filter(s => s.registration_source !== "رابط خارجي").length,
    filtered_online_count,
    filtered_internal_count,
    filtered_online_percent,
    filtered_internal_percent,
    boys_general_count,
    boys_tahfeez_count,
    girls_general_count,
    girls_tahfeez_count
  };

  res.render("reports", {
    students: filtered,
    stats,
    currentUser,
    activeBranch,
    branches,
    activeYear,
    query,
    interviewFilter,
    followupFilter,
    studentTypeFilter,
    trackFilter,
    phaseFilter,
    gradeFilter,
    branchFilter,
    sourceFilter,
    interview_results: INTERVIEW_RESULTS,
    followup_statuses: FOLLOWUP_STATUSES,
    student_types: STUDENT_TYPES,
    phases: PHASES,
    grades: GRADES,
    tracks: TRACKS,
    nationalities: NATIONALITIES,
    roles: ROLES
  });
});

// GET /export/excel - Excel export with demographic filters and columns
router.get("/export/excel", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userHasPermission(currentUser, "export_reports")) return res.redirect("/");
  
  const rawCookieBranch = req.cookies && req.cookies.active_branch ? req.cookies.active_branch : "";
  const activeBranch = rawCookieBranch ? decodeURIComponent(rawCookieBranch) : "";

  let students = await getStudents();

  if (activeBranch && activeBranch !== "الكل") {
    students = students.filter(s => s.branch === activeBranch);
  }
  if (currentUser && ["manager", "employee"].includes(currentUser.role)) {
    students = students.filter(s => userMatchesScope(currentUser, s));
  }

  const interviewFilter = req.query.interview_filter || "";
  const followupFilter = req.query.followup_filter || "";
  const studentTypeFilter = req.query.student_type_filter || "";
  const trackFilter = req.query.track_filter || "";
  const phaseFilter = req.query.phase_filter || "";
  const gradeFilter = req.query.grade_filter || "";
  const branchFilter = req.query.branch_filter || "";
  const sourceFilter = req.query.source_filter || "";

  if (interviewFilter) students = students.filter(s => s.interview_result === interviewFilter);
  if (followupFilter) students = students.filter(s => s.followup_status === followupFilter);
  if (studentTypeFilter) students = students.filter(s => s.student_type === studentTypeFilter);
  if (trackFilter) students = students.filter(s => (s.track || "عام") === trackFilter);
  if (phaseFilter) students = students.filter(s => s.phase === phaseFilter);
  if (gradeFilter) students = students.filter(s => s.grade === gradeFilter);
  if (branchFilter) students = students.filter(s => s.branch === branchFilter);
  if (sourceFilter) students = students.filter(s => matchSourceFilter(s, sourceFilter));

  const rows = students.map((s, idx) => ({
    "م": idx + 1,
    "اسم الطالب": s.name || "",
    "نوع الطالب": s.student_type || "بنين",
    "المسار التعليمي": s.track || "عام",
    "رقم جوال ولي الأمر": s.phone || "",
    "رقم جوال إضافي": s.mother_phone || "",
    "تاريخ الميلاد": s.date_of_birth || "",
    "الجنسية": s.nationality || "سعودي",
    "الحي السكني": s.neighborhood || "",
    "المرحلة الدراسية": s.phase || "",
    "الصف": s.grade || "",
    "الفرع": s.branch || "",
    "مصدر التسجيل": s.registration_source || "تسجيل داخلي",
    "نتيجة المقابلة": s.interview_result || "لم يقابل",
    "حالة المتابعة والتسجيل": s.followup_status || "غير محدد",
    "سبب عدم التسجيل": s.registration_reason || "",
    "الملاحظات": cleanNotesForDisplay(s.notes || "")
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 5 }, { wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 12 },
    { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 20 }, { wch: 25 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, "كشف الطلاب");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
  await addHistory("export_excel", "تم تصدير كشف الطلاب بصيغة Excel مع فلترة ديموغرافية شاملة", currentUser.username);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="bawakeer_students.xlsx"');
  res.setHeader("Content-Length", buf.length);
  res.setHeader("Cache-Control", "no-cache");
  res.end(buf);
});

// GET /export/pdf - Print-ready HTML report with demographic filters and columns
router.get("/export/pdf", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userHasPermission(currentUser, "export_reports")) return res.redirect("/");
  
  const rawCookieBranch = req.cookies && req.cookies.active_branch ? req.cookies.active_branch : "";
  const activeBranch = rawCookieBranch ? decodeURIComponent(rawCookieBranch) : "";

  let students = await getStudents();

  if (activeBranch && activeBranch !== "الكل") {
    students = students.filter(s => s.branch === activeBranch);
  }
  if (currentUser && ["manager", "employee"].includes(currentUser.role)) {
    students = students.filter(s => userMatchesScope(currentUser, s));
  }

  const interviewFilter = req.query.interview_filter || "";
  const followupFilter = req.query.followup_filter || "";
  const studentTypeFilter = req.query.student_type_filter || "";
  const trackFilter = req.query.track_filter || "";
  const phaseFilter = req.query.phase_filter || "";
  const gradeFilter = req.query.grade_filter || "";
  const branchFilter = req.query.branch_filter || "";
  const sourceFilter = req.query.source_filter || "";

  if (interviewFilter) students = students.filter(s => s.interview_result === interviewFilter);
  if (followupFilter) students = students.filter(s => s.followup_status === followupFilter);
  if (studentTypeFilter) students = students.filter(s => s.student_type === studentTypeFilter);
  if (trackFilter) students = students.filter(s => (s.track || "عام") === trackFilter);
  if (phaseFilter) students = students.filter(s => s.phase === phaseFilter);
  if (gradeFilter) students = students.filter(s => s.grade === gradeFilter);
  if (branchFilter) students = students.filter(s => s.branch === branchFilter);
  if (sourceFilter) students = students.filter(s => matchSourceFilter(s, sourceFilter));

  const boys_general_count = students.filter(s => s.student_type === "بنين" && (s.track === "عام" || !s.track)).length;
  const boys_tahfeez_count = students.filter(s => s.student_type === "بنين" && s.track === "تحفيظ").length;
  const girls_general_count = students.filter(s => s.student_type === "بنات" && (s.track === "عام" || !s.track)).length;
  const girls_tahfeez_count = students.filter(s => s.student_type === "بنات" && s.track === "تحفيظ").length;

  const total = students.length;
  const accepted = students.filter(s => s.interview_result === "مقبول").length;
  const registered = students.filter(s => s.followup_status === "تم التسجيل").length;
  const activeYear = await getActiveYear();

  let filterDesc = [];
  if (branchFilter) filterDesc.push(`الفرع: ${branchFilter}`);
  if (phaseFilter) filterDesc.push(`المرحلة: ${phaseFilter}`);
  if (gradeFilter) filterDesc.push(`الصف: ${gradeFilter}`);
  if (studentTypeFilter) filterDesc.push(`النوع: ${studentTypeFilter}`);
  if (trackFilter) filterDesc.push(`المسار: ${trackFilter}`);
  if (sourceFilter) filterDesc.push(`مصدر التسجيل: ${sourceFilter}`);
  if (interviewFilter) filterDesc.push(`نتيجة المقابلة: ${interviewFilter}`);
  if (followupFilter) filterDesc.push(`حالة المتابعة: ${followupFilter}`);
  const filterSummary = filterDesc.length ? filterDesc.join(" | ") : "جميع الطلاب بدون فلترة";

  const printDate = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>تقرير طلاب مدارس بواكير الأهلية</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
    body { font-family: 'Cairo', sans-serif; margin: 0; padding: 15px; color: #1e293b; background: #fff; font-size: 11px; }
    .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 12px; }
    .logo-text { font-size: 20px; font-weight: 800; color: #1e3a8a; }
    .sub-title { font-size: 13px; color: #64748b; font-weight: 600; }
    .filter-badge { display: inline-block; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px 12px; font-size: 10px; margin-top: 6px; color: #334155; }
    .stats-bar { display: flex; gap: 8px; margin-bottom: 12px; }
    .stat-box { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; text-align: center; background: #f8fafc; }
    .stat-val { font-size: 14px; font-weight: 800; color: #1e3a8a; }
    .stat-lbl { font-size: 9px; color: #64748b; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 10px; }
    th { background: #1e3a8a; color: white; padding: 6px 4px; text-align: right; border: 1px solid #cbd5e1; font-weight: 700; }
    td { padding: 5px 4px; border: 1px solid #e2e8f0; vertical-align: middle; }
    tr:nth-child(even) { background: #f8fafc; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; }
    .badge-success { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .badge-danger { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .badge-warning { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .badge-info { background: #e0f2fe; color: #075985; border: 1px solid #7dd3fc; }
    .footer { margin-top: 15px; border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
    @media print { @page { size: landscape; margin: 8mm; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-text">مدارس بواكير الأهلية</div>
    <div class="sub-title">كشف بيانات الطلاب والتحليل الديموغرافي | ${activeYear ? activeYear.year_name : "العام الدراسي الحالي"}</div>
    <div class="filter-badge">📌 معايير التصفية: ${filterSummary}</div>
  </div>

  <div class="stats-bar">
    <div class="stat-box"><div class="stat-val">${total}</div><div class="stat-lbl">إجمالي نتائج الكشف</div></div>
    <div class="stat-box"><div class="stat-val" style="color:#166534;">${accepted}</div><div class="stat-lbl">المقبولين</div></div>
    <div class="stat-box"><div class="stat-val" style="color:#2563eb;">${registered}</div><div class="stat-lbl">تم التسجيل</div></div>
    <div class="stat-box"><div class="stat-val" style="color:#0284c7;">${boys_general_count}</div><div class="stat-lbl">بنين (عام)</div></div>
    <div class="stat-box"><div class="stat-val" style="color:#0369a1;">${boys_tahfeez_count}</div><div class="stat-lbl">بنين (تحفيظ)</div></div>
    <div class="stat-box"><div class="stat-val" style="color:#db2777;">${girls_general_count}</div><div class="stat-lbl">بنات (عام)</div></div>
    <div class="stat-box"><div class="stat-val" style="color:#be185d;">${girls_tahfeez_count}</div><div class="stat-lbl">بنات (تحفيظ)</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:25px; text-align:center;">#</th>
        <th>اسم الطالب</th>
        <th>النوع</th>
        <th>المسار</th>
        <th>الجوال</th>
        <th>المرحلة والصف</th>
        <th>الفرع</th>
        <th>مصدر التسجيل</th>
        <th>المقابلة</th>
        <th>حالة المتابعة</th>
        <th>ملاحظات</th>
      </tr>
    </thead>
    <tbody>
      ${students.map((s, idx) => `
        <tr>
          <td style="text-align:center; color:#94a3b8; font-weight:700;">${idx + 1}</td>
          <td style="font-weight:700; color:#0f172a;">${s.name || ""}</td>
          <td><span class="badge ${s.student_type === 'بنات' ? 'badge-danger' : 'badge-info'}">${s.student_type || "بنين"}</span></td>
          <td><span class="badge badge-warning">${s.track || "عام"}</span></td>
          <td style="direction:ltr; text-align:right;">${s.phone || "—"}</td>
          <td>${s.phase || ""} ${s.grade ? ("- صف " + s.grade) : ""}</td>
          <td>${s.branch || ""}</td>
          <td><span class="badge ${s.registration_source === 'رابط خارجي' ? 'badge-info' : ''}">${s.registration_source || "تسجيل داخلي"}</span></td>
          <td>
            <span class="badge ${s.interview_result === 'مقبول' ? 'badge-success' : s.interview_result === 'غير مقبول' ? 'badge-danger' : 'badge-warning'}">
              ${s.interview_result || "لم يقابل"}
            </span>
          </td>
          <td>
            <span class="badge ${s.followup_status === 'تم التسجيل' ? 'badge-info' : s.followup_status === 'صف غير متاح' ? 'badge-warning' : s.followup_status === 'لا يرغب في التسجيل' ? 'badge-danger' : 'badge-warning'}">
              ${s.followup_status || "غير محدد"}
            </span>
          </td>
          <td style="color:#64748b;">${cleanNotesForDisplay(s.notes || "")}</td>
        </tr>
      `).join("")}
      ${!students.length ? `<tr><td colspan="11" style="text-align:center; padding:20px; color:#94a3b8;">لا توجد بيانات مطابقة لمعايير البحث</td></tr>` : ""}
    </tbody>
  </table>

  <div class="footer">
    <span>نظام إدارة الطلاب — مدارس بواكير الأهلية</span>
    <span>تاريخ الطباعة: ${printDate}</span>
    <span>طُبع بواسطة: ${currentUser.full_name || currentUser.username}</span>
  </div>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

  await addHistory("export_pdf", "تم تصدير وطباعة كشف الطلاب بصيغة PDF مع التفصيل الديموغرافي", currentUser.username);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

module.exports = router;
