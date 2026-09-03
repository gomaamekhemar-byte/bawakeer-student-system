const { computeStudentTimeline, cleanNotesForDisplay } = require('../utils/timeline');
const supabase = require('../config/supabase');
const { calculateAge } = require('../utils/age');
const { STUDENT_TYPES, INTERVIEW_RESULTS, FOLLOWUP_STATUSES } = require('../utils/constants');

const VALID_STUDENT_COLUMNS = [
  'id', 'name', 'phone', 'date_of_birth', 'nationality', 'neighborhood',
  'interview_date', 'interview_result', 'interview_reason', 'followup_status',
  'registration_reason', 'student_type', 'track', 'phase', 'grade', 'branch',
  'notes', 'attachments', 'academic_year_id', 'updated_at', 'created_at'
];

function sanitizeStudentData(data) {
  const clean = {};
  for (const col of VALID_STUDENT_COLUMNS) {
    if (data[col] !== undefined) {
      clean[col] = data[col];
    }
  }
  return clean;
}

function normalizeStudent(student) {
  if (!student) return null;
  student.name = student.name || '';
  student.phone = student.phone || '';
  student.student_type = student.student_type || 'بنين';
  student.nationality = student.nationality || 'سعودي';
  student.branch = student.branch || 'الندى';
  student.phase = student.phase || 'ابتدائي';
  student.grade = student.grade || '1';
  student.track = student.track || 'عام';
  student.interview_result = student.interview_result || 'لم يقابل';
  student.followup_status = student.followup_status || 'في انتظار التسجيل';
  
  // Extract metadata safely from JSONB attachments
  const rawAtts = Array.isArray(student.attachments) ? student.attachments : [];
  const metaObj = rawAtts.find(a => a && a.__meta);
  const meta = metaObj ? metaObj.__meta : {};

  student.registration_source = meta.registration_source || 'تسجيل داخلي';
  student.mother_phone = meta.mother_phone || '';
  student.is_deleted = meta.is_deleted === true || student.followup_status === 'محذوف';
  student.deleted_at = meta.deleted_at || null;
  student.deleted_by = meta.deleted_by || null;
  student.previous_followup_status = meta.previous_followup_status || 'في انتظار التسجيل';
  
  // Display attachments excluding internal metadata object
  student.attachments = rawAtts.filter(a => a && !a.__meta);
  
  student.age = calculateAge(student.date_of_birth || '');
  student.timeline = computeStudentTimeline(student);
  student.display_notes = cleanNotesForDisplay(student.notes);
  return student;
}

// Global active students query (excludes soft-deleted students)
async function getStudents() {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('id', { ascending: false });
    if (error) {
      console.error('CRITICAL getStudents error:', error);
      return [];
    }
    return (data || [])
      .map(normalizeStudent)
      .filter(s => s && s.is_deleted !== true && s.followup_status !== 'محذوف');
  } catch (err) {
    console.error('Fatal getStudents exception:', err);
    return [];
  }
}

// Retrieve single active student
async function getStudentById(id) {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    const s = normalizeStudent(data);
    if (s.is_deleted || s.followup_status === 'محذوف') return null;
    return s;
  } catch (e) {
    return null;
  }
}

// Retrieve student including deleted records
async function getStudentByIdIncludingDeleted(id) {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return normalizeStudent(data);
  } catch (e) {
    return null;
  }
}

async function createStudent(studentData) {
  const sanitized = sanitizeStudentData(studentData);
  sanitized.updated_at = new Date().toISOString();

  // If id is not specified, calculate next id to prevent sequence conflicts
  if (!sanitized.id) {
    try {
      const { data: maxRows } = await supabase
        .from('students')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);
      const nextId = (maxRows && maxRows[0] && maxRows[0].id ? maxRows[0].id : 0) + 1;
      sanitized.id = nextId;
    } catch (e) {}
  }

  const { data, error } = await supabase
    .from('students')
    .insert([sanitized])
    .select()
    .single();

  if (error) {
    console.error('Supabase createStudent Error details:', JSON.stringify(error, null, 2));
    return null;
  }
  return data ? normalizeStudent(data) : null;
}

async function updateStudent(id, studentData) {
  const sanitized = sanitizeStudentData(studentData);
  sanitized.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('students')
    .update(sanitized)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Supabase updateStudent Error details:', JSON.stringify(error, null, 2));
    return null;
  }
  return data ? normalizeStudent(data) : null;
}

// Soft Delete Student
async function softDeleteStudent(id, username) {
  if (!id) return { success: false, error: 'معرف الطالب غير محدد' };
  const studentId = parseInt(id);
  if (isNaN(studentId) || studentId <= 0) return { success: false, error: 'معرف الطالب غير صالح' };

  try {
    const student = await getStudentByIdIncludingDeleted(studentId);
    if (!student) return { success: false, error: 'الطالب غير موجود مسبقاً في قاعدة البيانات' };

    // Update attachments metadata
    const { data: rawData } = await supabase.from('students').select('attachments, followup_status, notes').eq('id', studentId).single();
    let attachments = Array.isArray(rawData && rawData.attachments) ? rawData.attachments : [];
    
    let metaIndex = attachments.findIndex(a => a && a.__meta);
    let meta = metaIndex !== -1 ? attachments[metaIndex].__meta : {};

    meta.is_deleted = true;
    meta.deleted_at = new Date().toISOString();
    meta.deleted_by = username || 'admin';
    meta.previous_followup_status = rawData.followup_status || student.followup_status || 'في انتظار التسجيل';

    if (metaIndex !== -1) {
      attachments[metaIndex] = { __meta: meta };
    } else {
      attachments.push({ __meta: meta });
    }

    const cleanNotes = (rawData.notes || '').replace(/\[تم الحذف ونقله لسلة المحذوفات[\s\S]*?\]/g, '').trim();
    const newNotes = cleanNotes + '\n[تم الحذف ونقله لسلة المحذوفات بواسطة ' + (username || 'admin') + ' في ' + new Date().toISOString() + ']';

    const { data: updatedData, error } = await supabase
      .from('students')
      .update({
        followup_status: 'محذوف',
        attachments: attachments,
        notes: newNotes,
        updated_at: new Date().toISOString()
      })
      .eq('id', studentId)
      .select()
      .single();

    if (error) {
      console.error('softDeleteStudent error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, student: normalizeStudent(updatedData), studentName: student.name };
  } catch (err) {
    console.error('softDeleteStudent exception:', err);
    return { success: false, error: err.message };
  }
}

// Restore Deleted Student
async function restoreStudent(id, username) {
  if (!id) return { success: false, error: 'معرف الطالب غير محدد' };
  const studentId = parseInt(id);
  if (isNaN(studentId) || studentId <= 0) return { success: false, error: 'معرف الطالب غير صالح' };

  try {
    const student = await getStudentByIdIncludingDeleted(studentId);
    if (!student) return { success: false, error: 'تعذر العثور على سجل الطالب لاسترجاعه' };

    const { data: rawData } = await supabase.from('students').select('attachments, followup_status, notes').eq('id', studentId).single();
    let attachments = Array.isArray(rawData && rawData.attachments) ? rawData.attachments : [];
    
    let metaIndex = attachments.findIndex(a => a && a.__meta);
    let meta = metaIndex !== -1 ? attachments[metaIndex].__meta : {};

    const prevStatus = meta.previous_followup_status && meta.previous_followup_status !== 'محذوف' 
      ? meta.previous_followup_status 
      : 'في انتظار التسجيل';

    meta.is_deleted = false;
    meta.deleted_at = null;
    meta.restored_at = new Date().toISOString();
    meta.restored_by = username || 'admin';

    if (metaIndex !== -1) {
      attachments[metaIndex] = { __meta: meta };
    } else {
      attachments.push({ __meta: meta });
    }

    const cleanNotes = (rawData.notes || '').replace(/\[تم الحذف ونقله لسلة المحذوفات[\s\S]*?\]/g, '').trim();
    const newNotes = cleanNotes + '\n[تم استرجاع الطالب بنجاح بواسطة ' + (username || 'admin') + ' في ' + new Date().toISOString() + ']';

    const { data: updatedData, error } = await supabase
      .from('students')
      .update({
        followup_status: prevStatus,
        attachments: attachments,
        notes: newNotes,
        updated_at: new Date().toISOString()
      })
      .eq('id', studentId)
      .select()
      .single();

    if (error) {
      console.error('restoreStudent error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, student: normalizeStudent(updatedData) };
  } catch (err) {
    console.error('restoreStudent exception:', err);
    return { success: false, error: err.message };
  }
}

async function deleteStudent(id, username) {
  return await softDeleteStudent(id, username);
}

module.exports = {
  getStudents,
  getStudentById,
  getStudentByIdIncludingDeleted,
  createStudent,
  updateStudent,
  deleteStudent,
  softDeleteStudent,
  restoreStudent,
  normalizeStudent
};
