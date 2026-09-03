import { getBoundDb, databaseUnavailable } from './_lib/database.js'
import { getCampaign } from './_lib/campaigns.js'
import { authenticateContributor, listMessages } from './_lib/campaignCorrespondence.js'

export async function onRequestPost(context) {
  try {
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('campaign contributor access')
    const body = await context.request.json()
    const result = await authenticateContributor(db, { token: body.token, pin: body.pin, ip: context.request.headers.get('cf-connecting-ip') || '' })
    const campaign = await getCampaign(db, result.contributor.campaignId)
    if (!campaign) return json({ ok: false, error: 'campaign not found' }, 404)
    return json({ ok: true, ...result, campaign: publicCampaign(campaign), messages: await listMessages(db, campaign.id) })
  } catch (error) { return json({ ok: false, error: String(error?.message || error) }, Number(error?.status) || 400) }
}
function publicCampaign(campaign) { return { id: campaign.id, slug: campaign.slug, title: campaign.title, shortTitle: campaign.shortTitle, correspondence: campaign.correspondence || {} } }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } }) }
