const supabase = require('../config/supabase');
const { calculateAge } = require('../utils/age');
const { STUDENT_TYPES, INTERVIEW_RESULTS, FOLLOWUP_STATUSES } = require('../utils/constants');

function normalizeStudent(student) {
  if (!STUDENT_TYPES.includes(student.student_type)) student.student_type = 'بنين';
  if (!INTERVIEW_RESULTS.includes(student.interview_result)) student.interview_result = '';
  if (!FOLLOWUP_STATUSES.includes(student.followup_status)) student.followup_status = '';
  student.attachments = student.attachments || [];
  student.age = calculateAge(student.date_of_birth || '');
  return student;
}

async function getStudents() {
  const { data, error } = await supabase.from('students').select('*').order('id', { ascending: false });
  if (error) { console.error('getStudents error:', error); return []; }
  return (data || []).map(normalizeStudent);
}

async function getStudentById(id) {
  const { data, error } = await supabase.from('students').select('*').eq('id', id).single();
  if (error) return null;
  return data ? normalizeStudent(data) : null;
}

async function createStudent(studentData) {
  const { data, error } = await supabase.from('students').insert([studentData]).select().single();
  if (error) { console.error('createStudent error:', error); return null; }
  return data;
}

async function updateStudent(id, studentData) {
  studentData.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('students').update(studentData).eq('id', id).select().single();
  if (error) { console.error('updateStudent error:', error); return null; }
  return data;
}

async function deleteStudent(id) {
  const { error } = await supabase.from('students').delete().eq('id', id);
  return !error;
}

module.exports = { getStudents, getStudentById, createStudent, updateStudent, deleteStudent, normalizeStudent };
