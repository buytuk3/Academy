-- ================================================================
-- BuyTuk Reading Engine v4.0
-- Initial Database Migration
-- ================================================================

BEGIN;

-- ===== Users =====
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'student',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users(username);

-- ===== Teachers =====
CREATE TABLE IF NOT EXISTS teachers (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(200),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS teachers_user_idx ON teachers(user_id);

-- ===== Students =====
CREATE TABLE IF NOT EXISTS students (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name    VARCHAR(200),
  grade           VARCHAR(20),
  native_language VARCHAR(50) DEFAULT 'ar',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS students_user_idx ON students(user_id);

-- ===== Classrooms =====
CREATE TABLE IF NOT EXISTS classrooms (
  id          SERIAL PRIMARY KEY,
  teacher_id  INTEGER NOT NULL REFERENCES teachers(id),
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS classrooms_teacher_idx ON classrooms(teacher_id);

-- ===== Enrollments =====
CREATE TABLE IF NOT EXISTS enrollments (
  id           SERIAL PRIMARY KEY,
  classroom_id INTEGER NOT NULL REFERENCES classrooms(id),
  student_id   INTEGER NOT NULL REFERENCES students(id),
  enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(classroom_id, student_id)
);

-- ===== Passages =====
CREATE TABLE IF NOT EXISTS passages (
  id           SERIAL PRIMARY KEY,
  teacher_id   INTEGER NOT NULL REFERENCES teachers(id),
  classroom_id INTEGER REFERENCES classrooms(id),
  title        VARCHAR(500) NOT NULL,
  text         TEXT NOT NULL,
  difficulty   INTEGER NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  grade        VARCHAR(20),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS passages_teacher_idx ON passages(teacher_id);

-- ===== Sessions =====
CREATE TABLE IF NOT EXISTS sessions (
  id           SERIAL PRIMARY KEY,
  student_id   INTEGER NOT NULL REFERENCES students(id),
  passage_id   INTEGER NOT NULL REFERENCES passages(id),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS sessions_student_idx ON sessions(student_id);
CREATE INDEX IF NOT EXISTS sessions_passage_idx ON sessions(passage_id);

-- ===== Attempts =====
CREATE TABLE IF NOT EXISTS attempts (
  id             SERIAL PRIMARY KEY,
  session_id     INTEGER NOT NULL REFERENCES sessions(id),
  student_id     INTEGER NOT NULL REFERENCES students(id),
  passage_id     INTEGER NOT NULL REFERENCES passages(id),
  audio_key      TEXT,
  encrypted_key  TEXT,
  transcript     TEXT,
  duration_sec   REAL,
  job_id         TEXT,
  job_status     VARCHAR(20) DEFAULT 'pending',
  correlation_id TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS attempts_student_idx ON attempts(student_id);
CREATE INDEX IF NOT EXISTS attempts_session_idx ON attempts(session_id);

-- ===== Reports =====
CREATE TABLE IF NOT EXISTS reports (
  id                  SERIAL PRIMARY KEY,
  attempt_id          INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  overall_score       REAL NOT NULL,
  accuracy_score      REAL NOT NULL,
  pronunciation_score REAL NOT NULL,
  fluency_score       REAL NOT NULL,
  prosody_score       REAL NOT NULL,
  wpm                 REAL NOT NULL,
  data                JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS reports_attempt_idx ON reports(attempt_id);
CREATE INDEX IF NOT EXISTS reports_score_idx ON reports(overall_score);

-- ===== Phoneme Stats =====
CREATE TABLE IF NOT EXISTS phoneme_stats (
  id                SERIAL PRIMARY KEY,
  student_id        INTEGER NOT NULL REFERENCES students(id),
  phoneme           VARCHAR(20) NOT NULL,
  total_occurrences INTEGER NOT NULL DEFAULT 0,
  errors            INTEGER NOT NULL DEFAULT 0,
  last_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, phoneme)
);

-- ===== Mastery Records =====
CREATE TABLE IF NOT EXISTS mastery_records (
  id         SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  passage_id INTEGER NOT NULL REFERENCES passages(id),
  level      VARCHAR(30) NOT NULL,
  score      REAL NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 1,
  trend      VARCHAR(10),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, passage_id)
);

-- ===== Exercise Assignments =====
CREATE TABLE IF NOT EXISTS exercise_assignments (
  id          SERIAL PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES students(id),
  attempt_id  INTEGER REFERENCES attempts(id),
  exercise_id VARCHAR(100) NOT NULL,
  reason      TEXT,
  completed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== Audit Logs =====
CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER,
  action      VARCHAR(100) NOT NULL,
  resource    VARCHAR(100),
  resource_id TEXT,
  metadata    JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_action_idx ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_user_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs(created_at);

-- ===== API Keys =====
CREATE TABLE IF NOT EXISTS api_keys (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  key_hash     TEXT NOT NULL,
  user_id      INTEGER REFERENCES users(id),
  expires_at   TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys(key_hash);

-- ===== Updated At Triggers =====
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER phoneme_stats_updated_at
  BEFORE UPDATE ON phoneme_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
