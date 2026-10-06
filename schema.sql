-- stickers.stluker.com D1 schema. Safe to re-run (IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS stickers (
  id           TEXT PRIMARY KEY,            -- YYYY-MM-DD (America/Chicago date)
  created_at   TEXT NOT NULL,
  topic        TEXT NOT NULL,               -- helpdesk | network | security | cloud | devops | ai | legacy | meetings
  style        TEXT NOT NULL,               -- terminal | win95 | diecut | poster
  headline     TEXT NOT NULL,               -- plain-words joke, used for listing + search
  copy_json    TEXT NOT NULL,               -- style-specific text fields
  tags         TEXT,                        -- comma-separated
  scene        TEXT,                        -- Haiku's scene description
  image_prompt TEXT,                        -- full prompt sent to the image model
  alt_text     TEXT,
  text_model   TEXT,
  image_model  TEXT,                        -- 'none' if both image models failed that day
  has_art      INTEGER NOT NULL DEFAULT 0,
  votes        INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'published'   -- published | hidden
);
CREATE INDEX IF NOT EXISTS idx_stickers_topic  ON stickers (topic, id);
CREATE INDEX IF NOT EXISTS idx_stickers_style  ON stickers (style, id);
CREATE INDEX IF NOT EXISTS idx_stickers_votes  ON stickers (votes DESC, id);
CREATE INDEX IF NOT EXISTS idx_stickers_status ON stickers (status, id);

-- One +1 per visitor per sticker. voter = truncated SHA-256 of IP + secret salt (no raw IPs stored).
CREATE TABLE IF NOT EXISTS votes (
  sticker_id TEXT NOT NULL,
  voter      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (sticker_id, voter)
);

-- Heartbeat / audit log for every generation attempt (cron or manual).
CREATE TABLE IF NOT EXISTS runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  sticker_id  TEXT,
  trigger     TEXT,                         -- cron | manual
  ok          INTEGER NOT NULL,
  detail      TEXT
);
