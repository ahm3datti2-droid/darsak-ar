-- درسك AR — مخطط قاعدة بيانات D1 (SQLite)
-- نفّذ هذا الملف كاملًا من تبويب Console في لوحة D1
-- Cloudflare D1: https://dash.cloudflare.com → Workers & Pages → D1 → Console

PRAGMA foreign_keys = ON;

-- المعلّمون
CREATE TABLE IF NOT EXISTS teachers (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- الدروس
CREATE TABLE IF NOT EXISTS lessons (
  id          TEXT PRIMARY KEY,
  teacher_id  TEXT REFERENCES teachers(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  subject     TEXT NOT NULL DEFAULT '',
  grade       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  views       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- عناصر الدرس (شرائح AR)
CREATE TABLE IF NOT EXISTS items (
  id          TEXT PRIMARY KEY,
  lesson_id   TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  kind        TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image', 'model')),
  title       TEXT NOT NULL DEFAULT '',
  text_ar     TEXT NOT NULL DEFAULT '',
  text_en     TEXT NOT NULL DEFAULT '',
  file_url    TEXT NOT NULL DEFAULT '',
  glb_url     TEXT NOT NULL DEFAULT '',
  placement   TEXT NOT NULL DEFAULT 'wall' CHECK (placement IN ('wall', 'floor')),
  size        TEXT NOT NULL DEFAULT 'medium' CHECK (size IN ('small', 'medium', 'large')),
  audio_url   TEXT NOT NULL DEFAULT '',
  video_url   TEXT NOT NULL DEFAULT ''
);

-- فهارس
CREATE INDEX IF NOT EXISTS idx_lessons_teacher ON lessons(teacher_id);
CREATE INDEX IF NOT EXISTS idx_lessons_created ON lessons(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_lesson  ON items(lesson_id, sort_order);
