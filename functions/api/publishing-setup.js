import { resolvePublicSitePermission, permissionHasCapability } from './_lib/publicSiteAuth.js'

const SETTING_KEY = 'publishing_setup_v1'
const MODULES = new Set(['articles', 'podcasts', 'campaigns', 'publications', 'translations', 'printlab', 'audiolab'])
const DEFAULT = {
  firstRunComplete: false,
  preset: 'simple',
  modules: ['articles'],
  identity: { name: 'SabotPress', description: '', logoUrl: '', primaryEditor: '' },
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}
async function ensure(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS site_settings (setting_key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run()
}
function normalize(raw = {}) {
  const modules = Array.isArray(raw.modules) ? [...new Set(raw.modules.filter((id) => MODULES.has(id)))] : ['articles']
  return {
    firstRunComplete: Boolean(raw.firstRunComplete),
    preset: ['simple', 'media', 'everything', 'custom'].includes(raw.preset) ? raw.preset : 'custom',
    modules: modules.length ? modules : ['articles'],
    identity: {
      name: String(raw.identity?.name || 'SabotPress').trim() || 'SabotPress',
      description: String(raw.identity?.description || '').trim(),
      logoUrl: String(raw.identity?.logoUrl || '').trim(),
      primaryEditor: String(raw.identity?.primaryEditor || '').trim(),
    },
  }
}

export async function onRequestGet(context) {
  if (!context.env.BF_DB) return json({ ok: true, mode: 'defaults', setup: DEFAULT })
  await ensure(context.env.BF_DB)
  const row = await context.env.BF_DB.prepare('SELECT value_json FROM site_settings WHERE setting_key = ? LIMIT 1').bind(SETTING_KEY).first()
  let setup = DEFAULT
  try { if (row?.value_json) setup = normalize(JSON.parse(row.value_json)) } catch {}
  return json({ ok: true, mode: 'd1', setup })
}

export async function onRequestPut(context) {
  const permission = await resolvePublicSitePermission(context)
  if (!permissionHasCapability(permission, 'site:manage')) return json({ ok: false, error: 'site management permission required' }, 403)
  if (!context.env.BF_DB) return json({ ok: false, error: 'BF_DB is not configured' }, 503)
  const body = await context.request.json().catch(() => ({}))
  const setup = normalize(body.setup || body)
  await ensure(context.env.BF_DB)
  await context.env.BF_DB.prepare(`INSERT INTO site_settings (setting_key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`).bind(SETTING_KEY, JSON.stringify(setup)).run()
  return json({ ok: true, mode: 'd1', setup })
}
