import { resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import { databaseUnavailable, getBoundDb } from './_lib/database.js'
import { inferActorFromRequest, writeAuditLog } from './_lib/auditLog.js'

export async function onRequestOptions(context) {
  const permission = await resolvePublicSitePermission(context)
  return json({ ok: true, canEdit: permission.canEdit, mode: getBoundDb(context) ? 'd1' : 'unavailable' })
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url)
    const id = url.searchParams.get('id') || ''
    const slug = url.searchParams.get('slug') || ''
    const status = url.searchParams.get('status') || ''
    const permission = await resolvePublicSitePermission(context)
    const includeDrafts = permission.canEdit && url.searchParams.get('includeDrafts') === '1'
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('publication reads')
    await ensureTables(db)

    if (id || slug) {
      const item = await getPublication(db, id || slug)
      if (item && !includeDrafts && !isPublicPublication(item)) return json({ ok: true, mode: 'd1', item: null })
      return json({ ok: true, mode: 'd1', item })
    }

    let query = 'SELECT payload_json FROM publications'
    const params = []
    if (status) { query += ' WHERE status = ?'; params.push(status) }
    else if (!includeDrafts) query += " WHERE status = 'published'"
    query += ' ORDER BY updated_at DESC'
    const result = await db.prepare(query).bind(...params).all()
    return json({ ok: true, mode: 'd1', items: (result.results || []).map((row) => safeParse(row.payload_json)).filter(Boolean).filter((item) => includeDrafts || isPublicPublication(item)) })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

export async function onRequestDelete(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permission.canEdit) return json({ ok: false, error: permission.reason, canEdit: false }, 403)
    const url = new URL(context.request.url)
    const id = url.searchParams.get('id') || url.searchParams.get('slug') || ''
    if (!id) return json({ ok: false, error: 'missing id or slug' }, 400)
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('publication deletion')
    await ensureTables(db)
    const existing = await getPublication(db, id)
    await db.prepare('DELETE FROM publications WHERE id = ? OR slug = ?').bind(id, id).run()
    await writeAuditLog(db, { action: 'publications.delete', entityType: 'publication', entityId: id, actor: inferActorFromRequest(context.request), detail: existing ? { title: existing.title, slug: existing.slug } : { id } })
    return json({ ok: true, mode: 'd1', deleted: id })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

export async function onRequestPost(context) { return handleWrite(context) }
export async function onRequestPut(context) { return handleWrite(context) }

async function handleWrite(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permission.canEdit) return json({ ok: false, error: permission.reason, canEdit: false }, 403)
    const body = await context.request.json()
    const publication = body?.publication || body?.item || body
    if (!publication?.id || !publication?.slug || !publication?.title) return json({ ok: false, error: 'publication id, slug, and title are required' }, 400)
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('publication writes')
    await ensureTables(db)
    await upsertPublication(db, publication)
    await writeAuditLog(db, { action: 'publications.upsert', entityType: 'publication', entityId: publication.id, actor: inferActorFromRequest(context.request), detail: { title: publication.title, slug: publication.slug, status: publication.status || 'draft', visibility: publication.visibility || '' } })
    return json({ ok: true, mode: 'd1', item: publication })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 400)
  }
}

async function ensureTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS publications (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run()
}

async function getPublication(db, idOrSlug) {
  const row = await db.prepare('SELECT payload_json FROM publications WHERE id = ? OR slug = ? LIMIT 1').bind(idOrSlug, idOrSlug).first()
  return row ? safeParse(row.payload_json) : null
}

async function upsertPublication(db, publication) {
  await db.prepare(`
    INSERT INTO publications (id, slug, title, status, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug,
      title = excluded.title,
      status = excluded.status,
      payload_json = excluded.payload_json,
      updated_at = CURRENT_TIMESTAMP
  `).bind(publication.id, publication.slug, publication.title, publication.status || 'draft', JSON.stringify(publication), publication.createdAt || null).run()
}

function safeParse(value) { try { return JSON.parse(value) } catch { return null } }
function isPublicPublication(item = {}) { return item.status === 'published' || item.visibility === 'public' || item.visibility === 'unlisted' }
function json(data, status = 200) { return new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }) }
