import { resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import { writeAuditLog, inferActorFromRequest } from './_lib/auditLog.js'
import { databaseUnavailable, getBoundDb } from './_lib/database.js'
import { listAllCampaignRevisions, listCampaignRevisions, restoreCampaignRevision } from './_lib/campaigns.js'

export async function onRequestGet(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permission.canEdit) return json({ ok: false, error: permission.reason || 'authentication required' }, 403)
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('campaign revision reads')
    const url = new URL(context.request.url)
    const campaignId = String(url.searchParams.get('campaignId') || '')
    if (url.searchParams.get('all') === '1') {
      const result = await listAllCampaignRevisions(db, { limit: url.searchParams.get('limit'), page: url.searchParams.get('page') })
      return json({ ok: true, mode: 'd1', ...result })
    }
    if (!campaignId) return json({ ok: false, error: 'missing campaignId' }, 400)
    const items = await listCampaignRevisions(db, campaignId, url.searchParams.get('limit'))
    return json({ ok: true, mode: 'd1', items })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

export async function onRequestPost(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permission.canEdit) return json({ ok: false, error: permission.reason || 'authentication required' }, 403)
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('campaign revision restore')
    const body = await context.request.json()
    const revisionId = String(body?.revisionId || '')
    if (!revisionId) return json({ ok: false, error: 'missing revisionId' }, 400)
    const item = await restoreCampaignRevision(db, revisionId)
    await writeAuditLog(db, {
      action: 'campaigns.revision.restore',
      entityType: 'campaign',
      entityId: item.id,
      actor: inferActorFromRequest(context.request),
      detail: { revisionId, slug: item.slug },
    })
    return json({ ok: true, mode: 'd1', item })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 400)
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
