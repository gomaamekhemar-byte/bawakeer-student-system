/**
 * سكريبت ترحيل البيانات من ملفات JSON إلى Supabase
 * Migration script: JSON files -> Supabase
 * 
 * Usage:
 *   node supabase/migrate.js
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const OLD_DIR = path.join(__dirname, "../..");

function readJson(filename) {
  const filePath = path.join(OLD_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filename}`);
    return [];
  }
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content) || [];
  } catch (e) {
    console.error(`❌ Error reading ${filename}:`, e.message);
    return [];
  }
}

async function migrateUsers() {
  console.log("\n📋 Migrating users...");
  const users = readJson("users.json");
  if (!users.length) return console.log("   No users to migrate");

  for (const user of users) {
    // Check if password is already hashed
    const password = user.password && user.password.startsWith("scrypt:") 
      ? await bcrypt.hash("Bawakeer@2026", 12)  // Default password for scrypt users
      : user.password || await bcrypt.hash("Bawakeer@2026", 12);

    const { error } = await supabase.from("users").upsert({
      username: user.username,
      password: password,
      role: user.role || "viewer",
      full_name: user.full_name || user.username,
      phone: user.phone || "",
      tasks: user.tasks || "",
      job_title: user.job_title || "",
      branch: user.branch || "",
      phase: user.phase || "",
      branches: user.branches || [],
      phases: user.phases || [],
      permissions: user.permissions || {},
      attachments: user.attachments || [],
    }, { onConflict: "username" });

    if (error) console.error(`   ❌ User ${user.username}:`, error.message);
    else console.log(`   ✅ User: ${user.username}`);
  }
}

async function migrateStudents() {
  console.log("\n📋 Migrating students...");
  const students = readJson("students.json");
  if (!students.length) return console.log("   No students to migrate");

  // Insert in batches of 50
  for (let i = 0; i < students.length; i += 50) {
    const batch = students.slice(i, i + 50).map(s => ({
      id: s.id,
      name: s.name || "",
      phone: s.phone || "",
      date_of_birth: s.date_of_birth || "",
      nationality: s.nationality || "",
      neighborhood: s.neighborhood || "",
      interview_date: s.interview_date || "",
      interview_result: s.interview_result || "",
      interview_reason: s.interview_reason || "",
      followup_status: s.followup_status || "",
      registration_reason: s.registration_reason || "",
      student_type: s.student_type || "",
      track: s.track || "",
      phase: s.phase || "",
      grade: s.grade || "",
      branch: s.branch || "",
      notes: s.notes || "",
      attachments: s.attachments || [],
      updated_at: s.updated_at || new Date().toISOString(),
    }));

    const { error } = await supabase.from("students").upsert(batch, { onConflict: "id" });
    if (error) console.error(`   ❌ Batch ${i}-${i+50}:`, error.message);
    else console.log(`   ✅ Students batch ${i}-${Math.min(i+50, students.length)}`);
  }
}

async function migrateHistory() {
  console.log("\n📋 Migrating history...");
  const history = readJson("history.json");
  if (!history.length) return console.log("   No history to migrate");

  const rows = history.map(h => ({
    action: h.action || "",
    details: h.details || "",
    username: h.username || "unknown",
    timestamp: h.timestamp || new Date().toISOString(),
  }));

  const { error } = await supabase.from("history").insert(rows);
  if (error) console.error(`   ❌ History:`, error.message);
  else console.log(`   ✅ ${rows.length} history entries`);
}

async function migrateBranches() {
  console.log("\n📋 Migrating branches...");
  const branches = readJson("branches.json");
  if (!branches.length) return console.log("   No branches (will use defaults)");

  for (const b of branches) {
    const { error } = await supabase.from("branches").upsert({
      id: b.id,
      name: b.name,
      location: b.location || "",
      is_active: b.is_active !== false,
      created_by: b.created_by || "admin",
    }, { onConflict: "name" });
    if (error) console.error(`   ❌ Branch ${b.name}:`, error.message);
    else console.log(`   ✅ Branch: ${b.name}`);
  }
}

async function migrateAcademicYears() {
  console.log("\n📋 Migrating academic years...");
  const years = readJson("academic_years.json");
  if (!years.length) return console.log("   No academic years (will use defaults)");

  for (const y of years) {
    const { error } = await supabase.from("academic_years").upsert({
      id: y.id,
      year_name: y.year_name,
      is_active: y.is_active || false,
      created_by: y.created_by || "admin",
      created_at: y.created_at || new Date().toISOString(),
      closed_at: y.closed_at || null,
    }, { onConflict: "id" });
    if (error) console.error(`   ❌ Year ${y.year_name}:`, error.message);
    else console.log(`   ✅ Year: ${y.year_name}`);
  }
}

async function main() {
  console.log("🚀 Starting migration to Supabase...");
  console.log(`   URL: ${supabaseUrl}`);

  await migrateUsers();
  await migrateBranches();
  await migrateAcademicYears();
  await migrateStudents();
  await migrateHistory();

  console.log("\n✅ Migration complete!");
  console.log("\n📝 Note: Passwords for users migrated from scrypt were reset to 'Bawakeer@2026'");
  console.log("   Please update passwords after migration.");
}

main().catch(e => {
  console.error("❌ Migration failed:", e);
  process.exit(1);
});
