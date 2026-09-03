import {
  ensureNativePublicContentTable,
  ensureNativeRevisionTable,
  listNativeEntries,
  getNativeEntry,
  getExistingNativeEntry,
  upsertNativeEntry,
  deleteNativeEntry,
  saveRevisionSnapshot,
} from './_lib/nativePublicContent.js'
import { resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
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
    const permission = await resolvePublicSitePermission(context)
    const url = new URL(context.request.url)
    const id = url.searchParams.get('id') || ''
    const slug = url.searchParams.get('slug') || ''
    const status = url.searchParams.get('status') || ''
    const target = url.searchParams.get('target') || ''
    const workflowState = url.searchParams.get('workflowState') || ''
    const includeFuture = permission.canEdit && url.searchParams.get('includeFuture') === '1'
    const db = getBoundDb(context)

    if (!db) return databaseUnavailable('native content reads')

    await ensureNativePublicContentTable(db)
    await ensureNativeRevisionTable(db)

    if (id || slug) {
      const item = await getNativeEntry(db, id || slug, { includeFuture })
      return json({
        ok: true,
        mode: 'd1',
        item,
      })
    }

    const items = await listNativeEntries(db, {
      status: status || undefined,
      target: target || undefined,
      workflowState: workflowState || undefined,
      includeFuture,
    })

    return json({
      ok: true,
      mode: 'd1',
      items,
    })
  } catch (error) {
    return json({
      ok: false,
      error: String(error?.message || error),
    }, 500)
  }
}

export async function onRequestPost(context) {
  return handleWrite(context)
}

export async function onRequestPut(context) {
  return handleWrite(context)
}

export async function onRequestDelete(context) {
  try {
    const permission = await resolvePublicSitePermission(context)

    if (!permission.canEdit) {
      return json({
        ok: false,
        error: permission.reason,
        canEdit: false,
      }, 403)
    }

    const url = new URL(context.request.url)
    const id = url.searchParams.get('id') || url.searchParams.get('slug') || ''

    if (!id) {
      return json({
        ok: false,
        error: 'missing id or slug',
      }, 400)
    }

    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('native content deletion')

    const existing = await getExistingNativeEntry(db, id)
    if (existing) {
      await saveRevisionSnapshot(db, existing, 'delete:before')
    }

    const result = await deleteNativeEntry(db, id)
    await writeAuditLog(db, {
      action: 'native_content.delete',
      entityType: 'native_content',
      entityId: id,
      actor: inferActorFromRequest(context.request),
      detail: result,
    })

    return json({
      ok: true,
      mode: 'd1',
      ...result,
    })
  } catch (error) {
    return json({
      ok: false,
      error: String(error?.message || error),
    }, 500)
  }
}

async function handleWrite(context) {
  try {
    const permission = await resolvePublicSitePermission(context)

    if (!permission.canEdit) {
      return json({
        ok: false,
        error: permission.reason,
        canEdit: false,
      }, 403)
    }

    const body = await context.request.json()
    const item = { ...(body?.item || body || {}) }
    const revisionNote = String(body?.revisionNote || item?.revisionNote || 'save')
    const db = getBoundDb(context)

    if (!db) return databaseUnavailable('native content writes')

    await ensureNativePublicContentTable(db)
    await ensureNativeRevisionTable(db)

    const existing = item?.id ? await getExistingNativeEntry(db, item.id) : null
    if (existing && !String(item.slug || '').trim()) {
      item.slug = existing.slug
    }
    if (existing) {
      await saveRevisionSnapshot(db, existing, `before:${revisionNote}`)
    }

    const saved = await upsertNativeEntry(db, item)
    await saveRevisionSnapshot(db, saved, revisionNote)
    await writeAuditLog(db, {
      action: 'native_content.upsert',
      entityType: 'native_content',
      entityId: saved.id,
      actor: inferActorFromRequest(context.request),
      detail: {
        revisionNote,
        status: saved.status,
        workflowState: saved.workflowState,
        target: saved.target,
        slug: saved.slug,
      },
    })

    return json({
      ok: true,
      mode: 'd1',
      item: saved,
    })
  } catch (error) {
    return json({
      ok: false,
      error: String(error?.message || error),
    }, 400)
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
