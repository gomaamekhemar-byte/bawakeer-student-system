require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");

const app = express();

// =============================================
// Middleware
// =============================================
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(express.json({ limit: "20mb" }));
app.use(cookieParser());

// Static files
app.use("/public", express.static(path.join(__dirname, "../public")));

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// =============================================
// Routes
// =============================================
app.use("/", require("./routes/auth.routes"));
app.use("/", require("./routes/students.routes"));
app.use("/", require("./routes/users.routes"));
app.use("/", require("./routes/history.routes"));
app.use("/", require("./routes/export.routes"));
app.use("/", require("./routes/academic.routes"));
app.use("/", require("./routes/analytics.routes"));
app.use("/", require("./routes/uploads.routes"));
app.use("/", require("./routes/setup.routes"));

// =============================================
// Error Handlers
// =============================================
app.use((req, res, next) => {
  res.status(404).render("error", { error_code: 404, error_message: "الصفحة غير موجودة" });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render("error", { error_code: 500, error_message: "خطأ داخلي في الخادم" });
});

// =============================================
// Local server (dev only)
// =============================================
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
