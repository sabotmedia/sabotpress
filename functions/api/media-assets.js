import { resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import {
  ensureMediaAssetsTable,
  listMediaAssets,
  upsertMediaAsset,
  deleteMediaAsset,
} from './_lib/mediaAssets.js'
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
    const mediaType = url.searchParams.get('mediaType') || ''
    const db = getBoundDb(context)

    if (!db) return databaseUnavailable('media asset reads')

    await ensureMediaAssetsTable(db)
    const items = await listMediaAssets(db, { mediaType: mediaType || undefined })

    return json({
      ok: true,
      mode: 'd1',
      items,
    })
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
    const asset = body?.asset || body || {}
    const db = getBoundDb(context)

    if (!db) return databaseUnavailable('media asset writes')

    const saved = await upsertMediaAsset(db, asset)
    await writeAuditLog(db, {
      action: 'media.asset.upsert',
      entityType: 'media_asset',
      entityId: saved.id,
      actor: inferActorFromRequest(context.request),
      detail: {
        title: saved.title,
        url: saved.url,
        mediaType: saved.mediaType,
        filename: saved.filename,
        source: saved.source,
      },
    })

    return json({
      ok: true,
      mode: 'd1',
      asset: saved,
    })
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
    if (!db) return databaseUnavailable('media asset deletion')

    const items = await listMediaAssets(db)
    const existing = items.find((item) => item.id === id) || null
    const result = await deleteMediaAsset(db, id)
    await writeAuditLog(db, {
      action: 'media.asset.delete',
      entityType: 'media_asset',
      entityId: id,
      actor: inferActorFromRequest(context.request),
      detail: existing ? {
        title: existing.title,
        url: existing.url,
        storageKey: existing.storageKey,
      } : { id },
    })

    return json({
      ok: true,
      mode: 'd1',
      ...result,
    })
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
