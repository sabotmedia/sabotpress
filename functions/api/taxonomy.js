import { resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import {
  ensureTaxonomyTables,
  listTaxonomyTerms,
  upsertTaxonomyTerm,
  deleteTaxonomyTerm,
} from './_lib/taxonomy.js'
import { writeAuditLog, inferActorFromRequest } from './_lib/auditLog.js'
import { databaseUnavailable, getBoundDb } from './_lib/database.js'

export async function onRequestOptions(context) {
  const permission = await resolvePublicSitePermission(context)

  return json({
    ok: true,
    canEdit: permission.canEdit,
    authMode: permission.mode,
    authReason: permission.reason,
    mode: getBoundDb(context) ? 'd1' : 'unavailable',
  })
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url)
    const taxonomy = url.searchParams.get('taxonomy') || ''
    const db = getBoundDb(context)

    if (!db) return databaseUnavailable('taxonomy reads')

    await ensureTaxonomyTables(db)
    const items = await listTaxonomyTerms(db, { taxonomy: taxonomy || undefined })

    return json({ ok: true, mode: 'd1', items })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

export async function onRequestPost(context) {
  try {
    const permission = await resolvePublicSitePermission(context)

    if (!permission.canEdit) {
      return json({ ok: false, error: permission.reason, canEdit: false }, 403)
    }

    const body = await context.request.json()
    const term = body?.term || body || {}
    const db = getBoundDb(context)

    if (!db) return databaseUnavailable('taxonomy writes')

    const saved = await upsertTaxonomyTerm(db, term)
    await writeAuditLog(db, {
      action: 'taxonomy.upsert',
      entityType: 'taxonomy_term',
      entityId: saved.id,
      actor: inferActorFromRequest(context.request),
      detail: saved,
    })
    return json({ ok: true, mode: 'd1', term: saved })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 400)
  }
}

export async function onRequestDelete(context) {
  try {
    const permission = await resolvePublicSitePermission(context)

    if (!permission.canEdit) {
      return json({ ok: false, error: permission.reason, canEdit: false }, 403)
    }

    const url = new URL(context.request.url)
    const id = url.searchParams.get('id') || ''

    if (!id) {
      return json({ ok: false, error: 'missing id' }, 400)
    }

    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('taxonomy deletion')

    const result = await deleteTaxonomyTerm(db, id)
    await writeAuditLog(db, {
      action: 'taxonomy.delete',
      entityType: 'taxonomy_term',
      entityId: id,
      actor: inferActorFromRequest(context.request),
      detail: result,
    })
    return json({ ok: true, mode: 'd1', ...result })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
