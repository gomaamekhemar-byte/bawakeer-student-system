const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser, userHasPermission } = require("../middleware/permissions");
const { getStudents } = require("../services/students.service");
const { addHistory } = require("../services/history.service");
const XLSX = require("xlsx");

// GET /export/excel - Export students as XLSX (fixed for Excel compatibility)
router.get("/export/excel", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userHasPermission(currentUser, "export_reports")) return res.redirect("/");
  const students = await getStudents();
  const rows = students.map(s => ({
    "الاسم": s.name || "",
    "رقم جوال الأب": s.phone || "",
    "رقم جوال الأم": s.mother_phone || "",
    "تاريخ الميلاد": s.date_of_birth || "",
    "العمر": s.age || "",
    "الجنسية": s.nationality || "",
    "الحي السكني": s.neighborhood || "",
    "نتيجة المقابلة": s.interview_result || "",
    "سبب عدم الاجتياز": s.interview_reason || "",
    "حالة المتابعة": s.followup_status || "",
    "سبب عدم التسجيل": s.registration_reason || "",
    "نوع الطالب": s.student_type || "",
    "المسار": s.track || "",
    "المرحلة": s.phase || "",
    "الصف": s.grade || "",
    "الفرع": s.branch || "",
    "ملاحظات": s.notes || "",
    "تاريخ التحديث": s.updated_at || "",
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths for readability
  ws["!cols"] = [
    { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 14 }, { wch: 6 },
    { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 20 },
    { wch: 20 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 6 },
    { wch: 10 }, { wch: 25 }, { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "الطلاب");

  // Use buffer type for binary-safe transmission
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

  await addHistory("export_excel", "تم تصدير ملف Excel", currentUser.username);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="students_bawakeer.xlsx"');
  res.setHeader("Content-Length", buf.length);
  res.setHeader("Cache-Control", "no-cache");
  res.end(buf);
});

// GET /export/pdf - Print-ready Arabic RTL page (opens in new window for browser print)
router.get("/export/pdf", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userHasPermission(currentUser, "export_reports")) return res.redirect("/");
  const students = await getStudents();
  await addHistory("export_pdf", "تم فتح صفحة طباعة PDF", currentUser.username);

  const rows = students.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${s.name || ""}</td>
      <td>${s.phone || ""}</td>
      <td>${s.mother_phone || ""}</td>
      <td>${s.nationality || ""}</td>
      <td>${s.phase || ""} ${s.grade ? "- صف " + s.grade : ""}</td>
      <td>${s.branch || ""}</td>
      <td class="interview-${s.interview_result === "مقبول" ? "accepted" : s.interview_result === "غير مقبول" ? "rejected" : "pending"}">${s.interview_result || "لم يقابل"}</td>
      <td class="followup-${s.followup_status === "تم التسجيل" ? "registered" : s.followup_status === "في انتظار التسجيل" ? "waiting" : "other"}">${s.followup_status || "غير محدد"}</td>
      <td>${s.notes || ""}</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>تقرير طلاب مدارس بواكير الأهلية</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Cairo', 'Segoe UI', Arial, sans-serif; background: #fff; color: #1a1a1a; direction: rtl; font-size: 11pt; }
    .print-header { background: #1e3a8a; color: white; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .print-header h1 { font-size: 16pt; font-weight: 800; }
    .print-header .meta { font-size: 10pt; text-align: left; }
    .summary-cards { display: flex; gap: 10px; margin: 0 20px 16px; flex-wrap: wrap; }
    .summary-card { background: #f0f4ff; border: 1px solid #dbe4ff; border-radius: 8px; padding: 10px 16px; flex: 1; min-width: 120px; text-align: center; }
    .summary-card .num { font-size: 20pt; font-weight: 800; color: #1e3a8a; }
    .summary-card .lbl { font-size: 9pt; color: #555; font-weight: 600; }
    .table-wrapper { margin: 0 20px 20px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    thead tr { background: #1e3a8a; color: white; }
    thead th { padding: 10px 8px; font-weight: 700; text-align: right; border: 1px solid #2d4fa0; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody tr:nth-child(odd) { background: #ffffff; }
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
      .print-header { -webkit-print-color-adjust: exact; }
      thead tr { -webkit-print-color-adjust: exact; }
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
      <div>طبع بواسطة: ${currentUser.full_name || currentUser.username}</div>
    </div>
  </div>
  <div class="summary-cards">
    <div class="summary-card"><div class="num">${students.length}</div><div class="lbl">إجمالي الطلاب</div></div>
    <div class="summary-card"><div class="num">${students.filter(s => s.interview_result === "مقبول").length}</div><div class="lbl">مقبول</div></div>
    <div class="summary-card"><div class="num">${students.filter(s => s.interview_result === "غير مقبول").length}</div><div class="lbl">غير مقبول</div></div>
    <div class="summary-card"><div class="num">${students.filter(s => s.followup_status === "تم التسجيل").length}</div><div class="lbl">تم التسجيل</div></div>
    <div class="summary-card"><div class="num">${students.filter(s => s.followup_status === "في انتظار التسجيل").length}</div><div class="lbl">انتظار التسجيل</div></div>
    <div class="summary-card"><div class="num">${students.filter(s => s.interview_result === "في انتظار المقابلة").length}</div><div class="lbl">انتظار المقابلة</div></div>
  </div>
  <div class="table-wrapper">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>اسم الطالب</th>
          <th>جوال الأب</th>
          <th>جوال الأم</th>
          <th>الجنسية</th>
          <th>المرحلة والصف</th>
          <th>الفرع</th>
          <th>نتيجة المقابلة</th>
          <th>حالة المتابعة</th>
          <th>ملاحظات</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="print-footer">نظام إدارة قبول وتسجيل الطلاب — مدارس بواكير الأهلية | ${new Date().toLocaleDateString("ar-SA")}</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

module.exports = router;