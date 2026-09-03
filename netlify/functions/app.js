const serverless = require("serverless-http");
const app = require("../../src/app");

// Safeguard against unhandled rejections that cause Runtime.ExitError: exit status 1
process.on("unhandledRejection", (reason, promise) => {
  console.error("Critical: Unhandled Rejection in Netlify Function:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Critical: Uncaught Exception in Netlify Function:", err);
});

const serverlessHandler = serverless(app, {
  binary: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/octet-stream",
    "application/pdf",
    "image/*",
    "*/*"
  ]
});

module.exports.handler = async (event, context) => {
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }
  try {
    return await serverlessHandler(event, context);
  } catch (err) {
    console.error("Top-level Netlify Function Handler Exception:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: "حدث خطأ غير متوقع في معالجة طلب الدالة",
        details: err.message || String(err)
      })
    };
  }
};
