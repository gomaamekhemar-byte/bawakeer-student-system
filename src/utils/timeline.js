/**
 * Timeline and Duration Tracking Helper for Student Registration
 */

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr).substring(0, 10);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  } catch (e) {
    return String(dateStr).substring(0, 10);
  }
}

function calculateDaysDifference(d1Str, d2Str) {
  if (!d1Str || !d2Str) return 0;
  try {
    const d1 = new Date(d1Str);
    const d2 = new Date(d2Str);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
    const diffMs = d2.getTime() - d1.getTime();
    const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    return days;
  } catch (e) {
    return 0;
  }
}

function parseTimeTrackMeta(notesStr) {
  if (!notesStr || typeof notesStr !== 'string') return {};
  const match = notesStr.match(/\[TIMETRACK:(\{.*?\})\]/);
  if (match && match[1]) {
    try {
      return JSON.parse(match[1]);
    } catch (e) {
      return {};
    }
  }
  return {};
}

function encodeTimeTrackMeta(existingNotes, metaObj) {
  const cleanNotes = (existingNotes || '').replace(/\s*\[TIMETRACK:\{.*?\}\]/g, '').trim();
  const metaStr = `[TIMETRACK:${JSON.stringify(metaObj)}]`;
  return cleanNotes ? `${cleanNotes} ${metaStr}` : metaStr;
}

function cleanNotesForDisplay(notesStr) {
  if (!notesStr || typeof notesStr !== 'string') return '';
  return notesStr.replace(/\s*\[TIMETRACK:\{.*?\}\]/g, '').trim();
}

function computeStudentTimeline(student) {
  const meta = parseTimeTrackMeta(student.notes);
  const now = new Date();

  // 1. Initial Registration Date
  const initDateStr = meta.init || student.created_at || student.updated_at || now.toISOString();
  const initDisplay = formatDateDisplay(initDateStr);

  // 2. Interview Date & Duration
  const hasInterviewed = Boolean(student.interview_result && student.interview_result !== 'في انتظار المقابلة' && student.interview_result !== 'لم يقابل');
  const interviewDateStr = meta.interview || student.interview_date || (hasInterviewed ? (student.updated_at || now.toISOString()) : null);
  const interviewDisplay = interviewDateStr ? formatDateDisplay(interviewDateStr) : '';
  const interviewDaysWaited = interviewDateStr ? calculateDaysDifference(initDateStr, interviewDateStr) : calculateDaysDifference(initDateStr, now.toISOString());

  // 3. Registration Date & Duration
  const hasRegistered = Boolean(student.followup_status && student.followup_status !== 'في انتظار المقابلة' && student.followup_status !== 'في انتظار التسجيل');
  const regDateStr = meta.registration || (hasRegistered ? (student.updated_at || now.toISOString()) : null);
  const regDisplay = regDateStr ? formatDateDisplay(regDateStr) : '';
  
  // Registration days taken after interview
  const baseForReg = interviewDateStr || initDateStr;
  const regDaysTaken = regDateStr ? calculateDaysDifference(baseForReg, regDateStr) : (hasInterviewed ? calculateDaysDifference(baseForReg, now.toISOString()) : 0);

  // 4. Total Waiting Days & Urgency Level
  const finalDateStr = (hasRegistered && regDateStr) ? regDateStr : now.toISOString();
  const totalWaitingDays = calculateDaysDifference(initDateStr, finalDateStr);

  let urgencyLevel = 'normal'; // green
  let urgencyClass = 'bg-success-subtle text-success border border-success';
  let urgencyBadge = 'سريع (أقل من 3 أيام)';

  if (totalWaitingDays > 5) {
    urgencyLevel = 'danger'; // red
    urgencyClass = 'bg-danger-subtle text-danger border border-danger';
    urgencyBadge = 'تأخير (أكثر من 5 أيام)';
  } else if (totalWaitingDays >= 3) {
    urgencyLevel = 'warning'; // yellow
    urgencyClass = 'bg-warning-subtle text-warning border border-warning';
    urgencyBadge = 'متوسط (3 إلى 5 أيام)';
  }

  return {
    initial_registration_date: initDateStr,
    initial_registration_display: initDisplay,
    
    interview_date: interviewDateStr,
    interview_date_display: interviewDisplay,
    interview_days_waited: interviewDaysWaited,
    has_interviewed: hasInterviewed,
    
    registration_date: regDateStr,
    registration_date_display: regDisplay,
    registration_days_taken: regDaysTaken,
    has_registered: hasRegistered,
    
    total_waiting_days: totalWaitingDays,
    current_waiting_days: calculateDaysDifference(initDateStr, now.toISOString()),
    urgency_level: urgencyLevel,
    urgency_class: urgencyClass,
    urgency_badge: urgencyBadge,
  };
}

module.exports = {
  formatDateDisplay,
  calculateDaysDifference,
  parseTimeTrackMeta,
  encodeTimeTrackMeta,
  cleanNotesForDisplay,
  computeStudentTimeline
};
