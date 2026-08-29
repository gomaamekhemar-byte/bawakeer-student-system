const INTERVIEW_RESULTS = ['مقبول', 'غير مقبول', 'في انتظار المقابلة'];
const FOLLOWUP_STATUSES = ['تم التسجيل', 'في انتظار التسجيل', 'لا يرغب في التسجيل', 'لم يتم التسجيل'];
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
  manage_students: 'إدارة الطلاب',
  export_reports: 'تصدير التقارير',
  manage_users: 'إدارة المستخدمين',
  manage_years: 'إدارة الأعوام والفروع',
  view_analytics: 'عرض التحليلات',
  manage_settings: 'تهيئة البرنامج',
};

module.exports = { INTERVIEW_RESULTS, FOLLOWUP_STATUSES, STUDENT_TYPES, PHASES, GRADES, TRACKS, NATIONALITIES, ROLES, PERMISSIONS };
