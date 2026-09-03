CREATE TABLE IF NOT EXISTS native_content_sources (
  id TEXT PRIMARY KEY,
  native_content_id TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_label TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  source_external_id TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_native_content_sources_native_id
ON native_content_sources(native_content_id);

CREATE INDEX IF NOT EXISTS idx_native_content_sources_source_type
ON native_content_sources(source_type);
