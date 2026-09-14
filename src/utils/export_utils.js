/**
 * Utilities for formatting and transforming student data for exports (Excel, PDF, Reports).
 */

const STATUS_TRANSLATIONS = {
  'unavailable_grade': 'صف غير متاح',
  'صف غير متاح': 'صف غير متاح',
  'تم التسجيل': 'تم التسجيل',
  'في انتظار التسجيل': 'في انتظار التسجيل',
  'في انتظار المقابلة': 'في انتظار المقابلة',
  'لا يرغب في التسجيل': 'لا يرغب في التسجيل',
  'لم يتم التسجيل': 'لم يتم التسجيل',
  'مقبول': 'مقبول',
  'غير مقبول': 'غير مقبول',
  'لم يقابل': 'لم يقابل',
  'لم يجتز المقابلة': 'لم يجتز المقابلة'
};

/**
 * Pure function to format/translate raw followup and interview statuses into human-readable Arabic text.
 * @param {string} status - Raw status string (e.g. 'unavailable_grade')
 * @param {string} fallback - Default fallback if status is empty
 * @returns {string} - Clean Arabic label
 */
function formatStudentStatus(status, fallback = 'غير محدد') {
  if (!status || typeof status !== 'string') return fallback;
  const clean = status.trim();
  if (!clean) return fallback;
  return STATUS_TRANSLATIONS[clean] || clean;
}

/**
 * Pure function to immutably map student objects into formatted rows for exports.
 * Guarantees original student objects and array remain unmutated.
 * @param {Array} students - Original student records array
 * @param {Function} cleanNotesFn - Optional note sanitizer function
 * @returns {Array} - New array of export-ready objects
 */
function prepareExportData(students, cleanNotesFn = (n) => n || '') {
  if (!Array.isArray(students)) return [];

  return students.map((s, idx) => ({
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
    "نتيجة المقابلة": formatStudentStatus(s.interview_result, "لم يقابل"),
    "حالة المتابعة والتسجيل": formatStudentStatus(s.followup_status, "غير محدد"),
    "سبب عدم التسجيل": s.registration_reason || "",
    "الملاحظات": cleanNotesFn(s.notes || "")
  }));
}

module.exports = {
  STATUS_TRANSLATIONS,
  formatStudentStatus,
  prepareExportData
};
