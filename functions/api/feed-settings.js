import { resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import { inferActorFromRequest, writeAuditLog } from './_lib/auditLog.js'

const SETTING_KEY = 'feed-settings-v1'

export async function onRequestGet(context) {
  if (!context.env?.BF_DB) return json({ ok: false, error: 'feed settings unavailable: BF_DB is not bound' }, 503)
  try {
    await ensureTable(context.env.BF_DB)
    const row = await context.env.BF_DB.prepare('SELECT value_json, updated_at FROM site_settings WHERE setting_key = ? LIMIT 1').bind(SETTING_KEY).first()
    return json({ ok: true, mode: 'd1', settings: parseSettings(row?.value_json), updatedAt: row?.updated_at || '' })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

export async function onRequestPost(context) {
  const permission = await resolvePublicSitePermission(context)
  if (!permission.canEdit) return json({ ok: false, error: permission.reason || 'authentication required' }, 403)
  if (!context.env?.BF_DB) return json({ ok: false, error: 'feed settings unavailable: BF_DB is not bound' }, 503)

  try {
    const body = await context.request.json()
    const settings = body?.settings && typeof body.settings === 'object' ? body.settings : null
    if (!settings) return json({ ok: false, error: 'missing feed settings' }, 400)
    await ensureTable(context.env.BF_DB)
    const now = new Date().toISOString()
    await context.env.BF_DB.prepare(`INSERT INTO site_settings (setting_key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`)
      .bind(SETTING_KEY, JSON.stringify(settings), now)
      .run()
    await writeAuditLog(context.env.BF_DB, {
      action: 'feeds.settings.update',
      entityType: 'site_setting',
      entityId: SETTING_KEY,
      actor: inferActorFromRequest(context.request),
      detail: { updatedAt: now },
    })
    return json({ ok: true, mode: 'd1', settings, updatedAt: now })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 400)
  }
}

export async function onRequestDelete(context) {
  const permission = await resolvePublicSitePermission(context)
  if (!permission.canEdit) return json({ ok: false, error: permission.reason || 'authentication required' }, 403)
  if (!context.env?.BF_DB) return json({ ok: false, error: 'feed settings unavailable: BF_DB is not bound' }, 503)
  try {
    await ensureTable(context.env.BF_DB)
    await context.env.BF_DB.prepare('DELETE FROM site_settings WHERE setting_key = ?').bind(SETTING_KEY).run()
    await writeAuditLog(context.env.BF_DB, {
      action: 'feeds.settings.reset',
      entityType: 'site_setting',
      entityId: SETTING_KEY,
      actor: inferActorFromRequest(context.request),
      detail: {},
    })
    return json({ ok: true, mode: 'd1' })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS site_settings (
    setting_key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_site_settings_updated_at ON site_settings(updated_at DESC)').run()
}

function parseSettings(value) {
  try {
    const parsed = JSON.parse(String(value || 'null'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
