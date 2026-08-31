const serverless = require("serverless-http");
const app = require("../../src/app");

module.exports.handler = serverless(app, {
  binary: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/octet-stream",
    "application/pdf",
    "image/*",
    "*/*"
  ]
});
