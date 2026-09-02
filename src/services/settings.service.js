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
      memorySettings = { ...memorySettings, ...parsed };
    }
  } catch (e) {
    // If system_settings table doesn't exist yet, fallback to robust memorySettings
  }
  return { ...memorySettings };
}

async function saveExternalSettings(newConfig, username) {
  memorySettings = {
    ...memorySettings,
    ...newConfig,
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

module.exports = {
  getExternalSettings,
  saveExternalSettings
};
