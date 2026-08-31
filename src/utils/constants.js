const INTERVIEW_RESULTS = ['في انتظار المقابلة', 'مقبول', 'غير مقبول'];
const FOLLOWUP_STATUSES = ['في انتظار المقابلة', 'في انتظار التسجيل', 'تم التسجيل', 'لا يرغب في التسجيل', 'لم يجتز المقابلة', 'لم يتم التسجيل'];
const STUDENT_TYPES = ['بنين', 'بنات'];
const PHASES = ['روضة', 'ابتدائي', 'متوسط', 'ثانوي'];
const GRADES = ['1', '2', '3', '4', '5', '6'];
const TRACKS = ['عام', 'تحفيظ'];
const NATIONALITIES = ['سعودي', 'مصري', 'سوري', 'أردني', 'يمني', 'فلسطيني', 'أخرى'];
const ROLES = {
  admin: 'مدير النظام',
  manager: 'مدير المتابعة',
  employee: 'موظف',
  viewer: 'مشاهد',
};
const PERMISSIONS = {
  view_students: 'عرض الطلاب',
  manage_students: 'إدارة الطلاب الأساسية',
  manage_interviews: 'مسؤول المقابلات (تعديل نتيجة المقابلة)',
  manage_registration: 'مسؤول التسجيل (تعديل حالة التسجيل والمتابعة)',
  export_reports: 'تصدير التقارير',
  manage_users: 'إدارة المستخدمين',
  manage_years: 'إدارة الأعوام والفروع',
  view_analytics: 'عرض التحليلات',
  manage_settings: 'تهيئة البرنامج',
};

module.exports = { INTERVIEW_RESULTS, FOLLOWUP_STATUSES, STUDENT_TYPES, PHASES, GRADES, TRACKS, NATIONALITIES, ROLES, PERMISSIONS };
