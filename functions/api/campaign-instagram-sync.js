import { resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import { getBoundDb, databaseUnavailable } from './_lib/database.js'
import { getCampaign } from './_lib/campaigns.js'
import { createMessage, ensureCampaignCorrespondenceTables } from './_lib/campaignCorrespondence.js'
import { getInstagramConnection } from './_lib/campaignInstagram.js'

const MAX_MEDIA_BYTES = 100 * 1024 * 1024

export async function onRequestPost(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permission.canEdit) return json({ ok: false, error: 'editor access required' }, 403)
    const db = getBoundDb(context); if (!db) return databaseUnavailable('Instagram campaign sync')
    const input = await context.request.json(); const campaign = await getCampaign(db, input.campaign || '')
    if (!campaign) return json({ ok: false, error: 'campaign not found' }, 404)
    const connection = await getInstagramConnection(db, campaign.id, context.env?.INSTAGRAM_TOKEN_ENCRYPTION_KEY)
    const token = connection?.token || String(context.env?.INSTAGRAM_ACCESS_TOKEN || '')
    if (!token) return json({ ok: false, error: 'Instagram is not authorized yet. Create and send an authorization link first.' }, 409)
    const bucket = context.env?.SABOT_MEDIA_BUCKET || context.env?.MEDIA_BUCKET
    if (!bucket) return json({ ok: false, error: 'SABOT_MEDIA_BUCKET is required to preserve Instagram media.' }, 503)
    await ensureCampaignCorrespondenceTables(db)
    const endpoint = new URL('https://graph.instagram.com/me/media')
    endpoint.searchParams.set('fields', 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp')
    endpoint.searchParams.set('limit', '50'); endpoint.searchParams.set('access_token', token)
    const response = await fetch(endpoint, { headers: { accept: 'application/json' } }); const payload = await response.json()
    if (!response.ok) return json({ ok: false, error: payload?.error?.message || `Instagram returned ${response.status}` }, 502)
    let imported = 0; let skipped = 0; let filtered = 0; const errors = []
    for (const post of payload.data || []) {
      if (!matchesCampaignPost(campaign, post)) { filtered += 1; continue }
      const exists = await db.prepare(`SELECT id FROM campaign_messages WHERE campaign_id = ? AND origin_source = 'instagram' AND origin_id = ? LIMIT 1`).bind(campaign.id, String(post.id)).first()
      if (exists) { skipped += 1; continue }
      try {
        const sourceUrl = post.media_type === 'VIDEO' ? (post.media_url || post.thumbnail_url) : post.media_url
        const archived = sourceUrl ? await archiveMedia(bucket, sourceUrl, campaign.id, post) : null
        await createMessage(db, campaign.id, { body: post.caption || '', mediaUrl: archived?.url || '', mediaType: archived?.type || '', visibility: 'public', originSource: 'instagram', originId: String(post.id), originUrl: post.permalink || '', originalPublishedAt: post.timestamp }, { isEditor: true })
        imported += 1
      } catch (error) { errors.push({ id: String(post.id || ''), error: String(error?.message || error) }) }
    }
    return json({ ok: true, imported, skipped, filtered, examined: (payload.data || []).length, errors, note: 'Instagram native reposts are not included in the connected account media feed.' })
  } catch (error) { return json({ ok: false, error: String(error?.message || error) }, 500) }
}

async function archiveMedia(bucket, source, campaignId, post) {
  const url = new URL(source); const host = url.hostname.toLowerCase()
  if (!(host.endsWith('.cdninstagram.com') || host.endsWith('.fbcdn.net'))) throw new Error('Instagram returned an unexpected media host')
  const response = await fetch(url, { redirect: 'error' }); if (!response.ok) throw new Error(`media download failed: ${response.status}`)
  const length = Number(response.headers.get('content-length') || 0); if (length > MAX_MEDIA_BYTES) throw new Error('media exceeds 100 MB archive limit')
  const bytes = await response.arrayBuffer(); if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error('media exceeds 100 MB archive limit')
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase()
  if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) throw new Error('unsupported Instagram media type')
  const extension = contentType.includes('video') ? 'mp4' : contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const key = `media/campaign-instagram/${campaignId}/${String(post.id).replace(/[^a-zA-Z0-9_-]/g, '')}.${extension}`
  await bucket.put(key, bytes, { httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' }, customMetadata: { campaignId, instagramId: String(post.id), sourceUrl: String(post.permalink || '') } })
  const publicUrl = new URL('https://example.invalid/api/media/files'); publicUrl.searchParams.set('key', key)
  return { url: publicUrl.toString(), type: contentType.startsWith('video/') ? 'video' : 'image' }
}

export function matchesCampaignPost(campaign, post) {
  const caption = String(post?.caption || '').toLocaleLowerCase('en-US')
  if (campaign?.slug === 'example-campaign') {
    return caption.includes('#foodnotbombsgaza') || caption.includes('@example_campaign')
  }
  return false
}
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }) }
