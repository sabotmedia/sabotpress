CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  campaign_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status
  ON campaigns(status);

CREATE INDEX IF NOT EXISTS idx_campaigns_updated_at
  ON campaigns(updated_at DESC);
