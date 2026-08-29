-- ============================================================
-- Supabase Database Schema for Bawakeer Student System
-- ============================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  tasks TEXT DEFAULT '',
  job_title TEXT DEFAULT '',
  branch TEXT DEFAULT '',
  phase TEXT DEFAULT '',
  branches JSONB DEFAULT '[]',
  phases JSONB DEFAULT '[]',
  permissions JSONB DEFAULT '{}',
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Students table
CREATE TABLE IF NOT EXISTS students (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  date_of_birth TEXT DEFAULT '',
  nationality TEXT DEFAULT '',
  neighborhood TEXT DEFAULT '',
  interview_date TEXT DEFAULT '',
  interview_result TEXT DEFAULT '',
  interview_reason TEXT DEFAULT '',
  followup_status TEXT DEFAULT '',
  registration_reason TEXT DEFAULT '',
  student_type TEXT DEFAULT '',
  track TEXT DEFAULT '',
  phase TEXT DEFAULT '',
  grade TEXT DEFAULT '',
  branch TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  attachments JSONB DEFAULT '[]',
  academic_year_id BIGINT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- History (audit log)
CREATE TABLE IF NOT EXISTS history (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  details TEXT DEFAULT '',
  username TEXT DEFAULT 'unknown',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Student history
CREATE TABLE IF NOT EXISTS student_history (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  details TEXT DEFAULT '',
  username TEXT DEFAULT 'unknown',
  field_changes JSONB DEFAULT '[]',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Academic years
CREATE TABLE IF NOT EXISTS academic_years (
  id BIGSERIAL PRIMARY KEY,
  year_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  created_by TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Branches
CREATE TABLE IF NOT EXISTS branches (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  location TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  created_by TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Default Data
-- ============================================================

-- Default academic year
INSERT INTO academic_years (year_name, is_active, created_by)
VALUES ('1448هـ', TRUE, 'admin')
ON CONFLICT DO NOTHING;

-- Default branches
INSERT INTO branches (name, location, is_active, created_by) VALUES
  ('الروابي', 'الرياض - حي الروابي', TRUE, 'admin'),
  ('الندى', 'الرياض - حي الندى', TRUE, 'admin')
ON CONFLICT (name) DO NOTHING;

-- NOTE: Create admin user via the app (first run) or manually:
-- Admin password hash for "Bawakeer@2026" - generate fresh using bcrypt

-- Enable RLS (Row Level Security) - optional for extra security
-- ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_students_branch ON students(branch);
CREATE INDEX IF NOT EXISTS idx_students_phase ON students(phase);
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_student_history_student_id ON student_history(student_id);
