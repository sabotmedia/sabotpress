import { resolvePublicSitePermission, permissionHasCapability } from './_lib/publicSiteAuth.js'

const SETTING_KEY = 'backup_policy_v1'
const DEFAULT = { frequencyDays: 30, lastSuccessfulAt: '', lastAttemptAt: '', lastError: '', lastBackupKind: '', mediaIncluded: false }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}
async function ensure(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS site_settings (setting_key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run()
}
function normalize(value = {}) {
  return {
    frequencyDays: Math.min(365, Math.max(1, Number(value.frequencyDays) || 30)),
    lastSuccessfulAt: String(value.lastSuccessfulAt || ''),
    lastAttemptAt: String(value.lastAttemptAt || ''),
    lastError: String(value.lastError || ''),
    lastBackupKind: String(value.lastBackupKind || ''),
    mediaIncluded: Boolean(value.mediaIncluded),
  }
}

export async function onRequestGet(context) {
  if (!context.env.BF_DB) return json({ ok: true, mode: 'defaults', policy: DEFAULT, overdue: false })
  await ensure(context.env.BF_DB)
  const row = await context.env.BF_DB.prepare('SELECT value_json FROM site_settings WHERE setting_key = ? LIMIT 1').bind(SETTING_KEY).first()
  let policy = DEFAULT
  try { if (row?.value_json) policy = normalize(JSON.parse(row.value_json)) } catch {}
  const last = Date.parse(policy.lastSuccessfulAt || '')
  const overdue = !last || Date.now() - last > policy.frequencyDays * 86400000
  return json({ ok: true, mode: 'd1', policy, overdue })
}

export async function onRequestPost(context) {
  const permission = await resolvePublicSitePermission(context)
  if (!permissionHasCapability(permission, 'system:view')) return json({ ok: false, error: 'system permission required' }, 403)
  if (!context.env.BF_DB) return json({ ok: false, error: 'BF_DB is not configured' }, 503)
  const body = await context.request.json().catch(() => ({}))
  const policy = normalize(body.policy || body)
  await ensure(context.env.BF_DB)
  await context.env.BF_DB.prepare(`INSERT INTO site_settings (setting_key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`).bind(SETTING_KEY, JSON.stringify(policy)).run()
  return json({ ok: true, policy })
}
