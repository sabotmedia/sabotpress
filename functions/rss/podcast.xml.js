import { ensureNativePublicContentTable, listNativeEntries } from '../api/_lib/nativePublicContent.js'
import { databaseUnavailable, getBoundDb } from '../api/_lib/database.js'
import { podcastShowOwnsEntry, readPodcastShows } from '../api/_lib/podcastSettings.js'

export async function onRequestGet(context) {
  try {
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('podcast RSS')
    const registry = await readPodcastShows(db)
    const show = registry.shows.find((candidate) => candidate.id === registry.defaultShowId) || registry.shows[0] || null
    if (!show) return new Response('Podcast feed not configured.', { status: 404 })
    const items = await getPodcastFeedItems(db, show)
    return podcastXmlResponse(buildPodcastFeedXml({
      requestUrl: context.request.url,
      items,
      settings: show,
    }))
  } catch (error) {
    return new Response(`RSS feed error: ${String(error?.message || error)}`, {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
}

export async function getPodcastFeedItems(db, show = null) {
  if (!db) throw new Error('BF_DB binding is required for podcast RSS')
  await ensureNativePublicContentTable(db)
  const entries = await listNativeEntries(db, {})
  return entries
    .filter((entry) => entry?.contentType === 'podcast')
    .filter((entry) => !show || podcastShowOwnsEntry(show, entry))
    .filter((entry) => isPublicAudioUrl(getAudioUrl(entry)))
    .sort((a, b) => new Date(b.publishedAt || b.updatedAt || 0).getTime() - new Date(a.publishedAt || a.updatedAt || 0).getTime())
}

export function buildPodcastFeedXml({ requestUrl, items = [], settings = {}, selfPath = '/rss/podcast.xml' }) {
  const url = new URL(requestUrl)
  const origin = url.origin
  const selfUrl = `${origin}${selfPath}`
  const title = String(settings.podcastTitle || 'Podcast').trim() || 'Podcast'
  const author = String(settings.author || 'SabotPress').trim() || 'SabotPress'
  const description = String(settings.description || `${title} podcast feed.`).trim()
  const websiteUrl = safeAbsoluteUrl(settings.websiteUrl, origin) || origin
  const coverArt = safeAbsoluteUrl(settings.defaultCoverArt, origin)
  const language = String(settings.language || 'en-us').trim().toLowerCase() || 'en-us'
  const category = String(settings.category || 'News').trim() || 'News'
  const ownerName = String(settings.ownerName || '').trim()
  const ownerEmail = String(settings.ownerEmail || '').trim()
  const explicit = settings.explicit ? 'yes' : 'no'
  const body = items.map((item) => itemXml(item, origin, { author, coverArt, explicit })).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>${escapeXml(title)}</title>
    <description>${escapeXml(description)}</description>
    <link>${escapeXml(websiteUrl)}</link>
    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml" />
    <language>${escapeXml(language)}</language>
    <lastBuildDate>${escapeXml(new Date().toUTCString())}</lastBuildDate>
    <generator>SabotPress AudioLab</generator>
    <itunes:author>${escapeXml(author)}</itunes:author>
    <itunes:summary>${escapeXml(description)}</itunes:summary>
    <itunes:explicit>${escapeXml(explicit)}</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <itunes:category text="${escapeXml(category)}" />
${coverArt ? `    <itunes:image href="${escapeXml(coverArt)}" />\n` : ''}${ownerEmail ? `    <itunes:owner>\n      <itunes:name>${escapeXml(ownerName || author)}</itunes:name>\n      <itunes:email>${escapeXml(ownerEmail)}</itunes:email>\n    </itunes:owner>\n` : ''}${body}
  </channel>
</rss>`
}

export function podcastXmlResponse(body) {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-sabot-feed-source': 'native-d1',
    },
  })
}

function itemXml(item, origin, channel = {}) {
  const delivery = getDeliveryAsset(item)
  const audioUrl = absolutize(getAudioUrl(item), origin)
  const slug = String(item.slug || item.id || '').trim()
  const link = `${origin}/post/${encodeURIComponent(slug)}`
  const mimeType = getMimeType(item)
  const size = getFileSize(item)
  const pubDate = safeDate(item.publishedAt || item.scheduledFor || item.updatedAt || item.createdAt)
  const description = item.podcastSummary || item.excerpt || stripHtml(item.bodyHtml || item.body || '')
  const duration = String(item.podcastDuration || '').trim()
  const storedExplicit = item.podcastExplicit == null ? delivery?.podcastExplicit : item.podcastExplicit
  const explicit = storedExplicit == null ? channel.explicit : storedExplicit ? 'yes' : 'no'
  const author = String(item.author || item.byline || channel.author || 'SabotPress').trim()
  const episode = String(item.podcastEpisodeNumber || '').trim()
  const season = String(item.podcastSeason || '').trim()
  const episodeType = String(item.podcastEpisodeType || delivery?.podcastEpisodeType || '').trim()
  const coverArt = safeAbsoluteUrl(item.podcastCoverImage || item.featuredImage || item.heroImage || channel.coverArt, origin)
  const guid = String(item.sourceExternalId || delivery?.podcastGuid || item.id || link).trim()

  return `    <item>
      <title>${escapeXml(item.title || 'Untitled episode')}</title>
      <description>${escapeXml(description)}</description>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <enclosure url="${escapeXml(audioUrl)}" type="${escapeXml(mimeType)}" length="${escapeXml(String(size || 0))}" />
      <itunes:author>${escapeXml(author)}</itunes:author>
${duration ? `      <itunes:duration>${escapeXml(duration)}</itunes:duration>\n` : ''}${episode ? `      <itunes:episode>${escapeXml(episode)}</itunes:episode>\n` : ''}${season ? `      <itunes:season>${escapeXml(season)}</itunes:season>\n` : ''}${episodeType ? `      <itunes:episodeType>${escapeXml(episodeType)}</itunes:episodeType>\n` : ''}${coverArt ? `      <itunes:image href="${escapeXml(coverArt)}" />\n` : ''}      <itunes:explicit>${escapeXml(explicit || 'no')}</itunes:explicit>
    </item>`
}

function getAudioUrl(item = {}) {
  const delivery = getDeliveryAsset(item)
  const deliveryUrl = delivery?.url || delivery?.publicUrl || delivery?.rssEnclosure?.url || item.podcastDeliveryAudioUrl || ''
  if (isPublicAudioUrl(deliveryUrl)) return String(deliveryUrl).trim()
  const direct = String(item.podcastRssEnclosureUrl || item.podcastAudioUrl || item.audioSourceUrl || '').trim()
  if (isPublicAudioUrl(direct)) return direct
  const asset = getAudioAsset(item)
  const assetUrl = asset?.url || asset?.publicUrl || asset?.rssEnclosure?.url || ''
  return isPublicAudioUrl(assetUrl) ? String(assetUrl).trim() : ''
}

function getMimeType(item = {}) {
  const delivery = getDeliveryAsset(item)
  if (delivery?.mimeType || delivery?.rssEnclosure?.type) return String(delivery.mimeType || delivery.rssEnclosure.type)
  if (item.podcastMimeType) return String(item.podcastMimeType)
  const asset = getAudioAsset(item)
  return String(asset?.mimeType || asset?.type || 'audio/mpeg')
}

function getFileSize(item = {}) {
  const delivery = getDeliveryAsset(item)
  if (delivery?.size || delivery?.length || delivery?.rssEnclosure?.length) return Number(delivery.size || delivery.length || delivery.rssEnclosure.length || 0)
  if (item.podcastFileSize) return Number(item.podcastFileSize || 0)
  const asset = getAudioAsset(item)
  return Number(asset?.size || asset?.length || 0)
}

function getDeliveryAsset(item = {}) {
  return (Array.isArray(item.relatedAssets) ? item.relatedAssets : []).find((asset) => {
    const haystack = `${asset?.type || ''} ${asset?.role || ''} ${asset?.source || ''} ${asset?.mimeType || ''}`
    const url = asset?.url || asset?.publicUrl || asset?.rssEnclosure?.url || ''
    return /delivery|compressed|opus|mp3|m4a|webm/i.test(haystack) && isPublicAudioUrl(url)
  }) || null
}

function getAudioAsset(item = {}) {
  return (Array.isArray(item.relatedAssets) ? item.relatedAssets : []).find((asset) => {
    const haystack = `${asset?.type || ''} ${asset?.source || ''} ${asset?.mimeType || ''}`
    const url = asset?.url || asset?.publicUrl || asset?.rssEnclosure?.url || ''
    return /audiolab|audio/i.test(haystack) && isPublicAudioUrl(url)
  }) || null
}

function isPublicAudioUrl(value = '') {
  const raw = String(value || '').trim()
  if (!raw || raw.startsWith('audiolab-local://')) return false
  return /^https?:\/\//i.test(raw) || raw.startsWith('/api/audiolab/media')
}

function absolutize(value = '', origin = '') {
  const raw = String(value || '')
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('/')) return `${origin}${raw}`
  return raw
}

function safeAbsoluteUrl(value, origin) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw, origin).toString()
  } catch {
    return ''
  }
}

function safeDate(value) {
  const date = new Date(String(value || ''))
  return Number.isFinite(date.getTime()) ? date.toUTCString() : new Date().toUTCString()
}

function stripHtml(value = '') {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeXml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
