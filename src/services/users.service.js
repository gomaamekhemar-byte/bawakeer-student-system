const supabase = require('../config/supabase');
const bcrypt = require('bcryptjs');
const { PERMISSIONS, ROLES } = require('../utils/constants');

function getDefaultPermissions(role) {
  if (role === 'admin') return Object.fromEntries(Object.keys(PERMISSIONS).map(k => [k, true]));
  if (role === 'manager') return { view_students: true, manage_students: true, export_reports: true, manage_users: false, manage_years: false, view_analytics: true, manage_settings: false };
  if (role === 'employee') return { view_students: true, manage_students: true, export_reports: false, manage_users: false, manage_years: false, view_analytics: false, manage_settings: false };
  return { view_students: true, manage_students: false, export_reports: false, manage_users: false, manage_years: false, view_analytics: false, manage_settings: false };
}

function normalizeUser(user) {
  user.branches = Array.isArray(user.branches) ? user.branches : (user.branch ? [user.branch] : []);
  user.phases = Array.isArray(user.phases) ? user.phases : (user.phase ? [user.phase] : []);
  user.attachments = user.attachments || [];
  const defaults = getDefaultPermissions(user.role || 'viewer');
  const existing = typeof user.permissions === 'object' ? user.permissions : {};
  user.permissions = { ...defaults, ...existing };
  return user;
}

async function getUsers() {
  const { data, error } = await supabase.from('users').select('*').order('id', { ascending: true });
  if (error) return [];
  return (data || []).map(normalizeUser);
}

async function getUserByUsername(username) {
  const { data, error } = await supabase.from('users').select('*').eq('username', username).single();
  if (error) return null;
  return data ? normalizeUser(data) : null;
}

async function createUser({ username, password, role, full_name, phone, tasks, job_title, permissions, branches, phases }) {
  const hashed = await bcrypt.hash(password, 12);
  const { data, error } = await supabase.from('users').insert([{
    username, password: hashed, role, full_name, phone, tasks, job_title,
    permissions: permissions || getDefaultPermissions(role),
    branches: branches || [], phases: phases || [],
    branch: branches && branches[0] ? branches[0] : '',
    phase: phases && phases[0] ? phases[0] : '',
  }]).select().single();
  if (error) { console.error('createUser error:', error); return null; }
  return data;
}

async function updateUser(username, updates) {
  if (updates.password) {
    updates.password = await bcrypt.hash(updates.password, 12);
  } else {
    delete updates.password;
  }
  const { data, error } = await supabase.from('users').update(updates).eq('username', username).select().single();
  if (error) { console.error('updateUser error:', error); return null; }
  return data;
}

async function deleteUser(username) {
  if (username === 'admin') return false;
  const { error } = await supabase.from('users').delete().eq('username', username);
  return !error;
}

async function verifyPassword(username, password) {
  const user = await getUserByUsername(username);
  if (!user) return null;
  const match = await bcrypt.compare(password, user.password);
  return match ? user : null;
}

module.exports = { getUsers, getUserByUsername, createUser, updateUser, deleteUser, verifyPassword, normalizeUser, getDefaultPermissions };
