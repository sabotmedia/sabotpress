CREATE TABLE IF NOT EXISTS native_public_content (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  content_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  target TEXT NOT NULL DEFAULT 'general',
  content_type TEXT NOT NULL DEFAULT 'note',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_native_public_content_status
ON native_public_content(status);

CREATE INDEX IF NOT EXISTS idx_native_public_content_target
ON native_public_content(target);

CREATE INDEX IF NOT EXISTS idx_native_public_content_updated_at
ON native_public_content(updated_at DESC);
