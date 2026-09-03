CREATE TABLE IF NOT EXISTS native_public_content_revisions (
  id TEXT PRIMARY KEY,
  native_content_id TEXT NOT NULL,
  revision_json TEXT NOT NULL,
  revision_note TEXT NOT NULL DEFAULT 'autosave',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_native_public_content_revisions_native_id
ON native_public_content_revisions(native_content_id);

CREATE INDEX IF NOT EXISTS idx_native_public_content_revisions_created_at
ON native_public_content_revisions(created_at DESC);
