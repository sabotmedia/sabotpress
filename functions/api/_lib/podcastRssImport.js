import { fetchBoundedText, validatePublicRemoteUrl } from './safeRemoteFeed.js'

const MAX_FEED_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 5
const MAX_EPISODES = 1000

export async function fetchPodcastFeed(sourceUrl, fetcher = fetch) {
  const source = validatePodcastFeedUrl(sourceUrl)
  const { text: xml, resolvedUrl } = await fetchBoundedText(source, {
    fetcher, allowHttp: true, maxBytes: MAX_FEED_BYTES, maxRedirects: MAX_REDIRECTS,
    accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
    userAgent: 'SabotPress Podcast RSS Importer/1.0',
  })
  return { sourceUrl: source, resolvedUrl, xml, parsed: parsePodcastRss(xml, resolvedUrl) }
}

export function validatePodcastFeedUrl(value) {
  try { return validatePublicRemoteUrl(value, { allowHttp: true }).toString() }
  catch (error) {
    const message = String(error?.message || error).replace(/^feed URL/, 'RSS feed URL')
    throw new Error(message === 'enter a valid feed URL' ? 'enter a valid http or https RSS feed URL' : message)
  }
}

export function parsePodcastRss(xmlText, resolvedUrl = '') {
  const xml = String(xmlText || '').trim()
  if (!xml) throw new Error('feed response was empty')
  if (!/<(?:rss|feed|channel)\b/i.test(xml)) throw new Error('response does not look like an RSS or podcast feed')

  const channel = firstBlock(xml, 'channel') || xml
  const itemBlocks = allBlocks(channel, 'item').slice(0, MAX_EPISODES)
  const channelOnly = channel.replace(/<item\b[\s\S]*?<\/item\s*>/gi, '')
  const ownerBlock = firstBlock(channelOnly, 'itunes:owner') || ''
  const channelImage = firstAttribute(channelOnly, 'itunes:image', 'href') || textFromNested(channelOnly, 'image', 'url')
  const channelCategories = unique([
    ...allAttributeValues(channelOnly, 'itunes:category', 'text'),
    ...allTagValues(channelOnly, 'category'),
  ])

  const podcast = {
    title: firstTagValue(channelOnly, ['title']),
    description: firstTagValue(channelOnly, ['description', 'itunes:summary', 'subtitle']),
    author: firstTagValue(channelOnly, ['itunes:author', 'author', 'managingEditor']),
    websiteUrl: firstTagValue(channelOnly, ['link']),
    language: firstTagValue(channelOnly, ['language']) || 'en-us',
    category: channelCategories[0] || 'News',
    categories: channelCategories,
    explicit: parseExplicit(firstTagValue(channelOnly, ['itunes:explicit'])),
    ownerName: firstTagValue(ownerBlock, ['itunes:name', 'name']),
    ownerEmail: firstTagValue(ownerBlock, ['itunes:email', 'email']),
    imageUrl: channelImage,
    sourceFeedUrl: resolvedUrl,
  }

  const episodes = itemBlocks.map((item, index) => parseEpisode(item, podcast, index))
  return { podcast, episodes, episodeCount: episodes.length }
}

function parseEpisode(item, podcast, index) {
  const enclosure = firstTagAttributes(item, 'enclosure')
  const title = firstTagValue(item, ['title']) || `Episode ${index + 1}`
  const link = firstTagValue(item, ['link'])
  const guid = firstTagValue(item, ['guid']) || enclosure.url || link || `${title}-${index + 1}`
  const publishedAt = normalizeDate(firstTagValue(item, ['pubDate', 'published', 'updated']))
  const descriptionHtml = firstTagValue(item, ['content:encoded', 'description', 'itunes:summary'])
  const imageUrl = firstAttribute(item, 'itunes:image', 'href') || podcast.imageUrl || ''
  const categories = unique([
    ...allAttributeValues(item, 'itunes:category', 'text'),
    ...allTagValues(item, 'category'),
  ])

  return {
    key: guid,
    guid,
    title,
    link,
    publishedAt,
    descriptionHtml,
    excerpt: stripHtml(descriptionHtml).slice(0, 600),
    author: firstTagValue(item, ['itunes:author', 'author']) || podcast.author,
    enclosureUrl: cleanPublicUrl(enclosure.url),
    enclosureType: String(enclosure.type || '').trim(),
    enclosureLength: normalizeInteger(enclosure.length),
    duration: firstTagValue(item, ['itunes:duration']),
    episodeNumber: firstTagValue(item, ['itunes:episode']),
    season: firstTagValue(item, ['itunes:season']),
    episodeType: firstTagValue(item, ['itunes:episodeType']) || 'full',
    explicit: parseExplicit(firstTagValue(item, ['itunes:explicit'])),
    imageUrl,
    categories,
  }
}

function firstBlock(xml, tag) {
  const name = escapeRegExp(tag)
  const match = String(xml || '').match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`, 'i'))
  return match?.[1] || ''
}

function allBlocks(xml, tag) {
  const name = escapeRegExp(tag)
  return [...String(xml || '').matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`, 'gi'))].map((match) => match[1] || '')
}

function firstTagValue(xml, tags = []) {
  for (const tag of tags) {
    const value = firstRawTagValue(xml, tag)
    if (value) return decodeXml(value)
  }
  return ''
}

function firstRawTagValue(xml, tag) {
  const name = escapeRegExp(tag)
  const match = String(xml || '').match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`, 'i'))
  return stripCdata(match?.[1] || '').trim()
}

function allTagValues(xml, tag) {
  const name = escapeRegExp(tag)
  return [...String(xml || '').matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`, 'gi'))]
    .map((match) => decodeXml(stripCdata(match?.[1] || '').trim()))
    .filter(Boolean)
}

function firstTagAttributes(xml, tag) {
  const name = escapeRegExp(tag)
  const match = String(xml || '').match(new RegExp(`<${name}\\b([^>]*)\\/?\\s*>`, 'i'))
  return parseAttributes(match?.[1] || '')
}

function firstAttribute(xml, tag, attribute) {
  return String(firstTagAttributes(xml, tag)?.[attribute] || '').trim()
}

function allAttributeValues(xml, tag, attribute) {
  const name = escapeRegExp(tag)
  return [...String(xml || '').matchAll(new RegExp(`<${name}\\b([^>]*)\\/?\\s*>`, 'gi'))]
    .map((match) => parseAttributes(match?.[1] || '')?.[attribute] || '')
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

function textFromNested(xml, outerTag, innerTag) {
  const block = firstBlock(xml, outerTag)
  return block ? firstTagValue(block, [innerTag]) : ''
}

function parseAttributes(input) {
  const attrs = {}
  const source = String(input || '')
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  for (const match of source.matchAll(pattern)) {
    attrs[match[1]] = decodeXml(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attrs
}

function stripCdata(value) {
  return String(value || '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, '$1')
}

function decodeXml(value) {
  return stripCdata(String(value || ''))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .trim()
}

function stripHtml(value) {
  return decodeXml(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
}

function parseExplicit(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return ['yes', 'true', 'explicit', '1'].includes(normalized)
}

function normalizeDate(value) {
  const milliseconds = new Date(String(value || '').trim()).getTime()
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : ''
}

function normalizeInteger(value) {
  const parsed = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function cleanPublicUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
