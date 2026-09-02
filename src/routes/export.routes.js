const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser, userHasPermission, userMatchesScope, userCan } = require("../middleware/permissions");
const { getStudents } = require("../services/students.service");
const { getBranchNames } = require("../services/branches.service");
const { getActiveYear } = require("../services/academic_years.service");
const { addHistory } = require("../services/history.service");
const { INTERVIEW_RESULTS, FOLLOWUP_STATUSES, STUDENT_TYPES, PHASES, GRADES, TRACKS, NATIONALITIES, ROLES } = require("../utils/constants");
const { cleanNotesForDisplay } = require("../utils/timeline");
const XLSX = require("xlsx");

// GET /reports - Reports & Export Center View
router.get("/reports", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userHasPermission(currentUser, "export_reports")) return res.redirect("/");
  
  const rawCookieBranch = req.cookies && req.cookies.active_branch ? req.cookies.active_branch : "";
  let activeBranch = rawCookieBranch ? decodeURIComponent(rawCookieBranch) : "";

  let students = await getStudents();
  const branches = await getBranchNames();
  const activeYear = await getActiveYear();

  const sessionYear = req.sessionYear;
  if (sessionYear && sessionYear.id) {
    students = students.filter(s => String(s.academic_year_id || (activeYear ? activeYear.id : "")) === String(sessionYear.id));
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
    if (phaseFilter && s.phase !== phaseFilter) return false;
    if (gradeFilter && s.grade !== gradeFilter) return false;
    if (branchFilter && s.branch !== branchFilter) return false;
    if (sourceFilter && s.registration_source !== sourceFilter) return false;
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
    online_count: students.filter(s => s.registration_source === "رابط خارجي").length,
    internal_count: students.filter(s => s.registration_source !== "رابط خارجي").length,
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
    canManageStudents: userCan(currentUser, "admin", "manager", "employee") && userHasPermission(currentUser, "manage_students"),
    canManageUsers: userCan(currentUser, "admin") && userHasPermission(currentUser, "manage_users"),
    canManageYears: userCan(currentUser, "admin") && userHasPermission(currentUser, "manage_years"),
    canViewAnalytics: userHasPermission(currentUser, "view_analytics"),
    roles: ROLES
  });
});

// GET /export/excel - Export students matching filters as 100% valid XLSX
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
  const phaseFilter = req.query.phase_filter || "";
  const branchFilter = req.query.branch_filter || "";
  const sourceFilter = req.query.source_filter || "";

  if (interviewFilter) students = students.filter(s => s.interview_result === interviewFilter);
  if (followupFilter) students = students.filter(s => s.followup_status === followupFilter);
  if (phaseFilter) students = students.filter(s => s.phase === phaseFilter);
  if (branchFilter) students = students.filter(s => s.branch === branchFilter);
  if (sourceFilter) students = students.filter(s => s.registration_source === sourceFilter);

  const rows = students.map((s, idx) => ({
    "م": idx + 1,
    "اسم الطالب": s.name || "",
    "رقم جوال ولي الأمر": s.phone || "",
    "رقم جوال إضافي": s.mother_phone || "",
    "تاريخ الميلاد": s.date_of_birth || "",
    "الجنسية": s.nationality || "سعودي",
    "الحي السكني": s.neighborhood || "",
    "المرحلة الدراسية": s.phase || "",
    "الصف": s.grade || "",
    "المسار": s.track || "",
    "نوع الطالب": s.student_type || "بنين",
    "الفرع": s.branch || "",
    "مصدر التسجيل": s.registration_source || "تسجيل داخلي",
    "نتيجة المقابلة": s.interview_result || "لم يقابل",
    "سبب عدم القبول": s.interview_reason || "",
    "حالة المتابعة": s.followup_status || "غير محدد",
    "سبب عدم التسجيل": s.registration_reason || "",
    "الملاحظات": cleanNotesForDisplay(s.notes || ""),
    "عدد المرفقات": (Array.isArray(s.attachments) ? s.attachments.length : 0)
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 5 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
    { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 10 },
    { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 16 }, { wch: 22 }, { wch: 18 },
    { wch: 20 }, { wch: 25 }, { wch: 12 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, "كشف الطلاب");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
  await addHistory("export_excel", "تم تصدير كشف الطلاب بصيغة Excel", currentUser.username);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="bawakeer_students.xlsx"');
  res.setHeader("Content-Length", buf.length);
  res.setHeader("Cache-Control", "no-cache");
  res.end(buf);
});

// GET /export/pdf - Print-ready HTML report
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
  const phaseFilter = req.query.phase_filter || "";
  const branchFilter = req.query.branch_filter || "";
  const sourceFilter = req.query.source_filter || "";

  if (interviewFilter) students = students.filter(s => s.interview_result === interviewFilter);
  if (followupFilter) students = students.filter(s => s.followup_status === followupFilter);
  if (phaseFilter) students = students.filter(s => s.phase === phaseFilter);
  if (branchFilter) students = students.filter(s => s.branch === branchFilter);
  if (sourceFilter) students = students.filter(s => s.registration_source === sourceFilter);

  await addHistory("export_pdf", "تم عرض تقرير كشف الطلاب للطباعة", currentUser.username);

  let rows = "";
  students.forEach((s, idx) => {
    let intCls = "interview-pending";
    if (s.interview_result === "مقبول") intCls = "interview-accepted";
    else if (s.interview_result === "غير مقبول") intCls = "interview-rejected";

    let folCls = "followup-other";
    if (s.followup_status === "تم التسجيل") folCls = "followup-registered";
    else if (s.followup_status === "في انتظار التسجيل") folCls = "followup-waiting";

    rows += `<tr>
      <td style="text-align:center;">${idx + 1}</td>
      <td style="font-weight:700;">${s.name || "—"}</td>
      <td style="direction:ltr; text-align:right;">${s.phone || "—"}</td>
      <td>${s.nationality || "سعودي"}</td>
      <td>${s.phase || "—"} - ${s.grade ? "صف " + s.grade : ""}</td>
      <td>${s.branch || "—"}</td>
      <td style="font-weight:600; color:${s.registration_source === 'رابط خارجي' ? '#0891b2' : '#64748b'};">${s.registration_source || "تسجيل داخلي"}</td>
      <td class="${intCls}">${s.interview_result || "لم يقابل"}</td>
      <td class="${folCls}">${s.followup_status || "غير محدد"}</td>
      <td>${cleanNotesForDisplay(s.notes || "") || "—"}</td>
    </tr>`;
  });

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>تقرير الطلاب | مدارس بواكير الأهلية</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Cairo', sans-serif; background: #fff; color: #1e293b; direction: rtl; }
    .print-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 3px solid #1e3a8a; }
    .print-header h1 { font-size: 18pt; color: #1e3a8a; font-weight: 800; }
    .print-header .meta { font-size: 10pt; color: #64748b; text-align: left; }
    .summary-cards { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; padding: 14px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .summary-card { background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; text-align: center; }
    .summary-card .num { font-size: 16pt; font-weight: 800; color: #1e3a8a; }
    .summary-card .lbl { font-size: 9pt; color: #64748b; font-weight: 600; }
    .table-wrapper { padding: 16px 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    thead th { background: #1e3a8a; color: white; padding: 8px 6px; font-weight: 700; border: 1px solid #1e3a8a; text-align: right; }
    tbody td { padding: 8px; border: 1px solid #e2e8f0; vertical-align: middle; }
    .interview-accepted { color: #15803d; font-weight: 700; }
    .interview-rejected { color: #dc2626; font-weight: 700; }
    .interview-pending { color: #d97706; font-weight: 700; }
    .followup-registered { color: #0891b2; font-weight: 700; }
    .followup-waiting { color: #d97706; font-weight: 700; }
    .followup-other { color: #6b7280; }
    .print-footer { text-align: center; font-size: 9pt; color: #666; margin: 16px 20px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
    .no-print { display: flex; gap: 12px; justify-content: center; padding: 16px; background: #f4f6f9; border-bottom: 1px solid #e2e8f0; }
    .no-print button { padding: 10px 28px; font-size: 12pt; font-family: Cairo, sans-serif; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; }
    .btn-print { background: #1e3a8a; color: white; }
    .btn-close-win { background: #6b7280; color: white; }
    @media print {
      .no-print { display: none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { margin: 1cm; size: A4 landscape; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ طباعة التقرير</button>
    <button class="btn-close-win" onclick="window.close()">✖ إغلاق</button>
  </div>
  <div class="print-header">
    <h1>📋 تقرير طلاب مدارس بواكير الأهلية</h1>
    <div class="meta">
      <div>إجمالي الطلاب: ${students.length}</div>
      <div>تاريخ الطباعة: ${new Date().toLocaleDateString("ar-SA")}</div>
    </div>
  </div>
  <div class="summary-cards">
    <div class="summary-card"><div class="num">${students.length}</div><div class="lbl">إجمالي الطلاب</div></div>
    <div class="summary-card"><div class="num">${students.filter(s => s.interview_result === "مقبول").length}</div><div class="lbl">مقبول</div></div>
    <div class="summary-card"><div class="num">${students.filter(s => s.interview_result === "غير مقبول").length}</div><div class="lbl">غير مقبول</div></div>
    <div class="summary-card"><div class="num">${students.filter(s => s.followup_status === "تم التسجيل").length}</div><div class="lbl">تم التسجيل</div></div>
    <div class="summary-card"><div class="num">${students.filter(s => s.registration_source === "رابط خارجي").length}</div><div class="lbl">أونلاين (إعلانات)</div></div>
    <div class="summary-card"><div class="num">${students.filter(s => s.registration_source !== "رابط خارجي").length}</div><div class="lbl">تسجيل حضوري</div></div>
  </div>
  <div class="table-wrapper">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>اسم الطالب</th>
          <th>رقم الجوال</th>
          <th>الجنسية</th>
          <th>المرحلة والصف</th>
          <th>الفرع</th>
          <th>المصدر</th>
          <th>نتيجة المقابلة</th>
          <th>حالة المتابعة</th>
          <th>ملاحظات</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="print-footer">نظام إدارة قبول وتسجيل الطلاب — مدارس بواكير الأهلية</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

module.exports = router;
