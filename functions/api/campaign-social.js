import { loadLiveAiSocial } from './_lib/aiCampaignPublic.js'
import { loadCampaignAutomation } from './_lib/campaignAutomation.js'
import { getBoundDb } from './_lib/database.js'
import { getCampaign } from './_lib/campaigns.js'

export async function onRequestGet(context) {
  const slug = new URL(context.request.url).searchParams.get('slug') || 'example-campaign'
  try {
    if (slug === 'example-campaign') return json(await loadLiveAiSocial(context.request.url), 200, 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')
    const db = getBoundDb(context)
    if (!db) return json({ ok: false, error: 'Campaign data unavailable' }, 503)
    const campaign = await getCampaign(db, slug)
    if (!campaign || campaign.status !== 'published') return json({ ok: false, error: 'Unknown campaign' }, 404)
    const result = await loadCampaignAutomation(campaign, context.request.url)
    return json({ ok: result.ok, items: result.social, sources: result.socialSources, errors: result.errors.filter((item) => item.kind === 'social'), checkedAt: result.checkedAt }, 200, 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')
  }
  catch (error) { return json({ ok: false, items: [], sources: [], errors: [{ platform: 'social', message: String(error?.message || error) }] }, 502, 'public, max-age=30') }
}
function json(data, status, cacheControl = 'no-store') { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cacheControl, 'access-control-allow-origin': '*' } }) }
