const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { withUser, userCan, userHasPermission } = require("../middleware/permissions");
const { getUsers, createUser, updateUser, deleteUser, getDefaultPermissions } = require("../services/users.service");
const { getBranchNames } = require("../services/branches.service");
const { addHistory } = require("../services/history.service");
const { ROLES, PERMISSIONS, PHASES } = require("../utils/constants");
const XLSX = require("xlsx");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function uploadFilesToSupabase(files) {
  if (!files || !files.length) return [];
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return [];
  const client = createClient(supabaseUrl, supabaseKey);
  const results = [];
  for (const file of files) {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[\/\\]/g, "_");
    const filename = `${timestamp}_${safeName}`;
    const { error } = await client.storage.from("uploads").upload(filename, file.buffer, { contentType: file.mimetype });
    if (!error) {
      const { data: urlData } = client.storage.from("uploads").getPublicUrl(filename);
      results.push({ filename, original_name: safeName, url: urlData.publicUrl });
    }
  }
  return results;
}

// GET /users
router.get("/users", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin") || !userHasPermission(currentUser, "manage_users")) return res.redirect("/");
  let usersList = await getUsers();
  const query = (req.query.q || "").toLowerCase();
  const roleFilter = req.query.role_filter || "";
  if (query) usersList = usersList.filter(u => (u.full_name || "").toLowerCase().includes(query) || (u.username || "").toLowerCase().includes(query) || (u.phone || "").includes(query) || (u.job_title || "").toLowerCase().includes(query));
  if (roleFilter) usersList = usersList.filter(u => u.role === roleFilter);
  const branches = await getBranchNames();
  res.render("users", { users: usersList, message: null, roles: ROLES, permissions: PERMISSIONS, branches, phases: PHASES, currentUser, query, roleFilter });
});

// POST /users
router.post("/users", requireAuth, withUser, upload.array("attachments", 5), async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin") || !userHasPermission(currentUser, "manage_users")) return res.redirect("/");
  const { mode, username, password, role, full_name, phone, tasks, job_title } = req.body;
  const allBranches = req.body.all_branches === "1";
  const allPhases = req.body.all_phases === "1";
  let selectedBranches = req.body.branches ? (Array.isArray(req.body.branches) ? req.body.branches : [req.body.branches]) : [];
  let selectedPhases = req.body.phases ? (Array.isArray(req.body.phases) ? req.body.phases : [req.body.phases]) : [];
  if (allBranches) selectedBranches = ["\u0627\u0644\u0643\u0644"];
  if (allPhases) selectedPhases = ["\u0627\u0644\u0643\u0644"];
  const permissionsObj = {};
  for (const key of Object.keys(PERMISSIONS)) {
    permissionsObj[key] = req.body[key] === "1" || Array.isArray(req.body[key]);
  }
  const uploadedFiles = await uploadFilesToSupabase(req.files || []);
  let message = null;
  let usersList = await getUsers();
  const branches = await getBranchNames();

  if (mode === "edit") {
    const updates = {
      role: role || "viewer",
      full_name: full_name || "",
      phone: phone || "",
      tasks: tasks || "",
      job_title: job_title || "",
      permissions: permissionsObj,
      branches: selectedBranches,
      phases: selectedPhases,
      branch: selectedBranches[0] || "",
      phase: selectedPhases[0] || "",
    };
    if (password && password.trim()) updates.password = password.trim();
    if (uploadedFiles.length) {
      const existing = usersList.find(u => u.username === username);
      updates.attachments = [...(existing ? existing.attachments || [] : []), ...uploadedFiles];
    }
    await updateUser(username, updates);
    await addHistory("user_updated", `\u062a\u0645 \u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 ${username}`, currentUser.username);
    message = "\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 \u0628\u0646\u062c\u0627\u062d";
  } else {
    if (!username || !password || !full_name || !phone) { message = "\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u062c\u0645\u064a\u0639 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0623\u0633\u0627\u0633\u064a\u0629"; }
    else if (usersList.find(u => u.username === username)) { message = "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 \u0645\u0648\u062c\u0648\u062f \u0645\u0633\u0628\u0642\u0627\u064b"; }
    else {
      const newUser = await createUser({ username, password, role: role || "viewer", full_name, phone, tasks: tasks || "", job_title: job_title || "", permissions: permissionsObj, branches: selectedBranches, phases: selectedPhases });
      if (newUser && uploadedFiles.length) {
        await updateUser(username, { attachments: uploadedFiles });
      }
      if (newUser) { await addHistory("user_created", `\u062a\u0645 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 ${username}`, currentUser.username); message = "\u062a\u0645 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 \u0628\u0646\u062c\u0627\u062d"; }
      else { message = "\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645"; }
    }
  }
  usersList = await getUsers();
  res.render("users", { users: usersList, message, roles: ROLES, permissions: PERMISSIONS, branches, phases: PHASES, currentUser, query: "", roleFilter: "" });
});

// POST /users/delete/:username
router.post("/users/delete/:username", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin") || !userHasPermission(currentUser, "manage_users")) return res.redirect("/");
  const username = req.params.username;
  if (username === "admin") return res.redirect("/users");
  await deleteUser(username);
  await addHistory("user_deleted", `\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 ${username}`, currentUser.username);
  res.redirect("/users");
});

// GET /users/export
router.get("/users/export", requireAuth, withUser, async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser || !userCan(currentUser, "admin") || !userHasPermission(currentUser, "manage_users")) return res.redirect("/");
  const usersList = await getUsers();
  const wb = XLSX.utils.book_new();
  const rows = usersList.map(u => ({
    "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644": u.full_name || "",
    "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645": u.username || "",
    "\u0631\u0642\u0645 \u0627\u0644\u062c\u0648\u0627\u0644": u.phone || "",
    "\u0627\u0644\u0648\u0638\u064a\u0641\u0629": u.job_title || "",
    "\u0627\u0644\u0645\u0647\u0627\u0645": u.tasks || "",
    "\u0627\u0644\u062f\u0648\u0631": ROLES[u.role] || u.role || "",
    "\u0627\u0644\u0635\u0644\u0627\u062d\u064a\u0627\u062a": Object.entries(u.permissions || {}).filter(([, v]) => v).map(([k]) => PERMISSIONS[k] || k).join(", "),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u064a\u0646");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  await addHistory("export_users", "\u062a\u0645 \u062a\u0635\u062f\u064a\u0631 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u064a\u0646", currentUser.username);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=users.xlsx");
  res.send(buf);
});

module.exports = router;
