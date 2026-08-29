const { getCurrentUser } = require('./auth');

async function withUser(req, res, next) {
  try {
    const user = await getCurrentUser(req);
    req.currentUser = user;
    next();
  } catch (e) {
    req.currentUser = null;
    next();
  }
}

function userCan(user, ...roles) {
  if (!user) return false;
  return roles.includes(user.role);
}

function userHasPermission(user, permissionKey) {
  if (!user) return false;
  const permissions = user.permissions || {};
  return permissions[permissionKey] === true;
}

function userMatchesScope(user, student) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (['manager', 'employee'].includes(user.role)) {
    const branches = user.branches || (user.branch ? [user.branch] : []);
    const phases = user.phases || (user.phase ? [user.phase] : []);
    if (branches.length && !branches.includes('الكل') && !branches.includes(student.branch)) return false;
    if (phases.length && !phases.includes('الكل') && !phases.includes(student.phase)) return false;
    return true;
  }
  return false;
}

module.exports = { withUser, userCan, userHasPermission, userMatchesScope };
