-- GK BY PURUSHOTAM SIR — Separate CBT Mock Test Database Setup V11
-- इसे Turso database shell में एक बार चलाएँ। Target Batch Supabase पर इसका कोई असर नहीं होगा।

CREATE TABLE IF NOT EXISTS cbt_subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_key TEXT NOT NULL UNIQUE,
  subject_name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cbt_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_key TEXT NOT NULL,
  topic_key TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subject_key, topic_key)
);

CREATE TABLE IF NOT EXISTS cbt_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_key TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  topic_key TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'normal' CHECK(difficulty IN ('easy','normal','tough')),
  question_type TEXT NOT NULL DEFAULT 'mcq' CHECK(question_type IN ('mcq','one_liner')),
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL DEFAULT '',
  option_b TEXT NOT NULL DEFAULT '',
  option_c TEXT NOT NULL DEFAULT '',
  option_d TEXT NOT NULL DEFAULT '',
  answer_index INTEGER NOT NULL DEFAULT -1,
  answer_text TEXT NOT NULL DEFAULT '',
  explanation TEXT NOT NULL DEFAULT '',
  image_key TEXT NOT NULL DEFAULT '' CHECK(length(image_key) <= 500 AND image_key NOT LIKE 'data:image%'),
  fingerprint TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cbt_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auth_user_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  subject_label TEXT NOT NULL,
  topic_label TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'all',
  total_questions INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0,
  total_marks REAL NOT NULL DEFAULT 0,
  percentage REAL NOT NULL DEFAULT 0,
  negative_marking INTEGER NOT NULL DEFAULT 0,
  time_taken_seconds INTEGER NOT NULL DEFAULT 0,
  selected_units_json TEXT NOT NULL DEFAULT '[]',
  subject_result_json TEXT NOT NULL DEFAULT '[]',
  topic_result_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cbt_topics_subject ON cbt_topics(subject_key, active, display_order);
CREATE INDEX IF NOT EXISTS idx_cbt_questions_pool ON cbt_questions(subject_key, topic_key, question_type, difficulty, active);
CREATE INDEX IF NOT EXISTS idx_cbt_questions_active ON cbt_questions(active);
CREATE INDEX IF NOT EXISTS idx_cbt_attempts_user ON cbt_attempts(auth_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cbt_attempts_topper ON cbt_attempts(percentage DESC, score DESC, time_taken_seconds ASC);

INSERT OR IGNORE INTO cbt_subjects(subject_key,subject_name,display_order) VALUES
('haryana_gk','Haryana GK',1),
('indian_history','History',2),
('indian_polity','Polity',3),
('indian_geography','Geography',4),
('science','Science',5),
('indian_static_gk','Static GK',6),
('indian_economy','Economy',7),
('computer','Computer',8),
('current_affairs','Current Affairs',9);
