require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const querystring = require("querystring");

const app = express();

// =============================================
// CORS & Multi-Origin Credentials Support
// =============================================
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Cookie, Accept");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// =============================================
// Universal Body Parsing (Vercel + Netlify + Local)
// =============================================
// 1. If Vercel or Serverless pre-populated req.body as String or Buffer, parse it
app.use((req, res, next) => {
  if (req.body) {
    if (typeof req.body === "string") {
      try {
        req.body = JSON.parse(req.body);
      } catch (e) {
        try {
          req.body = querystring.parse(req.body);
        } catch (e2) {}
      }
    } else if (Buffer.isBuffer(req.body)) {
      const str = req.body.toString("utf8");
      try {
        req.body = JSON.parse(str);
      } catch (e) {
        try {
          req.body = querystring.parse(str);
        } catch (e2) {}
      }
    }
  }
  next();
});

// 2. Standard express parsers
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(express.json({ limit: "20mb" }));
app.use(cookieParser());

// Static files
app.use("/public", express.static(path.join(__dirname, "../public")));

// Find views directory across environments (Local / Netlify / Vercel Serverless)
function getViewsDir() {
  const candidates = [
    path.join(__dirname, "../views"),
    path.join(__dirname, "../../views"),
    path.join(process.cwd(), "views"),
    path.join(__dirname, "views"),
    path.join("/var/task", "views"),
    path.join(process.cwd(), "bawakeer-webapp/views"),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir)) return dir;
    } catch (e) {}
  }
  return path.join(process.cwd(), "views");
}

// View engine setup
app.engine("ejs", require("ejs").renderFile);
app.set("view engine", "ejs");
app.set("views", getViewsDir());

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
app.use("/", require("./routes/settings.routes"));

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
