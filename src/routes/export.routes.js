const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser, userHasPermission } = require("../middleware/permissions");
const { getStudents } = require("../services/students.service");
const { addHistory } = require("../services/history.service");
const XLSX = require("xlsx");
const PDFDocument = require("pdfkit");

// GET /export/excel
router.get("/export/excel", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userHasPermission(currentUser, "export_reports")) return res.redirect("/");
  const students = await getStudents();
  const rows = students.map(s => ({
    "\u0627\u0644\u0627\u0633\u0645": s.name || "",
    "\u0631\u0642\u0645 \u0627\u0644\u062c\u0648\u0627\u0644": s.phone || "",
    "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0645\u064a\u0644\u0627\u062f": s.date_of_birth || "",
    "\u0627\u0644\u0639\u0645\u0631": s.age || "",
    "\u0627\u0644\u062c\u0646\u0633\u064a\u0629": s.nationality || "",
    "\u0627\u0644\u062d\u064a": s.neighborhood || "",
    "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0645\u0642\u0627\u0628\u0644\u0629": s.interview_date || "",
    "\u0646\u062a\u064a\u062c\u0629 \u0627\u0644\u0645\u0642\u0627\u0628\u0644\u0629": s.interview_result || "",
    "\u0633\u0628\u0628 \u0639\u062f\u0645 \u0627\u0644\u0627\u062c\u062a\u064a\u0627\u0632": s.interview_reason || "",
    "\u062d\u0627\u0644\u0629 \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629": s.followup_status || "",
    "\u0633\u0628\u0628 \u0639\u062f\u0645 \u0627\u0644\u062a\u0633\u062c\u064a\u0644": s.registration_reason || "",
    "\u0646\u0648\u0639 \u0627\u0644\u0637\u0627\u0644\u0628": s.student_type || "",
    "\u0627\u0644\u0645\u0633\u0627\u0631": s.track || "",
    "\u0627\u0644\u0645\u0631\u062d\u0644\u0629": s.phase || "",
    "\u0627\u0644\u0635\u0641": s.grade || "",
    "\u0627\u0644\u0641\u0631\u0639": s.branch || "",
    "\u0645\u0644\u0627\u062d\u0638\u0627\u062a": s.notes || "",
    "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062a\u062d\u062f\u064a\u062b": s.updated_at || "",
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "\u0627\u0644\u0637\u0644\u0627\u0628");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  await addHistory("export_excel", "\u062a\u0645 \u062a\u0635\u062f\u064a\u0631 \u0645\u0644\u0641 Excel", currentUser.username);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=students.xlsx");
  res.send(buf);
});

// GET /export/pdf
router.get("/export/pdf", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userHasPermission(currentUser, "export_reports")) return res.redirect("/");
  const students = await getStudents();
  await addHistory("export_pdf", "\u062a\u0645 \u062a\u0635\u062f\u064a\u0631 \u0645\u0644\u0641 PDF", currentUser.username);

  const doc = new PDFDocument({ size: "A4", margin: 40, rtl: false });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=students.pdf");
  doc.pipe(res);

  // Title
  doc.fontSize(20).text("Student Report - Bawakeer Schools", { align: "center" });
  doc.moveDown();

  // Table header
  const cols = ["Name", "Phone", "Interview Result", "Followup Status", "Phase", "Grade"];
  const colWidths = [120, 90, 100, 110, 70, 50];
  let x = 40;
  const headerY = doc.y;
  doc.fontSize(9).fillColor("white");
  doc.rect(40, headerY, 542, 20).fill("#17324d");
  cols.forEach((col, i) => {
    doc.fillColor("white").text(col, x + 2, headerY + 5, { width: colWidths[i], align: "left" });
    x += colWidths[i];
  });
  doc.fillColor("black");
  doc.moveDown(0.5);

  // Table rows
  students.forEach((s, idx) => {
    const y = doc.y;
    if (y > 750) { doc.addPage(); }
    const rowY = doc.y;
    const rowH = 18;
    if (idx % 2 === 0) doc.rect(40, rowY, 542, rowH).fill("#f8f9fa");
    doc.fillColor("#17324d");
    x = 40;
    const vals = [s.name || "", s.phone || "", s.interview_result || "-", s.followup_status || "-", s.phase || "-", s.grade || "-"];
    vals.forEach((val, i) => {
      doc.fontSize(8).text(val.substring(0, 20), x + 2, rowY + 5, { width: colWidths[i] - 4, align: "left" });
      x += colWidths[i];
    });
    doc.y = rowY + rowH;
  });

  doc.end();
});

module.exports = router;
