const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { createClient } = require("@supabase/supabase-js");

// GET /download/:filename - Download file from Supabase Storage
router.get("/download/:filename", requireAuth, async (req, res) => {
  const { filename } = req.params;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(404).send("File not found");
  try {
    const client = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await client.storage.from("uploads").download(filename);
    if (error || !data) return res.status(404).send("File not found");
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
    const mimeMap = {
      ".pdf": "application/pdf",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xls": "application/vnd.ms-excel",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".txt": "text/plain",
    };
    res.setHeader("Content-Type", mimeMap[ext] || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    console.error("download error:", e);
    res.status(500).send("Download failed");
  }
});

module.exports = router;
