import { loadFeedSettings, normalizeFeedTerm, slugifyFeedTerm } from './feedSettings.js'

function escapeXml(value = '') {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function itemDate(item) {
  const d = new Date(String(item.publishedAt || item.scheduledFor || item.updatedAt || item.createdAt || ''))
  return Number.isFinite(d.getTime()) ? d.toUTCString() : new Date().toUTCString()
}

function normalizeFeedItem(item, settings) {
  const slug = item.slug || item.id || ''
  const author = normalizeFeedTerm('author', item.author || item.byline || 'SabotPress Collective', settings) || 'SabotPress Collective'
  const category = normalizeFeedTerm('format', item.contentType || item.type || 'article', settings) || 'article'
  return {
    title: item.title || slug || 'Untitled',
    link: slug ? `https://example.invalid/post/${slug}` : 'https://example.invalid/archive',
    description: item.excerpt || item.summary || '',
    date: itemDate(item),
    author,
    category,
  }
}

export function buildRssXml(title, description, items = [], options = {}) {
  const settings = options.settings || loadFeedSettings()
  const feedItems = items.map((item) => normalizeFeedItem(item, settings))
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>https://example.invalid/</link>
    <description>${escapeXml(description)}</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${feedItems.map((item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid>${escapeXml(item.link)}</guid>
      <pubDate>${escapeXml(item.date)}</pubDate>
      <author>${escapeXml(item.author)}</author>
      <category>${escapeXml(item.category)}</category>
      <description>${escapeXml(item.description)}</description>
    </item>`).join('\n')}
  </channel>
</rss>`
}

function getValues(item, fields = []) {
  const values = []
  for (const field of fields) {
    const value = item?.[field]
    if (Array.isArray(value)) values.push(...value)
    else if (value) values.push(value)
  }
  return values
}

function groupBy(items, kind, getter, settings) {
  const groups = {}
  for (const item of items) {
    const keys = getter(item)
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      const clean = normalizeFeedTerm(kind, key, settings)
      if (!clean) continue
      groups[clean] = groups[clean] || []
      groups[clean].push(item)
    }
  }
  return groups
}

function addGroupedFeeds(bundle, { prefix, titlePrefix, descriptionPrefix, groups, settings }) {
  for (const [term, groupItems] of Object.entries(groups)) {
    const slug = slugifyFeedTerm(term)
    bundle[`${prefix}/${slug}.xml`] = buildRssXml(`${titlePrefix} / ${term}`, `${descriptionPrefix} ${term}.`, groupItems, { settings })
  }
}

function isFeedVisible(item, now = Date.now()) {
  if (item?.status === 'published' || item?.workflowState === 'published') return true
  if (item?.status === 'scheduled' || item?.workflowState === 'scheduled') {
    const scheduled = new Date(String(item?.scheduledFor || '')).getTime()
    return Number.isFinite(scheduled) && scheduled <= now
  }
  return false
}

export function buildRssBundle(items = [], options = {}) {
  const settings = options.settings || loadFeedSettings()
  const now = Number(options.now || Date.now())
  const visible = items.filter((item) => isFeedVisible(item, now))
  const bundle = {}

  if (settings.exposeMainFeed !== false) bundle['all-content.xml'] = buildRssXml('SabotPress', 'All published SabotPress content.', visible, { settings })

  if (settings.exposeProjectFeeds !== false) addGroupedFeeds(bundle, {
    prefix: 'projects', titlePrefix: 'SabotPress', descriptionPrefix: 'Published content for',
    groups: groupBy(visible, 'project', (item) => getValues(item, ['projects', 'primaryProject', 'categories']), settings), settings,
  })
  if (settings.exposeCollectionFeeds !== false) addGroupedFeeds(bundle, {
    prefix: 'collections', titlePrefix: 'SabotPress', descriptionPrefix: 'Published content in',
    groups: groupBy(visible, 'collection', (item) => getValues(item, ['collections', 'collection']), settings), settings,
  })
  if (settings.exposeFormatFeeds !== false) addGroupedFeeds(bundle, {
    prefix: 'formats', titlePrefix: 'SabotPress', descriptionPrefix: 'Published',
    groups: groupBy(visible, 'format', (item) => item.contentType || item.type || 'article', settings), settings,
  })
  if (settings.exposeAuthorFeeds !== false) addGroupedFeeds(bundle, {
    prefix: 'bylines', titlePrefix: 'SabotPress', descriptionPrefix: 'Published under the public byline label',
    groups: groupBy(visible, 'author', (item) => item.author || item.byline || 'SabotPress Collective', settings), settings,
  })
  if (settings.exposeTopicFeeds !== false) addGroupedFeeds(bundle, {
    prefix: 'topics', titlePrefix: 'SabotPress', descriptionPrefix: 'Published content tagged',
    groups: groupBy(visible, 'topic', (item) => getValues(item, ['topics', 'tags']), settings), settings,
  })
  if (settings.exposeSeriesFeeds !== false) addGroupedFeeds(bundle, {
    prefix: 'series', titlePrefix: 'SabotPress', descriptionPrefix: 'Published content in',
    groups: groupBy(visible, 'series', (item) => getValues(item, ['series', 'seriesSlug']), settings), settings,
  })

  // Podcast show feeds are deliberately not generated here. The podcast
  // subsystem owns directory-grade RSS (enclosures, iTunes metadata, GUIDs,
  // and one feed per show). A generic formats/podcast.xml feed can still exist
  // as a website-content lane, but it is not a replacement for a show feed.
  return bundle
}

export function downloadRssBundle(items = [], options = {}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const blob = new Blob([JSON.stringify(buildRssBundle(items, options), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `sabot-rss-bundle-${stamp}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
