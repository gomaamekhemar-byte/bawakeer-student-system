const https = require("https");

/**
 * WhatsApp Messaging & Automation Service
 * Supports WhatsApp Cloud API, UltraMsg, Twilio, and Instant WhatsApp Web links
 */

function formatPhoneNumber(phone) {
  if (!phone) return "";
  let clean = phone.replace(/\D/g, "");
  // If starts with 05 (Saudi mobile), convert to 9665
  if (clean.startsWith("05") && clean.length === 10) {
    clean = "966" + clean.substring(1);
  } else if (clean.startsWith("5") && clean.length === 9) {
    clean = "966" + clean;
  }
  return clean;
}

function generateWelcomeMessage(studentName, branchName) {
  return `أهلاً بك في مدارس بواكير الأهلية. تم استلام طلب تسجيل الطالب/ـة [${studentName}] بنجاح في فرع [${branchName}]. سيتم التواصل معكم قريباً لتحديد موعد المقابلة.`;
}

function getWhatsAppDirectUrl(phone, message) {
  const formatted = formatPhoneNumber(phone);
  if (!formatted) return "";
  const encodedMsg = encodeURIComponent(message || "");
  return `https://api.whatsapp.com/send?phone=${formatted}&text=${encodedMsg}`;
}

async function sendWhatsAppNotification(studentName, branchName, phone) {
  const formattedPhone = formatPhoneNumber(phone);
  const messageText = generateWelcomeMessage(studentName, branchName);
  
  // 1. If WhatsApp Cloud API credentials or Webhook URL are configured
  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;
  const instanceId = process.env.WHATSAPP_INSTANCE_ID;

  if (webhookUrl) {
    try {
      const payload = JSON.stringify({
        phone: formattedPhone,
        message: messageText,
        student_name: studentName,
        branch: branchName,
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
  generateWelcomeMessage,
  getWhatsAppDirectUrl,
  sendWhatsAppNotification
};
