CREATE TABLE IF NOT EXISTS public_site_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL UNIQUE,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO public_site_configs (scope, config_json, updated_at)
VALUES ('global', '{}', CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_public_site_configs_scope
ON public_site_configs(scope);
