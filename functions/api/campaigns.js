import { resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import { writeAuditLog, inferActorFromRequest } from './_lib/auditLog.js'
import { databaseUnavailable, getBoundDb } from './_lib/database.js'
import { decorateAiCampaignForPublic, extractAiLetterSignatories, hasAiLetterSignatureSection } from './_lib/aiCampaignPublic.js'
import { decorateCampaignAutomation } from './_lib/campaignAutomation.js'
import { getNativeEntry, listNativeEntries } from './_lib/nativePublicContent.js'
import { getAiCoverageArchiveSummary, listAiCoverageArchive, refreshGdeltCoverageIfStale, upsertAiCoverageItems } from './_lib/aiCampaignCoverageArchive.js'
import {
  AI_CAMPAIGN_SLUG,
  AI_CAMPAIGN_ID,
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
  return json({
    ok: true,
    canEdit: permission.canEdit,
    authMode: permission.mode,
    mode: getBoundDb(context) ? 'd1' : 'unavailable',
  })
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
      // Public reads get live social + the bundled campaign art pack. Admin reads
      // stay persistence-only so transient network content can never be saved back
      // into D1 by accident.
      let signatories
      let posts = []
      if (!includeDrafts) {
        try {
          if (item.slug === AI_CAMPAIGN_SLUG) {
            const [letter, publishedPosts] = await Promise.all([
              getNativeEntry(db, 'open-letter-ai'),
              listNativeEntries(db, { status: 'published' }),
            ])
            const letterBody = letter?.bodyHtml || letter?.body || ''
            if (hasAiLetterSignatureSection(letterBody)) {
              const extracted = extractAiLetterSignatories(letterBody)
              if (extracted.length) signatories = extracted
            }
            posts = publishedPosts
          } else {
            posts = await listNativeEntries(db, { status: 'published' })
          }
        } catch { /* the bundled public snapshot remains available */ }
      }
      const output = includeDrafts
        ? item
        : item.slug === AI_CAMPAIGN_SLUG
          ? await decorateAiCampaignForPublic(item, context.request.url, { signatories, posts })
          : await decorateCampaignAutomation(item, context.request.url, { posts })
      if (!includeDrafts) {
        await upsertAiCoverageItems(db, output.coverage || [], { campaignSlug: item.slug })
        const archive = await getAiCoverageArchiveSummary(db, item.slug)
        const visibleCoverage = await listAiCoverageArchive(db, { campaignSlug: item.slug, limit: 500 })
        output.coverage = visibleCoverage.items
        output.coverageArchiveCount = archive.total
        if (item.slug === AI_CAMPAIGN_SLUG) {
          const refreshPromise = refreshGdeltCoverageIfStale(db)
          if (typeof context.waitUntil === 'function') context.waitUntil(refreshPromise.catch(() => {}))
          else refreshPromise.catch(() => {})
        }
      }
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
    const protectedAiCampaign = existing?.id === AI_CAMPAIGN_ID || existing?.slug === AI_CAMPAIGN_SLUG || item.id === AI_CAMPAIGN_ID
    if (protectedAiCampaign && item.slug !== AI_CAMPAIGN_SLUG) {
      return json({ ok: false, error: 'the seeded A/I campaign URL slug cannot be changed' }, 400)
    }
    if (!protectedAiCampaign && item.slug === AI_CAMPAIGN_SLUG) {
      return json({ ok: false, error: 'the A/I campaign URL slug is reserved' }, 400)
    }
    if (existing) await saveCampaignRevision(db, existing, 'before:save')
    const saved = await upsertCampaign(db, item)
    await saveCampaignRevision(db, saved, String(body?.revisionNote || 'save'))
    await writeAuditLog(db, {
      action: 'campaigns.upsert',
      entityType: 'campaign',
      entityId: saved.id,
      actor: inferActorFromRequest(context.request),
      detail: {
        slug: saved.slug,
        status: saved.status,
        campaignStatus: saved.campaignStatus,
        updates: saved.updates.length,
        resources: saved.resources.length,
        social: saved.social.length,
        graphics: saved.graphics.length,
      },
    })

    return json({ ok: true, mode: 'd1', item: saved })
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
