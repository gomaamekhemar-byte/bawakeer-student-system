const INTERVIEW_RESULTS = ['في انتظار المقابلة', 'مقبول', 'غير مقبول'];
const FOLLOWUP_STATUSES = ['في انتظار المقابلة', 'في انتظار التسجيل', 'تم التسجيل', 'صف غير متاح', 'لا يرغب في التسجيل', 'لم يجتز المقابلة', 'لم يتم التسجيل'];
const STUDENT_TYPES = ['بنين', 'بنات'];
const PHASES = ['روضة', 'ابتدائي', 'متوسط', 'ثانوي'];
const GRADES = ['1', '2', '3', '4', '5', '6'];
const TRACKS = ['عام', 'تحفيظ'];
const NATIONALITIES = ['سعودي', 'مصري', 'سوري', 'أردني', 'يمني', 'فلسطيني', 'أخرى'];

const PHASE_STRUCTURE = {
  'روضة': {
    grades: [
      { id: '1', name: 'روضة أولى (KG1)' },
      { id: '2', name: 'روضة ثانية (KG2)' },
      { id: '3', name: 'تمهيدي (KG3)' }
    ],
    tracks: ['عام']
  },
  'ابتدائي': {
    grades: [
      { id: '1', name: 'الصف الأول الابتدائي' },
      { id: '2', name: 'الصف الثاني الابتدائي' },
      { id: '3', name: 'الصف الثالث الابتدائي' },
      { id: '4', name: 'الصف الرابع الابتدائي' },
      { id: '5', name: 'الصف الخامس الابتدائي' },
      { id: '6', name: 'الصف السادس الابتدائي' }
    ],
    tracks: ['عام', 'تحفيظ']
  },
  'متوسط': {
    grades: [
      { id: '1', name: 'الصف الأول المتوسط' },
      { id: '2', name: 'الصف الثاني المتوسط' },
      { id: '3', name: 'الصف الثالث المتوسط' }
    ],
    tracks: ['عام', 'تحفيظ']
  },
  'ثانوي': {
    grades: [
      { id: '1', name: 'الصف الأول الثانوي' },
      { id: '2', name: 'الصف الثاني الثانوي' },
      { id: '3', name: 'الصف الثالث الثانوي' }
    ],
    tracks: ['عام']
  }
};

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

module.exports = {
  INTERVIEW_RESULTS,
  FOLLOWUP_STATUSES,
  STUDENT_TYPES,
  PHASES,
  GRADES,
  TRACKS,
  NATIONALITIES,
  PHASE_STRUCTURE,
  ROLES,
  PERMISSIONS
};
