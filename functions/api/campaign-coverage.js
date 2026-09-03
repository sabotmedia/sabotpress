import { databaseUnavailable, getBoundDb } from './_lib/database.js'
import { inferActorFromRequest, writeAuditLog } from './_lib/auditLog.js'
import { decorateAiCampaignForPublic } from './_lib/aiCampaignPublic.js'
import { ensureAiCampaign, getCampaign } from './_lib/campaigns.js'
import { resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import {
  AI_COVERAGE_CAMPAIGN,
  COVERAGE_EDITORIAL_STATUSES,
  ensureAiCoverageArchiveTables,
  getAiCoverageArchiveSummary,
  listAiCoverageArchive,
  refreshGdeltCoverageIfStale,
  updateCoverageEditorialState,
  upsertAiCoverageItems,
} from './_lib/aiCampaignCoverageArchive.js'

export async function onRequestOptions() {
  return json({ ok: true, mode: 'd1', methods: ['GET', 'PATCH'] })
}

export async function onRequestGet(context) {
  try {
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('campaign coverage archive reads')
    const url = new URL(context.request.url)
    const campaignSlug = String(url.searchParams.get('campaign') || AI_COVERAGE_CAMPAIGN)
    const campaign = campaignSlug === AI_COVERAGE_CAMPAIGN ? await ensureAiCampaign(db) : await getCampaign(db, campaignSlug)
    if (!campaign) return json({ ok: false, error: 'campaign not found' }, 404)
    const adminView = url.searchParams.get('admin') === '1'
    let permission = null
    if (adminView) {
      permission = await resolvePublicSitePermission(context)
      if (!permission.canEdit) return json({ ok: false, error: permission.reason || 'authentication required', canEdit: false }, 403, true)
    }

    await ensureAiCoverageArchiveTables(db)
    let summary = await getAiCoverageArchiveSummary(db, campaignSlug, { includeHidden: adminView })
    if (campaignSlug === AI_COVERAGE_CAMPAIGN && (summary.total === 0 || url.searchParams.get('refresh') === '1')) {
      const seededCampaign = await ensureAiCampaign(db)
      const publicCampaign = await decorateAiCampaignForPublic(seededCampaign, context.request.url, { includeSocial: false })
      await upsertAiCoverageItems(db, publicCampaign.coverage || [])
      summary = await getAiCoverageArchiveSummary(db, campaignSlug, { includeHidden: adminView })
    } else if (summary.total === 0 && Array.isArray(campaign.coverage) && campaign.coverage.length) {
      await upsertAiCoverageItems(db, campaign.coverage, { campaignSlug })
      summary = await getAiCoverageArchiveSummary(db, campaignSlug, { includeHidden: adminView })
    }

    const refreshPromise = campaignSlug === AI_COVERAGE_CAMPAIGN ? refreshGdeltCoverageIfStale(db) : Promise.resolve({ refreshed: false, reason: 'not-configured' })
    if (url.searchParams.get('refresh') === '1' && campaignSlug === AI_COVERAGE_CAMPAIGN) {
      await refreshPromise
      summary = await getAiCoverageArchiveSummary(db, campaignSlug, { includeHidden: adminView })
    } else if (typeof context.waitUntil === 'function') {
      context.waitUntil(refreshPromise.catch(() => {}))
    } else {
      refreshPromise.catch(() => {})
    }

    const archive = await listAiCoverageArchive(db, {
      campaignSlug,
      q: url.searchParams.get('q'),
      language: url.searchParams.get('language'),
      outlet: url.searchParams.get('outlet'),
      page: url.searchParams.get('page'),
      limit: url.searchParams.get('limit'),
      includeHidden: adminView,
      editorialStatus: adminView ? url.searchParams.get('editorialStatus') : '',
    })
    return json({ ok: true, mode: 'd1', ...archive, facets: { languages: summary.languages, outlets: summary.outlets }, lastUpdatedAt: summary.lastUpdatedAt }, 200, adminView)
  } catch (error) {
    const message = String(error?.message || error)
    return json({ ok: false, error: message }, /invalid editorial status/i.test(message) ? 400 : 500, true)
  }
}

export async function onRequestPatch(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permission.canEdit) return json({ ok: false, error: permission.reason || 'authentication required', canEdit: false }, 403, true)
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('campaign coverage editorial writes')
    const body = await context.request.json().catch(() => ({}))
    const id = String(body?.id || '').trim()
    const campaignSlug = String(body?.campaign || body?.campaignSlug || '').trim()
    const editorialStatus = String(body?.editorialStatus || '').trim().toLowerCase()
    if (!id || !campaignSlug) return json({ ok: false, error: 'coverage id and campaign are required' }, 400, true)
    if (!COVERAGE_EDITORIAL_STATUSES.includes(editorialStatus)) return json({ ok: false, error: 'editorialStatus must be automatic, featured, or hidden' }, 400, true)
    const campaign = await getCampaign(db, campaignSlug)
    if (!campaign) return json({ ok: false, error: 'campaign not found' }, 404, true)
    const actor = permission.actor || inferActorFromRequest(context.request)
    const item = await updateCoverageEditorialState(db, { id, campaignSlug, editorialStatus, editorialNote: body?.editorialNote, actor })
    if (!item) return json({ ok: false, error: 'coverage item not found' }, 404, true)
    await writeAuditLog(db, {
      action: 'campaign-coverage.editorial-update', entityType: 'campaign-coverage', entityId: item.id,
      actor, detail: { campaignSlug, editorialStatus, hasEditorialNote: Boolean(item.editorialNote) },
    })
    return json({ ok: true, mode: 'd1', item }, 200, true)
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 400, true)
  }
}

function json(data, status = 200, privateResponse = false) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': privateResponse ? 'no-store' : 'public, max-age=60, s-maxage=120' },
  })
}
