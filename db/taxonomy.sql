CREATE TABLE IF NOT EXISTS taxonomy_terms (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  taxonomy TEXT NOT NULL DEFAULT 'tag',
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS native_content_taxonomy (
  id TEXT PRIMARY KEY,
  native_content_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_taxonomy
ON taxonomy_terms(taxonomy);

CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_label
ON taxonomy_terms(label);

CREATE INDEX IF NOT EXISTS idx_native_content_taxonomy_native
ON native_content_taxonomy(native_content_id);

CREATE INDEX IF NOT EXISTS idx_native_content_taxonomy_term
ON native_content_taxonomy(term_id);
