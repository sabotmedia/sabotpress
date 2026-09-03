import { resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import { getBoundDb, databaseUnavailable } from './_lib/database.js'
import { getCampaign } from './_lib/campaigns.js'
import { contributorFromRequest, createContributor, createMessage, createQuestion, deleteMessage, listContributors, listMessages, listQuestions, patchMessage, patchQuestion, reissueContributorToken, revokeContributor } from './_lib/campaignCorrespondence.js'
import { inferActorFromRequest, writeAuditLog } from './_lib/auditLog.js'

export async function onRequestGet(context) {
  try {
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('campaign correspondence')
    const url = new URL(context.request.url)
    const campaign = await getCampaign(db, url.searchParams.get('campaign') || '')
    if (!campaign) return json({ ok: false, error: 'campaign not found' }, 404)
    const permission = await resolvePublicSitePermission(context)
    const contributor = await contributorFromRequest(db, context.request)
    const contributorSessionSupplied = Boolean(context.request.headers.get('x-sabot-contributor-session') || /^Bearer\s+/i.test(String(context.request.headers.get('authorization') || '')))
    if (contributorSessionSupplied) {
      if (contributor?.campaignId === campaign.id) return json({ ok: true, campaign: publicCampaign(campaign), contributor, messages: await listMessages(db, campaign.id) })
      return json({ ok: false, error: 'Contributor session expired or is invalid. Enter the PIN again.' }, 401)
    }
    if (permission.canEdit && url.searchParams.get('view') === 'admin') return json({ ok: true, campaign: publicCampaign(campaign), contributors: await listContributors(db, campaign.id), messages: await listMessages(db, campaign.id), questions: await listQuestions(db, campaign.id) })
    return json({ ok: true, campaign: publicCampaign(campaign), messages: await listMessages(db, campaign.id, { publicOnly: true }) })
  } catch (error) { return json({ ok: false, error: String(error?.message || error) }, 500) }
}

export async function onRequestPost(context) {
  try {
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('campaign correspondence')
    const body = await context.request.json()
    const campaign = await getCampaign(db, body.campaign || '')
    if (!campaign) return json({ ok: false, error: 'campaign not found' }, 404)
    const permission = await resolvePublicSitePermission(context)
    const contributor = await contributorFromRequest(db, context.request)
    const contributorSessionSupplied = Boolean(context.request.headers.get('x-sabot-contributor-session') || /^Bearer\s+/i.test(String(context.request.headers.get('authorization') || '')))
    if (body.action === 'question') return json({ ok: true, item: await createQuestion(db, campaign.id, body) }, 201)
    if (body.action === 'contributor') {
      if (!permission.canEdit) return json({ ok: false, error: 'editor access required' }, 403)
      return json({ ok: true, ...(await createContributor(db, campaign.id, body)) }, 201)
    }
    if (body.action === 'message' || body.action === 'publish-message') {
      if (contributorSessionSupplied && contributor?.campaignId !== campaign.id) return json({ ok: false, error: 'contributor access required' }, 403)
      if (!contributorSessionSupplied && !permission.canEdit) return json({ ok: false, error: 'contributor access required' }, 403)
      const publishRequested = body.action === 'publish-message'
      if (contributorSessionSupplied && publishRequested && !contributor?.permissions?.directPublish) return json({ ok: false, error: 'direct publishing is not enabled for this contributor' }, 403)
      const actingAsContributor = contributorSessionSupplied && contributor
      const safeBody = actingAsContributor ? { ...body, visibility: publishRequested ? 'public' : 'private' } : body
      const actor = actingAsContributor ? { contributorId: contributor.id, permissions: contributor.permissions, publicationConfirmed: publishRequested } : { isEditor: true }
      const item = await createMessage(db, campaign.id, safeBody, actor)
      return json({ ok: true, item }, 201)
    }
    return json({ ok: false, error: 'unsupported action' }, 400)
  } catch (error) { return json({ ok: false, error: String(error?.message || error) }, Number(error?.status) || 400) }
}

export async function onRequestPatch(context) {
  try {
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('campaign correspondence')
    const body = await context.request.json()
    const permission = await resolvePublicSitePermission(context)
    const contributor = await contributorFromRequest(db, context.request)
    const contributorSessionSupplied = Boolean(context.request.headers.get('x-sabot-contributor-session') || /^Bearer\s+/i.test(String(context.request.headers.get('authorization') || '')))
    if (body.action === 'revoke') {
      if (!permission.canEdit) return json({ ok: false, error: 'editor access required' }, 403)
      return json({ ok: true, item: await revokeContributor(db, body.id, body.revoked !== false) })
    }
    if (body.action === 'reissue') {
      if (!permission.canEdit) return json({ ok: false, error: 'editor access required' }, 403)
      const result = await reissueContributorToken(db, body.id)
      await writeAuditLog(db, { action: 'campaign_correspondence.contributor.reissue', entityType: 'campaign_contributor', entityId: body.id, actor: inferActorFromRequest(context.request), detail: { campaignId: result.contributor.campaignId } })
      return json({ ok: true, ...result })
    }
    if (body.action === 'question') {
      if (!permission.canEdit) return json({ ok: false, error: 'editor access required' }, 403)
      return json({ ok: true, item: await patchQuestion(db, body.id, body) })
    }
    if (body.action === 'message') {
      if (contributorSessionSupplied && !contributor) return json({ ok: false, error: 'contributor access required' }, 403)
      if (!contributorSessionSupplied && !permission.canEdit) return json({ ok: false, error: 'contributor access required' }, 403)
      const actingAsContributor = contributorSessionSupplied && contributor
      const item = await patchMessage(db, body.id, body, actingAsContributor ? { contributorId: contributor.id, permissions: contributor.permissions } : { isEditor: true })
      if (!actingAsContributor && permission.canEdit) await writeAuditLog(db, { action: 'campaign_correspondence.message.update', entityType: 'campaign_message', entityId: item.id, actor: inferActorFromRequest(context.request), detail: { campaignId: item.campaignId, visibility: item.visibility } })
      return json({ ok: true, item })
    }
    return json({ ok: false, error: 'unsupported action' }, 400)
  } catch (error) { return json({ ok: false, error: String(error?.message || error) }, Number(error?.status) || 400) }
}

export async function onRequestDelete(context) {
  try {
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('campaign correspondence')
    const permission = await resolvePublicSitePermission(context)
    const contributor = await contributorFromRequest(db, context.request)
    const contributorSessionSupplied = Boolean(context.request.headers.get('x-sabot-contributor-session') || /^Bearer\s+/i.test(String(context.request.headers.get('authorization') || '')))
    if (contributorSessionSupplied && !contributor) return json({ ok: false, error: 'contributor access required' }, 403)
    if (!contributorSessionSupplied && !permission.canEdit) return json({ ok: false, error: 'editor access required' }, 403)
    const body = await context.request.json()
    if (body.action !== 'message' || !body.id) return json({ ok: false, error: 'unsupported action' }, 400)
    const actingAsContributor = contributorSessionSupplied && contributor
    const item = await deleteMessage(db, body.id, actingAsContributor ? { contributorId: contributor.id } : { isEditor: true })
    await writeAuditLog(db, { action: 'campaign_correspondence.message.delete', entityType: 'campaign_message', entityId: item.id, actor: actingAsContributor ? { type: 'campaign_contributor', id: contributor.id } : inferActorFromRequest(context.request), detail: { campaignId: item.campaignId, senderRole: item.senderRole, visibility: item.visibility, hadMedia: Boolean(item.mediaUrl) } })
    return json({ ok: true, item })
  } catch (error) { return json({ ok: false, error: String(error?.message || error) }, Number(error?.status) || 400) }
}

function publicCampaign(campaign) { return { id: campaign.id, slug: campaign.slug, title: campaign.title, shortTitle: campaign.shortTitle, correspondence: campaign.correspondence || {} } }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } }) }
