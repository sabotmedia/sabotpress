CREATE TABLE IF NOT EXISTS site_domains (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  base_path TEXT NOT NULL DEFAULT '/',
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_site_domains_status ON site_domains(status);
CREATE INDEX IF NOT EXISTS idx_site_domains_updated_at ON site_domains(updated_at DESC);
