const { getCurrentUser, verifyToken } = require('./auth');
const { getActiveYear } = require('../services/academic_years.service');

async function withUser(req, res, next) {
  try {
    const user = await getCurrentUser(req);
    req.currentUser = user;

    // Academic Year Session Handling
    const token = req.cookies && req.cookies.auth_token;
    const payload = token ? verifyToken(token) : null;
    
    const activeYear = await getActiveYear();
    let sessionYearId = payload && payload.academic_year_id ? payload.academic_year_id : (activeYear ? activeYear.id : null);
    let sessionYearName = payload && payload.academic_year_name ? payload.academic_year_name : (activeYear ? activeYear.year_name : '');
    
    // Check if session year is active
    let isYearActive = false;
    if (activeYear && String(activeYear.id) === String(sessionYearId)) {
      isYearActive = true;
    } else if (payload && payload.is_year_active !== undefined) {
      isYearActive = Boolean(payload.is_year_active);
    }

    req.sessionYear = {
      id: sessionYearId,
      name: sessionYearName,
      is_active: isYearActive
    };
    req.isReadOnlyYear = !isYearActive;
    res.locals.isReadOnlyYear = req.isReadOnlyYear;
    res.locals.sessionYear = req.sessionYear;
    res.locals.activeYear = activeYear;

    next();
  } catch (e) {
    req.currentUser = null;
    req.sessionYear = null;
    req.isReadOnlyYear = false;
    res.locals.isReadOnlyYear = false;
    res.locals.sessionYear = null;
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
