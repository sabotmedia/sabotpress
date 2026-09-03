import { permissionHasCapability, resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import { writeAuditLog } from './_lib/auditLog.js'

const STATUS_OPTIONS = new Set(['connected', 'planned', 'needs DNS', 'disabled'])

export async function onRequestGet(context) {
  const permission = await resolvePublicSitePermission(context)
  if (!permissionHasCapability(permission, 'site:manage')) return json({ ok: false, error: 'site-management permission required' }, 403)
  if (!context.env?.BF_DB) return json({ ok: false, error: 'site registry unavailable: BF_DB is not bound' }, 503)

  try {
    await ensureSitesTable(context.env.BF_DB)
    const result = await context.env.BF_DB.prepare(`SELECT id, name, domain, base_path, status, notes, created_at, updated_at FROM site_domains ORDER BY name COLLATE NOCASE ASC`).all()
    return json({ ok: true, mode: 'd1', items: (result?.results || []).map(rowToSite) })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

export async function onRequestPost(context) {
  const permission = await resolvePublicSitePermission(context)
  if (!permissionHasCapability(permission, 'site:manage')) return json({ ok: false, error: 'site-management permission required' }, 403)
  if (!context.env?.BF_DB) return json({ ok: false, error: 'site registry unavailable: BF_DB is not bound' }, 503)

  try {
    const body = await context.request.json()
    const item = normalizeSite(body?.item || body || {})
    if (!item.name || !item.domain) return json({ ok: false, error: 'site name and domain are required' }, 400)
    if (!isValidHostname(item.domain)) return json({ ok: false, error: 'enter a hostname only, such as news.example.org (no path, port, or URL)' }, 400)
    await ensureSitesTable(context.env.BF_DB)
    await context.env.BF_DB.prepare(`INSERT INTO site_domains (id, name, domain, base_path, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, domain = excluded.domain, base_path = excluded.base_path,
      status = excluded.status, notes = excluded.notes, updated_at = excluded.updated_at`).bind(
      item.id, item.name, item.domain, item.basePath, item.status, item.notes, item.createdAt, item.updatedAt,
    ).run()
    await writeAuditLog(context.env.BF_DB, {
      action: 'sites.upsert', entityType: 'site_domain', entityId: item.id, actor: permission.actor,
      detail: { domain: item.domain, basePath: item.basePath, status: item.status },
    })
    return json({ ok: true, mode: 'd1', item })
  } catch (error) {
    const message = String(error?.message || error)
    return json({ ok: false, error: message }, /unique|constraint/i.test(message) ? 409 : 400)
  }
}

export async function onRequestDelete(context) {
  const permission = await resolvePublicSitePermission(context)
  if (!permissionHasCapability(permission, 'site:manage')) return json({ ok: false, error: 'site-management permission required' }, 403)
  if (!context.env?.BF_DB) return json({ ok: false, error: 'site registry unavailable: BF_DB is not bound' }, 503)
  const url = new URL(context.request.url)
  const id = String(url.searchParams.get('id') || '').trim()
  if (!id) return json({ ok: false, error: 'missing site id' }, 400)

  try {
    await ensureSitesTable(context.env.BF_DB)
    const existing = await context.env.BF_DB.prepare('SELECT domain FROM site_domains WHERE id = ? LIMIT 1').bind(id).first()
    await context.env.BF_DB.prepare('DELETE FROM site_domains WHERE id = ?').bind(id).run()
    await writeAuditLog(context.env.BF_DB, {
      action: 'sites.delete', entityType: 'site_domain', entityId: id, actor: permission.actor, detail: existing || { id },
    })
    return json({ ok: true, mode: 'd1', deleted: id })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

async function ensureSitesTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS site_domains (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT NOT NULL UNIQUE, base_path TEXT NOT NULL DEFAULT '/',
    status TEXT NOT NULL DEFAULT 'planned', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_site_domains_status ON site_domains(status)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_site_domains_updated_at ON site_domains(updated_at DESC)').run()
}

function normalizeSite(input = {}) {
  const now = new Date().toISOString()
  const domain = normalizeDomain(input.domain)
  const status = STATUS_OPTIONS.has(input.status) ? input.status : 'planned'
  return {
    id: String(input.id || `site-${crypto.randomUUID()}`), name: String(input.name || '').trim(), domain,
    basePath: normalizeBasePath(input.basePath || input.base_path), status, notes: String(input.notes || '').trim(),
    createdAt: String(input.createdAt || input.created_at || now), updatedAt: now,
  }
}

function rowToSite(row = {}) {
  return {
    id: String(row.id || ''), name: String(row.name || ''), domain: String(row.domain || ''), basePath: String(row.base_path || '/'),
    status: String(row.status || 'planned'), notes: String(row.notes || ''), createdAt: String(row.created_at || ''), updatedAt: String(row.updated_at || ''),
  }
}

function normalizeDomain(value) { return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') }
function isValidHostname(value) {
  const hostname = String(value || '')
  if (hostname.length > 253 || hostname.includes('/') || hostname.includes(':') || hostname.includes('..')) return false
  return hostname.split('.').length >= 2 && hostname.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
}
function normalizeBasePath(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed || trimmed === '/') return '/'
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`
}
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}
