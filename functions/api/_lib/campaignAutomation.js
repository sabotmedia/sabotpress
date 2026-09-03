import { XMLParser } from 'fast-xml-parser'
import { fetchBoundedJson, fetchBoundedText, validatePublicRemoteUrl } from './safeRemoteFeed.js'

const CACHE_TTL_SECONDS = 300

export async function decorateCampaignAutomation(campaign, requestUrl, options = {}) {
  if (!campaign) return campaign
  const publicationUpdates = deriveCampaignPublicationUpdates(options.posts || [], campaign, requestUrl)
  if (!campaign.automation?.enabled) return { ...campaign, updates: mergeByUrl(campaign.updates || [], publicationUpdates) }

  const live = await loadCampaignAutomation(campaign, requestUrl, options.fetcher || fetch)
  return {
    ...campaign,
    updates: mergeByUrl(campaign.updates || [], publicationUpdates),
    social: mergeByUrl(live.social, campaign.social || []),
    coverage: mergeByUrl(campaign.coverage || [], live.coverage),
    signatories: mergeSignatories(live.signatories, campaign.signatories || []),
    socialSources: live.socialSources,
    socialErrors: live.errors.filter((item) => item.kind === 'social'),
    automationErrors: live.errors,
    automationCheckedAt: live.checkedAt,
  }
}

export async function loadCampaignAutomation(campaign, requestUrl, fetcher = fetch) {
  const origin = new URL(requestUrl).origin
  const config = campaign.automation || {}
  if (!config.enabled) return disabledAutomationPayload()
  const cacheKey = new Request(`${origin}/__campaign-cache/${encodeURIComponent(campaign.slug)}-automation-v1`)
  const cache = globalThis.caches?.default
  if (cache) {
    const cached = await cache.match(cacheKey)
    if (cached) return cached.json()
  }

  const jobs = [
    ...(config.blueskyActors || []).map((actor) => ({ kind: 'social', platform: 'bluesky', label: `@${actor}`, run: () => fetchBluesky(actor, campaign, requestUrl, fetcher) })),
    ...(config.mastodonAccounts || []).map((account) => ({ kind: 'social', platform: 'mastodon', label: account, run: () => fetchMastodon(account, campaign, requestUrl, fetcher) })),
    ...(config.coverageFeeds || []).map((url) => ({ kind: 'coverage', platform: 'feed', label: url, run: () => fetchCoverageFeed(url, campaign, requestUrl, fetcher) })),
    ...(config.discoverNews ? [{ kind: 'coverage', platform: 'bing-news', label: 'Bing News exact-match discovery', run: () => fetchNewsDiscovery(campaign, requestUrl, fetcher) }] : []),
    ...(config.signatoriesUrl ? [{ kind: 'signatories', platform: 'json', label: config.signatoriesUrl, run: () => fetchSignatories(config.signatoriesUrl, fetcher) }] : []),
  ]
  const results = await Promise.allSettled(jobs.map((job) => job.run()))
  const payload = { ok: true, social: [], coverage: [], signatories: [], socialSources: [], errors: [], checkedAt: new Date().toISOString() }
  results.forEach((result, index) => {
    const job = jobs[index]
    if (result.status === 'fulfilled') {
      payload.social.push(...(result.value.social || []))
      payload.coverage.push(...(result.value.coverage || []))
      payload.signatories.push(...(result.value.signatories || []))
      if (job.kind === 'social') payload.socialSources.push({ platform: job.platform, account: job.label, url: result.value.sourceUrl || '', ok: true, note: 'Configured campaign source' })
    } else {
      payload.errors.push({ kind: job.kind, source: job.label, message: String(result.reason?.message || result.reason) })
      if (job.kind === 'social') payload.socialSources.push({ platform: job.platform, account: job.label, url: '', ok: false, note: 'Temporarily unavailable' })
    }
  })
  payload.ok = payload.errors.length < jobs.length || jobs.length === 0
  payload.social = mergeByUrl(payload.social).sort(newestFirst).slice(0, 40)
  payload.coverage = mergeByUrl(payload.coverage).sort(newestFirst).slice(0, 80)
  payload.signatories = mergeSignatories(payload.signatories).slice(0, 1000)
  if (cache) await cache.put(cacheKey, new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` } })).catch(() => {})
  return payload
}

export function isCampaignRelevant(item, campaign, requestUrl) {
  const date = new Date(item.date || item.publishedAt || 0).getTime()
  const start = new Date(campaign.automation?.startAt || campaign.createdAt || 0).getTime()
  if (Number.isFinite(start) && start > 0 && (!Number.isFinite(date) || date < start)) return false
  const text = cleanText(`${item.title || ''} ${item.text || ''} ${item.description || ''} ${item.summary || ''} ${item.excerpt || ''} ${item.content || ''} ${item.url || ''}`).toLowerCase()
  const canonical = new URL(`/campaigns/${campaign.slug}`, new URL(requestUrl).origin).toString().toLowerCase()
  if (text.includes(canonical) || text.includes(`/campaigns/${campaign.slug}`)) return true
  const signals = [campaign.title, campaign.shortTitle, ...(campaign.campaignKeywords || [])]
    .map((value) => cleanText(value).toLowerCase()).filter((value) => value.length >= 5)
  return signals.some((signal) => text.includes(signal))
}

export function deriveCampaignPublicationUpdates(posts, campaign, requestUrl) {
  const origin = new URL(requestUrl).origin
  return (posts || []).filter((post) => (post.campaigns || []).map(normalizeSlug).includes(campaign.slug)).map((post) => ({
    id: `publication-${normalizeSlug(post.slug || post.id)}`,
    date: String(post.publishedAt || post.updatedAt || ''),
    title: `${cleanText(post.title || 'Campaign reporting')} published`,
    body: summarize(post.excerpt || post.body || post.bodyHtml || 'New reporting connected to this campaign.', 260),
    url: new URL(`/post/${encodeURIComponent(post.slug || post.id)}`, origin).toString(),
    pinned: false,
    automated: true,
    source: 'SabotPress publishing',
  })).filter((item) => item.date && item.url)
}

async function fetchBluesky(actor, campaign, requestUrl, fetcher) {
  const url = new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed')
  url.searchParams.set('actor', actor); url.searchParams.set('limit', '50'); url.searchParams.set('filter', 'posts_no_replies')
  const { data } = await fetchBoundedJson(url, remoteOptions(fetcher, 'application/json'))
  const social = (data.feed || []).map(({ post }) => {
    const record = post?.record || {}
    const handle = String(post?.author?.handle || actor)
    const rkey = String(post?.uri || '').split('/').pop()
    const external = post?.embed?.external || post?.embed?.media?.external
    return {
      id: `bluesky-${post?.cid || rkey}`, platform: 'Bluesky', account: String(post?.author?.displayName || handle), handle: `@${handle}`,
      date: String(record.createdAt || post?.indexedAt || ''), text: String(record.text || ''), url: `https://bsky.app/profile/${handle}/post/${rkey}`,
      images: (post?.embed?.images || post?.embed?.media?.images || []).map((image) => ({ url: image.fullsize || image.thumb, alt: image.alt || '' })).filter((image) => image.url),
      external: external?.uri ? { url: external.uri, title: external.title || '', description: external.description || '' } : null,
    }
  }).filter((item) => isCampaignRelevant(item, campaign, requestUrl))
  return { social, sourceUrl: `https://bsky.app/profile/${actor}` }
}

async function fetchMastodon(account, campaign, requestUrl, fetcher) {
  const parsed = parseMastodonAccount(account)
  const lookup = new URL('/api/v1/accounts/lookup', parsed.origin); lookup.searchParams.set('acct', parsed.acct)
  const { data: profile } = await fetchBoundedJson(lookup, remoteOptions(fetcher, 'application/json'))
  const statusesUrl = new URL(`/api/v1/accounts/${encodeURIComponent(profile.id)}/statuses`, parsed.origin)
  statusesUrl.searchParams.set('limit', '40'); statusesUrl.searchParams.set('exclude_replies', 'true')
  const { data: statuses } = await fetchBoundedJson(statusesUrl, remoteOptions(fetcher, 'application/json'))
  const social = (Array.isArray(statuses) ? statuses : []).map((status) => ({
    id: `mastodon-${status.id}`, platform: 'Mastodon', account: cleanText(status.account?.display_name || status.account?.username || parsed.acct),
    handle: `@${status.account?.acct || `${parsed.acct}@${parsed.host}`}`, date: String(status.created_at || ''), text: cleanText(status.content || ''),
    contentWarning: cleanText(status.spoiler_text || ''), url: String(status.url || status.uri || ''),
    images: (status.media_attachments || []).filter((item) => item.type === 'image').map((item) => ({ url: item.url || item.preview_url, alt: item.description || '' })),
  })).filter((item) => isCampaignRelevant(item, campaign, requestUrl))
  return { social, sourceUrl: String(profile.url || `${parsed.origin}/@${parsed.acct}`) }
}

async function fetchCoverageFeed(rawUrl, campaign, requestUrl, fetcher) {
  const url = safePublicUrl(rawUrl)
  const { text: xml } = await fetchBoundedText(url, remoteOptions(fetcher, 'application/rss+xml, application/atom+xml, application/xml, text/xml'))
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const parsed = parser.parse(xml)
  const channel = parsed?.rss?.channel || parsed?.feed || {}
  const outlet = cleanText(channel.title || url.hostname)
  const coverage = asArray(channel.item || channel.entry).map((item) => ({
    id: `coverage-${normalizeSlug(rssLink(item.link) || item.title)}`, date: normalizeDate(item.pubDate || item.published || item.updated || item['dc:date']),
    outlet, title: cleanText(item.title), url: rssLink(item.link), summary: summarize(item.description || item.summary || item.content || item['content:encoded'], 320), automated: true,
  })).filter((item) => item.url && isCampaignRelevant(item, campaign, requestUrl))
  return { coverage }
}

async function fetchNewsDiscovery(campaign, requestUrl, fetcher) {
  const phrases = [campaign.title, campaign.shortTitle, ...(campaign.campaignKeywords || [])].map(cleanText).filter((value) => value.length >= 5).slice(0, 6)
  if (!phrases.length) throw new Error('News discovery requires a campaign title or discovery keywords')
  const url = new URL('https://www.bing.com/news/search')
  url.searchParams.set('q', phrases.map((value) => `"${value.replace(/"/g, '')}"`).join(' OR '))
  url.searchParams.set('qft', 'sortbydate="1"')
  url.searchParams.set('format', 'RSS')
  return fetchCoverageFeed(url.toString(), campaign, requestUrl, fetcher)
}

async function fetchSignatories(rawUrl, fetcher) {
  const url = safePublicUrl(rawUrl)
  const { data } = await fetchBoundedJson(url, remoteOptions(fetcher, 'application/json'))
  const rows = Array.isArray(data) ? data : data?.signatories
  if (!Array.isArray(rows)) throw new Error('Signatories endpoint did not return an array')
  return { signatories: rows.map((item, index) => ({ id: String(item.id || `signatory-${index + 1}`), name: cleanText(item.name || item.organization), location: cleanText(item.location), statement: cleanText(item.statement), url: safeOptionalUrl(item.url) })).filter((item) => item.name) }
}

function parseMastodonAccount(value) {
  const match = String(value || '').trim().match(/^@?([^@\s]+)@([^@\s/]+)$/)
  if (!match) throw new Error('Mastodon account must use @name@server.example format')
  const url = safePublicUrl(`https://${match[2]}`)
  return { acct: match[1], host: match[2], origin: url.origin }
}
function remoteOptions(fetcher, accept) { return { fetcher, accept, maxBytes: 2 * 1024 * 1024, timeoutMs: 9000, userAgent: 'SabotMediaCampaignAutomation/1.0 (+https://example.invalid)' } }
function safePublicUrl(value) { return validatePublicRemoteUrl(value) }
function safeOptionalUrl(value) { try { return value ? safePublicUrl(value).toString() : '' } catch { return '' } }
function rssLink(value) { if (typeof value === 'string') return safeOptionalUrl(value); if (Array.isArray(value)) return rssLink(value.find((item) => item?.['@_rel'] === 'alternate') || value[0]); return safeOptionalUrl(value?.['@_href'] || value?.['#text'] || '') }
function asArray(value) { return Array.isArray(value) ? value : value ? [value] : [] }
function mergeByUrl(...groups) { const seen = new Set(); return groups.flat().filter((item) => { const key = String(item?.url || item?.id || '').trim().toLowerCase().replace(/\/$/, ''); if (!key || seen.has(key)) return false; seen.add(key); return true }) }
function mergeSignatories(...groups) { const seen = new Set(); return groups.flat().filter((item) => { const key = cleanText(item?.name).toLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true }) }
function newestFirst(a, b) { return new Date(b.date || 0) - new Date(a.date || 0) }
function normalizeDate(value) { const date = new Date(value || 0); return Number.isFinite(date.getTime()) ? date.toISOString() : '' }
function normalizeSlug(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function cleanText(value) { return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#(?:39|x27);/gi, "'").replace(/\s+/g, ' ').trim() }
function summarize(value, length) { const text = cleanText(value); return text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…` }
function disabledAutomationPayload() { return { ok: true, social: [], coverage: [], signatories: [], socialSources: [], errors: [], checkedAt: null, disabled: true } }
