const https = require("https");
const { getExternalSettings } = require("./settings.service");

/**
 * Format phone number to international WhatsApp format
 */
function formatPhoneNumber(phone) {
  if (!phone) return "";
  let clean = phone.replace(/\D/g, "");
  if (clean.startsWith("05") && clean.length === 10) {
    clean = "966" + clean.substring(1);
  } else if (clean.startsWith("5") && clean.length === 9) {
    clean = "966" + clean;
  }
  return clean;
}

/**
 * Dynamic Template Formatting with Intelligent Gender Substitution
 */
function formatWhatsAppMessage(template, studentData = {}) {
  let msg = template || "أهلاً بكم في مدارس بواكير الأهلية. تم استلام طلب تسجيل {نوع_الطالب} [{اسم_الطالب}] بنجاح في فرع [{الفرع}]. سيتم التواصل معكم قريباً لتحديد موعد المقابلة.";

  const isFemale = (studentData.student_type || "").trim() === "بنات";

  // Gender-based replacements
  const studentTypeLabel = isFemale ? "الطالبة" : "الطالب";
  const childPronoun = isFemale ? "ابنتكم" : "ابنكم";
  const registeredWord = isFemale ? "المسجلة" : "المسجل";

  msg = msg.replace(/{نوع_الطالب}/g, studentTypeLabel);
  msg = msg.replace(/{ضمير_المخاطب}/g, childPronoun);
  msg = msg.replace(/{المسجل}/g, registeredWord);

  // General field replacements
  msg = msg.replace(/{اسم_الطالب}/g, studentData.name || "");
  msg = msg.replace(/{الفرع}/g, studentData.branch || "");
  msg = msg.replace(/{المرحلة}/g, studentData.phase || "");
  msg = msg.replace(/{الصف}/g, studentData.grade ? `الصف ${studentData.grade}` : "");
  msg = msg.replace(/{العام_الدراسي}/g, studentData.academic_year_name || "");

  return msg;
}

function getWhatsAppDirectUrl(phone, message) {
  const formatted = formatPhoneNumber(phone);
  if (!formatted) return "";
  const encodedMsg = encodeURIComponent(message || "");
  return `https://api.whatsapp.com/send?phone=${formatted}&text=${encodedMsg}`;
}

async function sendWhatsAppNotification(studentData, customPhone) {
  const settings = await getExternalSettings();
  const phone = customPhone || (typeof studentData === 'object' ? studentData.phone : '');
  const formattedPhone = formatPhoneNumber(phone);

  const messageText = formatWhatsAppMessage(settings.whatsapp_template, typeof studentData === 'object' ? studentData : { name: studentData });

  // If webhook is configured
  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;

  if (webhookUrl) {
    try {
      const payload = JSON.stringify({
        phone: formattedPhone,
        message: messageText,
        student_name: studentData.name || "",
        branch: studentData.branch || "",
        timestamp: new Date().toISOString()
      });

      const urlObj = new URL(webhookUrl);
      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
        }
      });
      req.on("error", (e) => console.error("WhatsApp webhook error:", e.message));
      req.write(payload);
      req.end();
    } catch (err) {
      console.error("WhatsApp notification dispatch failed:", err.message);
    }
  }

  return {
    success: true,
    phone: formattedPhone,
    message: messageText,
    directUrl: getWhatsAppDirectUrl(phone, messageText)
  };
}

module.exports = {
  formatPhoneNumber,
  formatWhatsAppMessage,
  getWhatsAppDirectUrl,
  sendWhatsAppNotification
};
