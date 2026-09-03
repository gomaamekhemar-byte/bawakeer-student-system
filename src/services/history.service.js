const supabase = require('../config/supabase');

async function addHistory(action, details, username, recordSnapshot) {
  const insertPayload = {
    action,
    details: details || '',
    username: username || 'غير معروف',
    timestamp: new Date().toISOString()
  };
  if (recordSnapshot) {
    insertPayload.record_snapshot = recordSnapshot;
  }

  try {
    const { error } = await supabase.from('history').insert([insertPayload]);
    if (error) {
      // Fallback if record_snapshot column doesn't exist in Supabase table
      if (recordSnapshot) {
        const fallbackDetails = (details || '') + '\n__RECORD_SNAPSHOT__:' + JSON.stringify(recordSnapshot);
        await supabase.from('history').insert([{
          action,
          details: fallbackDetails,
          username: username || 'غير معروف',
          timestamp: insertPayload.timestamp
        }]);
      } else {
        console.error('addHistory error:', error);
      }
    }
  } catch (err) {
    console.error('addHistory exception:', err.message);
  }
}

async function getHistory() {
  try {
    const { data, error } = await supabase.from('history').select('*').order('timestamp', { ascending: false });
    if (error) return [];
    return (data || []).map(entry => {
      if (!entry.record_snapshot && entry.details && entry.details.includes('__RECORD_SNAPSHOT__:')) {
        try {
          const parts = entry.details.split('__RECORD_SNAPSHOT__:');
          entry.details = parts[0].trim();
          entry.record_snapshot = JSON.parse(parts[1]);
        } catch (e) {}
      }
      return entry;
    });
  } catch (e) {
    console.error('getHistory error:', e);
    return [];
  }
}

async function addStudentHistory(studentId, action, details, username, fieldChanges) {
  if (!studentId) return;
  try {
    const { error } = await supabase.from('student_history').insert([{
      student_id: parseInt(studentId),
      action,
      details,
      username: username || 'غير معروف',
      timestamp: new Date().toISOString(),
      field_changes: fieldChanges || []
    }]);
    if (error) console.error('addStudentHistory error:', error);
  } catch (e) {
    console.warn('addStudentHistory exception:', e.message);
  }
}

async function getStudentHistory(studentId) {
  if (!studentId) return [];
  const idNum = parseInt(studentId);
  try {
    const { data, error } = await supabase
      .from('student_history')
      .select('*')
      .eq('student_id', idNum)
      .order('timestamp', { ascending: false });
    if (error) return [];
    return data || [];
  } catch (e) {
    return [];
  }
}

async function deleteStudentHistory(studentId) {
  if (!studentId) return;
  const idNum = parseInt(studentId);
  try {
    await supabase.from('student_history').delete().eq('student_id', idNum);
  } catch (e) {
    console.warn('deleteStudentHistory exception:', e.message);
  }
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

module.exports = {
  addHistory,
  getHistory,
  addStudentHistory,
  getStudentHistory,
  deleteStudentHistory,
  computeFieldChanges
};
