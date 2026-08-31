const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser, userHasPermission } = require("../middleware/permissions");
const { getStudents } = require("../services/students.service");
const { addHistory } = require("../services/history.service");
const XLSX = require("xlsx");

// GET /export/excel - Export students as 100% valid XLSX
router.get("/export/excel", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userHasPermission(currentUser, "export_reports")) return res.redirect("/");
  
  const students = await getStudents();
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
    "نتيجة المقابلة": s.interview_result || "لم يقابل",
    "سبب عدم القبول": s.interview_reason || "",
    "حالة المتابعة": s.followup_status || "غير محدد",
    "سبب عدم التسجيل": s.registration_reason || "",
    "الملاحظات": s.notes || "",
    "عدد المرفقات": (Array.isArray(s.attachments) ? s.attachments.length : 0)
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 5 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
    { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 10 },
    { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 18 },
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
  const students = await getStudents();
  await addHistory("export_pdf", "تم فتح صفحة طباعة تقرير PDF", currentUser.username);

  const rows = students.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${s.name || ""}</strong></td>
      <td>${s.phone || ""}</td>
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
  <title>تقرير طلاب مدارس بواكير الأهلية</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Cairo', Arial, sans-serif; background: #fff; color: #1a1a1a; direction: rtl; font-size: 11pt; }
    .print-header { background: #1e3a8a; color: white; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .print-header h1 { font-size: 16pt; font-weight: 800; }
    .print-header .meta { font-size: 10pt; text-align: left; }
    .summary-cards { display: flex; gap: 10px; margin: 0 20px 16px; flex-wrap: wrap; }
    .summary-card { background: #f0f4ff; border: 1px solid #dbe4ff; border-radius: 8px; padding: 10px 16px; flex: 1; min-width: 120px; text-align: center; }
    .summary-card .num { font-size: 18pt; font-weight: 800; color: #1e3a8a; }
    .summary-card .lbl { font-size: 9pt; color: #555; font-weight: 600; }
    .table-wrapper { margin: 0 20px 20px; }
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
    <div class="summary-card"><div class="num">${students.filter(s => s.followup_status === "في انتظار التسجيل").length}</div><div class="lbl">انتظار التسجيل</div></div>
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
