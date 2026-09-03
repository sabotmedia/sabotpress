import { normalizePublicConfig, PUBLIC_CONFIG_SCHEMA_VERSION } from './publicConfigSchema.js'

export async function ensurePublicSiteConfigTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS public_site_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL UNIQUE,
    config_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run()

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_public_site_configs_scope ON public_site_configs(scope)').run()

  await db
    .prepare('INSERT OR IGNORE INTO public_site_configs (scope, config_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
    .bind('global', '{}')
    .run()
}

export async function readPublicSiteConfig(db, scope = 'global') {
  await ensurePublicSiteConfigTable(db)

  const row = await db
    .prepare('SELECT id, scope, config_json, updated_at FROM public_site_configs WHERE scope = ? LIMIT 1')
    .bind(scope)
    .first()

  if (!row) {
    return {
      id: null,
      scope,
      config: normalizePublicConfig({}),
      updatedAt: null,
      version: PUBLIC_CONFIG_SCHEMA_VERSION,
    }
  }

  let parsed = {}
  try {
    parsed = JSON.parse(row.config_json || '{}')
  } catch {
    parsed = {}
  }

  return {
    id: row.id ?? null,
    scope: row.scope,
    config: normalizePublicConfig(parsed),
    updatedAt: row.updated_at || null,
    version: Number(parsed?.version || PUBLIC_CONFIG_SCHEMA_VERSION),
  }
}

export async function writePublicSiteConfig(db, config, scope = 'global') {
  await ensurePublicSiteConfigTable(db)
  const normalized = normalizePublicConfig(config)
  const json = JSON.stringify(normalized)

  await db
    .prepare(`INSERT INTO public_site_configs (scope, config_json, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(scope) DO UPDATE SET config_json = excluded.config_json, updated_at = CURRENT_TIMESTAMP`)
    .bind(scope, json)
    .run()

  return await readPublicSiteConfig(db, scope)
}

export { normalizePublicConfig, PUBLIC_CONFIG_SCHEMA_VERSION }
