const supabase = require('../config/supabase');

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
  updated_at: new Date().toISOString()
};

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

  memorySettings = {
    ...memorySettings,
    ...newConfig,
    branch_phones: mergedBranchPhones,
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

module.exports = {
  getExternalSettings,
  saveExternalSettings,
  getBranchWhatsAppPhone
};
