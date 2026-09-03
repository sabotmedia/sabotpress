import { resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import { writeAuditLog, inferActorFromRequest } from './_lib/auditLog.js'
import { databaseUnavailable, getBoundDb } from './_lib/database.js'

const COLLECTIONS_SCHEMA_VERSION = 1

export async function onRequestOptions(context) {
  const permission = await resolvePublicSitePermission(context)
  return json({
    ok: true,
    canEdit: permission.canEdit,
    authMode: permission.mode,
    mode: getBoundDb(context) ? 'd1' : 'unavailable',
  })
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url)
    const permission = await resolvePublicSitePermission(context)
    const id = url.searchParams.get('id') || ''
    const slug = url.searchParams.get('slug') || ''
    const includeDrafts = permission.canEdit && url.searchParams.get('includeDrafts') === '1'
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('collection reads')

    await ensureCollectionsTable(db)

    if (id || slug) {
      const item = await getCollection(db, id || slug)
      if (!item || (!includeDrafts && item.status !== 'published')) {
        return json({ ok: true, mode: 'd1', item: null })
      }
      return json({ ok: true, mode: 'd1', item })
    }

    const items = await listCollections(db, { includeDrafts })
    return json({ ok: true, mode: 'd1', items })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

export async function onRequestPost(context) { return handleWrite(context) }
export async function onRequestPut(context) { return handleWrite(context) }

export async function onRequestDelete(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permission.canEdit) return json({ ok: false, error: permission.reason, canEdit: false }, 403)

    const url = new URL(context.request.url)
    const id = url.searchParams.get('id') || url.searchParams.get('slug') || ''
    if (!id) return json({ ok: false, error: 'missing id or slug' }, 400)

    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('collection deletion')

    await ensureCollectionsTable(db)
    const existing = await getCollection(db, id)
    await db.prepare('DELETE FROM collections WHERE id = ? OR slug = ?').bind(id, id).run()
    await writeAuditLog(db, {
      action: 'collections.delete',
      entityType: 'collection',
      entityId: id,
      actor: inferActorFromRequest(context.request),
      detail: existing || { id },
    })

    return json({ ok: true, mode: 'd1', deleted: id })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

async function handleWrite(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permission.canEdit) return json({ ok: false, error: permission.reason, canEdit: false }, 403)

    const body = await context.request.json()
    const item = normalizeCollection(body?.item || body || {})
    if (!item.title || !item.slug) return json({ ok: false, error: 'missing title or slug' }, 400)

    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('collection writes')

    await ensureCollectionsTable(db)
    const saved = await upsertCollection(db, item)
    await writeAuditLog(db, {
      action: 'collections.upsert',
      entityType: 'collection',
      entityId: saved.id,
      actor: inferActorFromRequest(context.request),
      detail: { status: saved.status, slug: saved.slug, pieceCount: saved.pieceSlugs.length },
    })

    return json({ ok: true, mode: 'd1', item: saved })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 400)
  }
}

async function ensureCollectionsTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    collection_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published',
    title TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_collections_status ON collections(status)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_collections_updated_at ON collections(updated_at DESC)').run()
}

async function listCollections(db, options = {}) {
  await ensureCollectionsTable(db)
  const where = options.includeDrafts ? '' : "WHERE status = 'published'"
  const result = await db.prepare(`SELECT id, slug, collection_json, status, title, created_at, updated_at
    FROM collections ${where} ORDER BY title ASC`).all()
  const rows = Array.isArray(result?.results) ? result.results : []
  return rows.map(rowToCollection)
}

async function getCollection(db, idOrSlug) {
  await ensureCollectionsTable(db)
  const row = await db.prepare(`SELECT id, slug, collection_json, status, title, created_at, updated_at
    FROM collections WHERE id = ? OR slug = ? LIMIT 1`).bind(idOrSlug, idOrSlug).first()
  return row ? rowToCollection(row) : null
}

async function upsertCollection(db, item) {
  const normalized = normalizeCollection(item)
  await db.prepare(`INSERT INTO collections (id, slug, collection_json, status, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug,
      collection_json = excluded.collection_json,
      status = excluded.status,
      title = excluded.title,
      updated_at = excluded.updated_at`)
    .bind(normalized.id, normalized.slug, JSON.stringify(normalized), normalized.status, normalized.title, normalized.createdAt, normalized.updatedAt)
    .run()
  return normalized
}

function rowToCollection(row) {
  let parsed = {}
  try { parsed = JSON.parse(row.collection_json || '{}') } catch { parsed = {} }
  return normalizeCollection({
    ...parsed,
    id: row.id,
    slug: row.slug,
    status: row.status,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function normalizeCollection(input = {}) {
  const now = new Date().toISOString()
  const title = String(input.title || '')
  const slug = slugify(input.slug || title || input.id)
  return {
    id: String(input.id || `collection-${crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10)}`),
    schemaVersion: COLLECTIONS_SCHEMA_VERSION,
    status: ['draft', 'published', 'archived'].includes(input.status) ? input.status : 'published',
    title,
    slug,
    subtitle: String(input.subtitle || ''),
    description: String(input.description || ''),
    coverImage: String(input.coverImage || ''),
    pieceSlugs: Array.isArray(input.pieceSlugs) ? input.pieceSlugs.map(String).filter(Boolean) : [],
    createdAt: String(input.createdAt || now),
    updatedAt: now,
  }
}

function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
