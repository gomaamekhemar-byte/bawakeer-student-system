const supabase = require('../config/supabase');

async function getBranches(activeOnly = true) {
  let query = supabase.from('branches').select('*').order('id', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

async function getBranchNames(activeOnly = true) {
  const branches = await getBranches(activeOnly);
  return branches.map(b => b.name);
}

async function createBranch({ name, location, username }) {
  const { data, error } = await supabase.from('branches').insert([{
    name, location: location || '', is_active: true,
    created_by: username || 'admin', created_at: new Date().toISOString()
  }]).select().single();
  if (error) { console.error('createBranch error:', error); return null; }
  return data;
}

async function updateBranch(id, updates) {
  const { data, error } = await supabase.from('branches').update(updates).eq('id', id).select().single();
  if (error) return null;
  return data;
}

async function deleteBranch(id) {
  const { error } = await supabase.from('branches').delete().eq('id', id);
  return !error;
}

module.exports = { getBranches, getBranchNames, createBranch, updateBranch, deleteBranch };
