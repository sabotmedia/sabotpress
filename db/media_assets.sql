CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  credit TEXT NOT NULL DEFAULT '',
  media_type TEXT NOT NULL DEFAULT 'image',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Existing installations are upgraded idempotently by
-- functions/api/_lib/mediaAssets.js. metadata_json contains the extended
-- media record: description, attribution, creator, license, license URL,
-- source URL, folder, tags, MIME type, filename, size, extension, R2 key,
-- source label, and download URL.

CREATE INDEX IF NOT EXISTS idx_media_assets_updated_at
ON media_assets(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_assets_media_type
ON media_assets(media_type);