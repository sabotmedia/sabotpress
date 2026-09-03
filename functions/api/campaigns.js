import { resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import { writeAuditLog, inferActorFromRequest } from './_lib/auditLog.js'
import { databaseUnavailable, getBoundDb } from './_lib/database.js'
import { decorateCampaignAutomation } from './_lib/campaignAutomation.js'
import { listNativeEntries } from './_lib/nativePublicContent.js'
import {
  deleteCampaign,
  ensureDefaultCampaigns,
  getCampaign,
  listCampaigns,
  normalizeCampaign,
  saveCampaignRevision,
  upsertCampaign,
} from './_lib/campaigns.js'

export async function onRequestOptions(context) {
  const permission = await resolvePublicSitePermission(context)
  return json({ ok: true, canEdit: permission.canEdit, authMode: permission.mode, mode: getBoundDb(context) ? 'd1' : 'unavailable' })
}

export async function onRequestGet(context) {
  try {
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('campaign reads')

    const permission = await resolvePublicSitePermission(context)
    const url = new URL(context.request.url)
    const slug = String(url.searchParams.get('slug') || '')
    const id = String(url.searchParams.get('id') || '')
    const includeDrafts = permission.canEdit && url.searchParams.get('includeDrafts') === '1'

    await ensureDefaultCampaigns(db)

    if (slug || id) {
      const item = await getCampaign(db, slug || id)
      if (!item || (!includeDrafts && item.status !== 'published')) return json({ ok: true, mode: 'd1', item: null })
      if (includeDrafts) return json({ ok: true, mode: 'd1', item })

      let posts = []
      try { posts = await listNativeEntries(db, { status: 'published' }) } catch { /* campaign remains readable without related posts */ }
      const output = await decorateCampaignAutomation(item, context.request.url, { posts })
      return json({ ok: true, mode: 'd1', item: output })
    }

    const items = await listCampaigns(db, { includeDrafts })
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
    if (!permission.canEdit) return json({ ok: false, error: permission.reason || 'authentication required', canEdit: false }, 403)
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('campaign deletes')
    const body = await context.request.json().catch(() => ({}))
    const id = String(body?.id || body?.slug || '')
    if (!id) return json({ ok: false, error: 'missing campaign id' }, 400)
    const removed = await deleteCampaign(db, id)
    if (!removed) return json({ ok: false, error: 'campaign not found' }, 404)
    await writeAuditLog(db, {
      action: 'campaigns.delete', entityType: 'campaign', entityId: removed.id,
      actor: inferActorFromRequest(context.request), detail: { slug: removed.slug, title: removed.title },
    })
    return json({ ok: true, mode: 'd1', removed: { id: removed.id, slug: removed.slug } })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 400)
  }
}

async function handleWrite(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permission.canEdit) return json({ ok: false, error: permission.reason || 'authentication required', canEdit: false }, 403)
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('campaign writes')

    const body = await context.request.json()
    const incoming = body?.item || body || {}
    if (!String(incoming.title || '').trim()) return json({ ok: false, error: 'missing campaign title' }, 400)
    const item = normalizeCampaign(incoming)
    if (!item.title || !item.slug) return json({ ok: false, error: 'missing campaign title or slug' }, 400)
    if (incoming.deadline && !Number.isFinite(new Date(incoming.deadline).getTime())) return json({ ok: false, error: 'invalid campaign deadline' }, 400)

    const existing = await getCampaign(db, item.id)
    if (existing) await saveCampaignRevision(db, existing, 'before:save')
    const saved = await upsertCampaign(db, item)
    await saveCampaignRevision(db, saved, String(body?.revisionNote || 'save'))
    await writeAuditLog(db, {
      action: 'campaigns.upsert', entityType: 'campaign', entityId: saved.id,
      actor: inferActorFromRequest(context.request),
      detail: { slug: saved.slug, status: saved.status, campaignStatus: saved.campaignStatus, updates: saved.updates.length, resources: saved.resources.length },
    })
    return json({ ok: true, mode: 'd1', item: saved })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 400)
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}
