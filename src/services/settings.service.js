const supabase = require('../config/supabase');
const { PHASE_STRUCTURE, PHASES, STUDENT_TYPES } = require('../utils/constants');

let memorySettings = {
  is_portal_open: true,
  portal_closed_message: "نعتذر منكم، باب التسجيل والقبول الإلكتروني مغلق حالياً. يرجى مراجعة إدارة القبول والتسجيل في مقر المدارس.",
  portal_announcement: "مرحباً بكم في بوابة التسجيل والقبول للعام الدراسي الجديد — مدارس بواكير الأهلية",
  whatsapp_template: "أهلاً بكم في مدارس بواكير الأهلية. تم استلام طلب تسجيل {نوع_الطالب} [{اسم_الطالب}] بنجاح في فرع [{الفرع}]. سيتم التواصل معكم قريباً لتحديد موعد المقابلة.",
  show_mother_phone: true,
  show_nationality: true,
  show_neighborhood: true,
  show_track: true,
  show_notes: true,
  default_calendar: "hijri", // 'hijri' or 'gregorian'
  branch_phones: {
    "1": "0553620441",
    "2": "0597196787",
    "الروابي": "0553620441",
    "الندى": "0597196787"
  },
  branch_master_switches: {}, // branchName -> boolean (Master Switch for entire branch)
  branch_phase_switches: {},  // `${branch}_${phase}` -> boolean (Master Switch for entire phase in a branch)
  grade_matrix: {}, // Dynamic Grade Matrix: key -> boolean
  updated_at: new Date().toISOString()
};

function buildMatrixKey(branch, student_type, phase, grade, track) {
  const b = String(branch || '').trim();
  const st = String(student_type || '').trim();
  const p = String(phase || '').trim();
  const g = String(grade || '').trim();
  const t = String(track || 'عام').trim();
  return `${b}_${st}_${p}_${g}_${t}`;
}

function buildPhaseKey(branch, phase) {
  const b = String(branch || '').trim();
  const p = String(phase || '').trim();
  return `${b}_${p}`;
}

function isBranchMasterActive(branchName, settings) {
  const cfg = settings || memorySettings;
  const masters = cfg.branch_master_switches || {};
  const b = String(branchName || '').trim();
  if (masters[b] !== undefined) {
    return masters[b] === true || masters[b] === 'true' || masters[b] === 1;
  }
  return true; // Default active if not explicitly turned off
}

function isPhaseActiveInBranch(branchName, phaseName, settings) {
  const cfg = settings || memorySettings;
  const pSwitches = cfg.branch_phase_switches || {};
  const key = buildPhaseKey(branchName, phaseName);
  if (pSwitches[key] !== undefined) {
    return pSwitches[key] === true || pSwitches[key] === 'true' || pSwitches[key] === 1;
  }
  return true; // Default active if not explicitly turned off
}

function getActiveBranches(allBranches, settings) {
  const cfg = settings || memorySettings;
  return (allBranches || []).filter(b => {
    const bName = typeof b === 'string' ? b : (b.name || '');
    return isBranchMasterActive(bName, cfg);
  });
}

async function getExternalSettings() {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .eq('key', 'external_portal_config')
      .single();

    if (!error && data && data.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      memorySettings = {
        ...memorySettings,
        ...parsed,
        branch_phones: {
          ...memorySettings.branch_phones,
          ...(parsed.branch_phones || {})
        },
        branch_master_switches: {
          ...memorySettings.branch_master_switches,
          ...(parsed.branch_master_switches || {})
        },
        branch_phase_switches: {
          ...memorySettings.branch_phase_switches,
          ...(parsed.branch_phase_switches || {})
        },
        grade_matrix: {
          ...memorySettings.grade_matrix,
          ...(parsed.grade_matrix || {})
        }
      };
    }
  } catch (e) {
    // If system_settings table doesn't exist yet, fallback to robust memorySettings
  }
  return { ...memorySettings };
}

async function saveExternalSettings(newConfig, username) {
  const mergedBranchPhones = {
    ...memorySettings.branch_phones,
    ...(newConfig.branch_phones || {})
  };

  const mergedBranchMasters = {
    ...memorySettings.branch_master_switches,
    ...(newConfig.branch_master_switches || {})
  };

  const mergedPhaseSwitches = {
    ...memorySettings.branch_phase_switches,
    ...(newConfig.branch_phase_switches || {})
  };

  const mergedGradeMatrix = {
    ...memorySettings.grade_matrix,
    ...(newConfig.grade_matrix || {})
  };

  memorySettings = {
    ...memorySettings,
    ...newConfig,
    branch_phones: mergedBranchPhones,
    branch_master_switches: mergedBranchMasters,
    branch_phase_switches: mergedPhaseSwitches,
    grade_matrix: mergedGradeMatrix,
    updated_at: new Date().toISOString(),
    updated_by: username || 'admin'
  };

  try {
    await supabase.from('system_settings').upsert({
      key: 'external_portal_config',
      value: memorySettings,
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('Failed to persist settings in Supabase:', e.message);
  }

  return memorySettings;
}

function getBranchWhatsAppPhone(branchIdOrName, settings) {
  const cfg = settings || memorySettings;
  const phones = cfg.branch_phones || {};

  if (branchIdOrName && phones[String(branchIdOrName)]) {
    const val = phones[String(branchIdOrName)];
    if (val && String(val).trim()) return String(val).trim();
  }

  if (branchIdOrName) {
    const cleanKey = String(branchIdOrName).trim();
    for (const [k, v] of Object.entries(phones)) {
      if (k === cleanKey || cleanKey.includes(k) || k.includes(cleanKey)) {
        if (v && String(v).trim()) return String(v).trim();
      }
    }
  }

  return "0553620441"; // Default fallback
}

function isGradeAvailable(branch, student_type, phase, grade, track, settings) {
  const cfg = settings || memorySettings;

  // 1. Check Master Switch for the entire branch
  if (!isBranchMasterActive(branch, cfg)) {
    return false;
  }

  // 2. Check Phase Master Switch for this branch
  if (!isPhaseActiveInBranch(branch, phase, cfg)) {
    return false;
  }

  const matrix = cfg.grade_matrix;
  if (!matrix || Object.keys(matrix).length === 0) {
    return true; // Default: all active if matrix has never been configured
  }

  const key = buildMatrixKey(branch, student_type, phase, grade, track);
  if (matrix[key] !== undefined) {
    return matrix[key] === true || matrix[key] === 'true' || matrix[key] === 1;
  }

  // Fallback checking general track
  const fallbackKey = buildMatrixKey(branch, student_type, phase, grade, 'عام');
  if (matrix[fallbackKey] !== undefined) {
    return matrix[fallbackKey] === true || matrix[fallbackKey] === 'true' || matrix[fallbackKey] === 1;
  }

  return true; // default open
}

function getAvailableHierarchy(branch, student_type, settings) {
  const cfg = settings || memorySettings;
  const result = {
    branch,
    student_type,
    is_branch_active: isBranchMasterActive(branch, cfg),
    phases: []
  };

  if (!result.is_branch_active) {
    return result;
  }

  for (const [pName, pInfo] of Object.entries(PHASE_STRUCTURE)) {
    // Check Phase Master Switch for this branch
    if (!isPhaseActiveInBranch(branch, pName, cfg)) {
      continue;
    }

    const phaseObj = {
      name: pName,
      grades: []
    };

    for (const gradeItem of pInfo.grades) {
      const activeTracks = [];
      for (const trackName of pInfo.tracks) {
        if (isGradeAvailable(branch, student_type, pName, gradeItem.id, trackName, cfg)) {
          activeTracks.push(trackName);
        }
      }

      if (activeTracks.length > 0) {
        phaseObj.grades.push({
          id: gradeItem.id,
          name: gradeItem.name,
          tracks: activeTracks
        });
      }
    }

    if (phaseObj.grades.length > 0) {
      result.phases.push(phaseObj);
    }
  }

  return result;
}

module.exports = {
  getExternalSettings,
  saveExternalSettings,
  getBranchWhatsAppPhone,
  isBranchMasterActive,
  isPhaseActiveInBranch,
  getActiveBranches,
  isGradeAvailable,
  getAvailableHierarchy,
  buildMatrixKey,
  buildPhaseKey
};
