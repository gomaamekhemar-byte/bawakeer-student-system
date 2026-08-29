const supabase = require('../config/supabase');

async function getAcademicYears() {
  const { data, error } = await supabase.from('academic_years').select('*').order('id', { ascending: false });
  if (error) return [];
  return data || [];
}

async function getActiveYear() {
  const { data, error } = await supabase.from('academic_years').select('*').eq('is_active', true).single();
  if (error) return null;
  return data || null;
}

async function createAcademicYear({ year_name, username }) {
  // Deactivate current active year
  await supabase.from('academic_years').update({ is_active: false, closed_at: new Date().toISOString() }).eq('is_active', true);
  const { data, error } = await supabase.from('academic_years').insert([{
    year_name, is_active: true, created_by: username || 'admin',
    created_at: new Date().toISOString(), closed_at: null
  }]).select().single();
  if (error) { console.error('createAcademicYear error:', error); return null; }
  return data;
}

async function activateYear(id) {
  await supabase.from('academic_years').update({ is_active: false, closed_at: new Date().toISOString() }).eq('is_active', true);
  const { data, error } = await supabase.from('academic_years').update({ is_active: true, closed_at: null }).eq('id', id).select().single();
  if (error) return null;
  return data;
}

async function deleteYear(id) {
  const { error } = await supabase.from('academic_years').delete().eq('id', id);
  return !error;
}

module.exports = { getAcademicYears, getActiveYear, createAcademicYear, activateYear, deleteYear };
