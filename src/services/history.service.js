const supabase = require('../config/supabase');

async function addHistory(action, details, username) {
  const { error } = await supabase.from('history').insert([{
    action, details, username: username || 'غير معروف', timestamp: new Date().toISOString()
  }]);
  if (error) console.error('addHistory error:', error);
}

async function getHistory() {
  const { data, error } = await supabase.from('history').select('*').order('timestamp', { ascending: false });
  if (error) return [];
  return data || [];
}

async function addStudentHistory(studentId, action, details, username, fieldChanges) {
  const { error } = await supabase.from('student_history').insert([{
    student_id: studentId, action, details, username: username || 'غير معروف',
    timestamp: new Date().toISOString(), field_changes: fieldChanges || []
  }]);
  if (error) console.error('addStudentHistory error:', error);
}

async function getStudentHistory(studentId) {
  const { data, error } = await supabase.from('student_history').select('*').eq('student_id', studentId).order('timestamp', { ascending: false });
  if (error) return [];
  return data || [];
}

function computeFieldChanges(oldStudent, newData) {
  const tracked = {
    name: 'الاسم', phone: 'رقم الجوال', date_of_birth: 'تاريخ الميلاد',
    nationality: 'الجنسية', neighborhood: 'الحي', interview_date: 'تاريخ المقابلة',
    interview_result: 'نتيجة المقابلة', interview_reason: 'سبب عدم الاجتياز',
    followup_status: 'حالة المتابعة', registration_reason: 'سبب عدم التسجيل',
    student_type: 'نوع الطالب', track: 'المسار', phase: 'المرحلة',
    grade: 'الصف', notes: 'ملاحظات', branch: 'الفرع'
  };
  const changes = [];
  for (const [field, label] of Object.entries(tracked)) {
    const oldVal = String(oldStudent[field] || '').trim();
    const newVal = String(newData[field] || '').trim();
    if (oldVal !== newVal) {
      changes.push({ field, field_label: label, old_value: oldVal || '—', new_value: newVal || '—' });
    }
  }
  return changes;
}

module.exports = { addHistory, getHistory, addStudentHistory, getStudentHistory, computeFieldChanges };
