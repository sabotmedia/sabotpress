CREATE TABLE IF NOT EXISTS native_public_content_translations (
  id TEXT PRIMARY KEY,
  native_content_id TEXT NOT NULL,
  language_code TEXT NOT NULL,
  language_label TEXT NOT NULL DEFAULT '',
  translation_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  provider TEXT NOT NULL DEFAULT 'manual',
  translator_credit TEXT NOT NULL DEFAULT '',
  reviewer_credit TEXT NOT NULL DEFAULT '',
  external_url TEXT NOT NULL DEFAULT '',
  weblate_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  published_at TEXT,
  UNIQUE(native_content_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_native_public_content_translations_content
ON native_public_content_translations(native_content_id);

CREATE INDEX IF NOT EXISTS idx_native_public_content_translations_status
ON native_public_content_translations(status);

CREATE INDEX IF NOT EXISTS idx_native_public_content_translations_language
ON native_public_content_translations(language_code);
