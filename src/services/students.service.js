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
  student.attachments = Array.isArray(student.attachments) ? student.attachments : [];
  student.age = calculateAge(student.date_of_birth || '');
  return student;
}

async function getStudents() {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('id', { ascending: false });
  if (error) {
    console.error('CRITICAL getStudents error:', error);
    return [];
  }
  return (data || []).map(normalizeStudent);
}

async function getStudentById(id) {
  const { data, error } = await supabase.from('students').select('*').eq('id', id).single();
  if (error) return null;
  return data ? normalizeStudent(data) : null;
}

async function createStudent(studentData) {
  const cleanData = sanitizeStudentData(studentData);
  cleanData.nationality = cleanData.nationality || 'سعودي';
  cleanData.student_type = cleanData.student_type || 'بنين';
  cleanData.phase = cleanData.phase || 'ابتدائي';
  cleanData.grade = cleanData.grade || '1';
  cleanData.track = cleanData.track || 'عام';
  cleanData.branch = cleanData.branch || 'الندى';
  cleanData.interview_result = cleanData.interview_result || 'لم يقابل';
  cleanData.followup_status = cleanData.followup_status || 'في انتظار التسجيل';
  cleanData.attachments = cleanData.attachments || [];
  cleanData.created_at = cleanData.created_at || new Date().toISOString();
  cleanData.updated_at = new Date().toISOString();

  // Safely calculate next ID to avoid PostgreSQL sequence collision
  try {
    const { data: maxRows } = await supabase.from('students').select('id').order('id', { ascending: false }).limit(1);
    const nextId = (maxRows && maxRows.length > 0 && maxRows[0].id ? maxRows[0].id : 0) + 1;
    cleanData.id = nextId;
  } catch (e) {
    console.warn('Could not fetch max ID:', e);
  }

  const { data, error } = await supabase.from('students').insert([cleanData]).select().single();
  if (error) {
    console.error('CRITICAL: createStudent error with ID:', cleanData.id, error);
    // If conflict, try without ID
    delete cleanData.id;
    const { data: retryData, error: retryError } = await supabase.from('students').insert([cleanData]).select().single();
    if (retryError) {
      console.error('CRITICAL: createStudent fallback insert error:', retryError);
      return null;
    }
    return retryData;
  }
  return data;
}

async function updateStudent(id, studentData) {
  const cleanData = sanitizeStudentData(studentData);
  delete cleanData.id; // Never overwrite PK id during update
  cleanData.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('students').update(cleanData).eq('id', id).select().single();
  if (error) {
    console.error('CRITICAL: updateStudent DB Update error:', error);
    return null;
  }
  return data;
}

async function deleteStudent(id) {
  const { error } = await supabase.from('students').delete().eq('id', id);
  return !error;
}

module.exports = { getStudents, getStudentById, createStudent, updateStudent, deleteStudent, normalizeStudent, sanitizeStudentData };
