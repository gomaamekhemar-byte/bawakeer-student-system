const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'bawakeer-secret-key-2026-minimum-32-chars-long';
const JWT_EXPIRES = '8h';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

async function getCurrentUser(req) {
  const token = req.cookies && req.cookies.auth_token;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', payload.username)
      .single();
    if (error || !data) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.auth_token;
  if (!token) return res.redirect('/login');
  const payload = verifyToken(token);
  if (!payload) return res.redirect('/login');
  req.userPayload = payload;
  next();
}

module.exports = { signToken, verifyToken, getCurrentUser, requireAuth, JWT_SECRET };
