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
  
  // Display attachments excluding internal metadata object
  student.attachments = rawAtts.filter(a => a && !a.__meta);
  
  student.age = calculateAge(student.date_of_birth || '');
  student.timeline = computeStudentTimeline(student);
  student.display_notes = cleanNotesForDisplay(student.notes);
  return student;
}

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
      .filter(s => s && s.is_deleted !== true && s.followup_status !== 'محذوف')
      .map(normalizeStudent);
  } catch (err) {
    console.error('Fatal getStudents exception:', err);
    return [];
  }
}

async function getStudentById(id) {
  const { data, error } = await supabase.from('students').select('*').eq('id', id).single();
  if (error) return null;
  return data ? normalizeStudent(data) : null;
}

async function createStudent(studentData) {
  // Automatically calculate next ID to prevent sequence collision
  if (!studentData.id) {
    const { data: latest } = await supabase.from('students').select('id').order('id', { ascending: false }).limit(1);
    const maxId = (latest && latest[0] && latest[0].id) ? parseInt(latest[0].id) : 0;
    studentData.id = maxId + 1;
  }

  // Preserve metadata in attachments
  const rawAtts = Array.isArray(studentData.attachments) ? studentData.attachments.filter(a => !a.__meta) : [];
  const metaItem = {
    __meta: {
      registration_source: studentData.registration_source || 'تسجيل داخلي',
      mother_phone: studentData.mother_phone || ''
    }
  };
  studentData.attachments = [...rawAtts, metaItem];

  const sanitized = sanitizeStudentData(studentData);
  
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
  const existing = await getStudentById(id);
  const existingSource = existing ? existing.registration_source : 'تسجيل داخلي';
  const existingMotherPhone = existing ? existing.mother_phone : '';

  const rawAtts = Array.isArray(studentData.attachments) 
    ? studentData.attachments.filter(a => !a.__meta) 
    : (existing ? existing.attachments : []);

  const metaItem = {
    __meta: {
      registration_source: studentData.registration_source || existingSource,
      mother_phone: studentData.mother_phone || existingMotherPhone
    }
  };
  studentData.attachments = [...rawAtts, metaItem];
  studentData.updated_at = new Date().toISOString();

  const sanitized = sanitizeStudentData(studentData);

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

async function deleteStudent(id) {
  if (!id) {
    return { success: false, error: 'معرف الطالب غير محدد أو مفقود' };
  }
  const studentId = parseInt(id);
  if (isNaN(studentId) || studentId <= 0) {
    return { success: false, error: 'معرف الطالب غير صالح (NaN)' };
  }

  try {
    // 1. Find existing student to inspect attachments and name
    const student = await getStudentById(studentId);
    if (!student) {
      return { success: false, error: 'الطالب غير موجود مسبقاً في قاعدة البيانات' };
    }

    const studentName = student.name || 'طالب رقم ' + studentId;

    // 2. Cascade Delete Step 1: Remove attached files from Supabase Storage safely
    if (student.attachments && Array.isArray(student.attachments)) {
      const fileNames = student.attachments
        .filter(att => att && att.filename)
        .map(att => att.filename);
      if (fileNames.length > 0) {
        try {
          await supabase.storage.from('student-attachments').remove(fileNames);
        } catch (storageErr) {
          console.warn('Storage cleanup warning during student delete:', storageErr.message);
        }
      }
    }

    // 3. Cascade Delete Step 2: Delete related records in student_history first
    try {
      const { deleteStudentHistory } = require('./history.service');
      await deleteStudentHistory(studentId);
    } catch (histErr) {
      console.warn('student_history cleanup warning:', histErr.message);
    }

    // 4. Primary Delete Attempt: Direct Hard DELETE from students table
    let hardDeleteSuccess = false;
    try {
      const { error: deleteError } = await supabase
        .from('students')
        .delete()
        .eq('id', studentId);

      if (!deleteError) {
        hardDeleteSuccess = true;
      } else {
        console.warn('Direct DELETE failed, will apply Soft Delete fallback:', deleteError.message);
      }
    } catch (directDelEx) {
      console.warn('Direct DELETE exception:', directDelEx.message);
    }

    // 5. Fallback: Soft Delete if Hard DELETE failed due to FK constraints or RLS
    if (!hardDeleteSuccess) {
      try {
        const { error: softError } = await supabase
          .from('students')
          .update({
            followup_status: 'محذوف',
            notes: (student.notes || '') + '\n[تم الحذف بواسطة الإدارة في ' + new Date().toISOString() + ']'
          })
          .eq('id', studentId);

        if (softError) {
          console.error('Soft delete fallback error:', softError);
          return { success: false, error: softError.message || 'فشل حذف الطالب في قاعدة البيانات' };
        }
      } catch (softEx) {
        console.error('Soft delete fallback exception:', softEx);
        return { success: false, error: softEx.message || 'فشل الحذف المرن' };
      }
    }

    return { success: true, studentName };
  } catch (err) {
    console.error('Fatal exception in deleteStudent service:', err);
    return { success: false, error: err.message || 'استثناء غير متوقع أثناء حذف الطالب' };
  }
}

module.exports = {
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  normalizeStudent
};
