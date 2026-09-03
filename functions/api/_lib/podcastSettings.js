import { listNativeEntries } from './nativePublicContent.js'

export const PODCAST_SETTING_KEY = 'podcast-settings-v1'
export const PODCAST_SHOWS_SETTING_KEY = 'podcast-shows-v1'

export const PODCAST_SETTINGS_DEFAULTS = Object.freeze({
  rssFeedUrl: '',
  podcastTitle: 'SabotPress Podcast',
  author: 'SabotPress',
  description: 'SabotPress podcast and AudioLab episodes.',
  defaultCoverArt: '',
  audioHostBaseUrl: '',
  websiteUrl: 'https://example.invalid',
  language: 'en-us',
  category: 'News',
  explicit: false,
  ownerName: '',
  ownerEmail: '',
  sourceFeedUrl: '',
  sourceFeedResolvedUrl: '',
  sourceFeedLastSyncedAt: '',
  sourceFeedUrls: [],
})

export async function ensureSiteSettingsTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS site_settings (
    setting_key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_site_settings_updated_at ON site_settings(updated_at DESC)').run()
}

export function podcastFeedUrl(slug, origin = 'https://example.invalid') {
  const cleanSlug = slugifyShow(slug)
  return cleanSlug ? `${String(origin || 'https://example.invalid').replace(/\/$/, '')}/feeds/podcasts/${cleanSlug}.xml` : ''
}

export function normalizePodcastSettings(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const slug = slugifyShow(value.slug || value.id || value.podcastTitle)
  const sourceFeedUrl = cleanUrl(value.sourceFeedUrl)
  const sourceFeedUrls = uniqueUrls([
    ...(Array.isArray(value.sourceFeedUrls) ? value.sourceFeedUrls : []),
    sourceFeedUrl,
  ])
  return {
    ...PODCAST_SETTINGS_DEFAULTS,
    ...value,
    id: clean(value.id || slug, 160),
    slug,
    rssFeedUrl: cleanUrl(value.rssFeedUrl) || podcastFeedUrl(slug),
    podcastTitle: clean(value.podcastTitle || PODCAST_SETTINGS_DEFAULTS.podcastTitle, 200),
    author: clean(value.author || PODCAST_SETTINGS_DEFAULTS.author, 200),
    description: clean(value.description || PODCAST_SETTINGS_DEFAULTS.description, 4000),
    defaultCoverArt: cleanUrl(value.defaultCoverArt),
    audioHostBaseUrl: cleanUrl(value.audioHostBaseUrl),
    websiteUrl: cleanUrl(value.websiteUrl || PODCAST_SETTINGS_DEFAULTS.websiteUrl),
    language: clean(value.language || PODCAST_SETTINGS_DEFAULTS.language, 40).toLowerCase(),
    category: clean(value.category || PODCAST_SETTINGS_DEFAULTS.category, 120),
    explicit: Boolean(value.explicit),
    ownerName: clean(value.ownerName, 200),
    ownerEmail: clean(value.ownerEmail, 254).toLowerCase(),
    sourceFeedUrl,
    sourceFeedResolvedUrl: cleanUrl(value.sourceFeedResolvedUrl),
    sourceFeedLastSyncedAt: cleanDate(value.sourceFeedLastSyncedAt),
    sourceFeedUrls,
    createdAt: cleanDate(value.createdAt) || new Date().toISOString(),
    updatedAt: cleanDate(value.updatedAt) || new Date().toISOString(),
  }
}

export async function readPodcastShows(db) {
  if (!db) throw new Error('BF_DB binding is required for podcast settings')
  await ensureSiteSettingsTable(db)

  const row = await db.prepare('SELECT value_json, updated_at FROM site_settings WHERE setting_key = ? LIMIT 1')
    .bind(PODCAST_SHOWS_SETTING_KEY)
    .first()
  const parsed = parseObject(row?.value_json)
  if (parsed && Array.isArray(parsed.shows)) {
    const shows = normalizeRegistryShows(parsed.shows)
    const defaultShowId = resolveDefaultShowId(parsed.defaultShowId, shows)
    return { shows, defaultShowId, updatedAt: String(row?.updated_at || '') }
  }

  return migrateLegacyPodcastSettings(db)
}

export async function readPodcastSettings(db, showKey = '') {
  const registry = await readPodcastShows(db)
  const settings = findShowInRegistry(registry, showKey) || findShowInRegistry(registry, registry.defaultShowId) || null
  return { settings: settings || normalizePodcastSettings({}), updatedAt: registry.updatedAt }
}

export async function findPodcastShow(db, showKey = '') {
  const registry = await readPodcastShows(db)
  return findShowInRegistry(registry, showKey)
}

export async function upsertPodcastShow(db, input = {}, options = {}) {
  if (!db) throw new Error('BF_DB binding is required for podcast settings')
  const registry = await readPodcastShows(db)
  const requestedKey = String(options.showId || input.id || input.slug || '').trim()
  const requestedSource = cleanUrl(input.sourceFeedUrl)
  const existing = findShowInRegistry(registry, requestedKey)
    || registry.shows.find((show) => requestedSource && podcastShowSourceUrls(show).includes(requestedSource))
    || null

  const now = new Date().toISOString()
  const usedSlugs = new Set(registry.shows.filter((show) => show !== existing).map((show) => show.slug))
  const proposedSlug = existing?.slug || uniqueShowSlug(slugifyShow(input.slug || input.podcastTitle || 'podcast'), usedSlugs)
  const merged = normalizePodcastSettings({
    ...(existing || {}),
    ...input,
    id: existing?.id || proposedSlug,
    slug: proposedSlug,
    rssFeedUrl: podcastFeedUrl(proposedSlug),
    sourceFeedUrls: uniqueUrls([
      ...podcastShowSourceUrls(existing),
      ...(Array.isArray(input.sourceFeedUrls) ? input.sourceFeedUrls : []),
      input.sourceFeedUrl,
    ]),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  })

  const shows = existing
    ? registry.shows.map((show) => show.id === existing.id ? merged : show)
    : [...registry.shows, merged]
  const defaultShowId = options.makeDefault || !registry.defaultShowId ? merged.id : registry.defaultShowId
  const updatedAt = await writePodcastRegistry(db, { shows, defaultShowId })
  return { show: merged, settings: merged, shows, defaultShowId, updatedAt }
}

export async function writePodcastSettings(db, input = {}, options = {}) {
  const registry = await readPodcastShows(db)
  const showId = options.showId || input.id || registry.defaultShowId || ''
  return upsertPodcastShow(db, input, { ...options, showId })
}

export function podcastShowSourceUrls(show = {}) {
  return uniqueUrls([
    ...(Array.isArray(show?.sourceFeedUrls) ? show.sourceFeedUrls : []),
    show?.sourceFeedUrl,
    show?.sourceFeedResolvedUrl,
  ])
}

export function podcastShowOwnsEntry(show, entry) {
  if (!show || !entry || entry.contentType !== 'podcast') return false
  const sourceUrl = cleanUrl(entry.sourceUrl)
  if (!sourceUrl) return false
  return podcastShowSourceUrls(show).includes(sourceUrl)
}

async function migrateLegacyPodcastSettings(db) {
  const legacy = await readLegacyPodcastSettings(db)
  const entries = await listNativeEntries(db, { includeFuture: true })
  const groups = new Map()

  for (const item of entries) {
    if (item?.contentType !== 'podcast' || String(item?.sourceKind || '') !== 'podcast-rss') continue
    const sourceUrl = cleanUrl(item?.sourceUrl)
    if (!sourceUrl) continue
    const current = groups.get(sourceUrl) || {
      sourceUrl,
      title: '',
      author: '',
      cover: '',
      firstSeen: '',
      updatedAt: '',
    }
    current.title ||= clean(item?.sourceLabel, 200)
    current.author ||= clean(item?.author, 200)
    current.cover ||= cleanUrl(item?.podcastCoverImage || item?.featuredImage || item?.heroImage)
    current.firstSeen = earlierDate(current.firstSeen, item?.createdAt || item?.publishedAt)
    current.updatedAt = laterDate(current.updatedAt, item?.updatedAt || item?.publishedAt)
    groups.set(sourceUrl, current)
  }

  const orderedGroups = [...groups.values()].sort((a, b) => dateNumber(a.firstSeen) - dateNumber(b.firstSeen))
  const usedSlugs = new Set()
  const shows = orderedGroups.map((group) => {
    const isLegacyCurrent = legacy.settings.sourceFeedUrl && sameUrl(legacy.settings.sourceFeedUrl, group.sourceUrl)
    const base = isLegacyCurrent ? legacy.settings : {}
    const slug = uniqueShowSlug(slugifyShow(group.title || base.podcastTitle || 'podcast'), usedSlugs)
    usedSlugs.add(slug)
    return normalizePodcastSettings({
      ...base,
      id: slug,
      slug,
      rssFeedUrl: podcastFeedUrl(slug),
      podcastTitle: group.title || base.podcastTitle || 'Podcast',
      author: base.author || group.author || 'SabotPress',
      defaultCoverArt: base.defaultCoverArt || group.cover || '',
      sourceFeedUrl: group.sourceUrl,
      sourceFeedUrls: [group.sourceUrl],
      createdAt: group.firstSeen || legacy.updatedAt || new Date().toISOString(),
      updatedAt: group.updatedAt || legacy.updatedAt || new Date().toISOString(),
    })
  })

  if (!shows.length && legacy.settings.sourceFeedUrl) {
    const slug = uniqueShowSlug(slugifyShow(legacy.settings.podcastTitle || 'podcast'), usedSlugs)
    shows.push(normalizePodcastSettings({
      ...legacy.settings,
      id: slug,
      slug,
      rssFeedUrl: podcastFeedUrl(slug),
      sourceFeedUrls: [legacy.settings.sourceFeedUrl],
    }))
  }

  const defaultShowId = shows[0]?.id || ''
  const updatedAt = await writePodcastRegistry(db, { shows, defaultShowId })
  return { shows, defaultShowId, updatedAt }
}

async function readLegacyPodcastSettings(db) {
  const row = await db.prepare('SELECT value_json, updated_at FROM site_settings WHERE setting_key = ? LIMIT 1')
    .bind(PODCAST_SETTING_KEY)
    .first()
  return {
    settings: normalizePodcastSettings(parseObject(row?.value_json) || {}),
    updatedAt: String(row?.updated_at || ''),
  }
}

async function writePodcastRegistry(db, registry) {
  await ensureSiteSettingsTable(db)
  const shows = normalizeRegistryShows(registry?.shows || [])
  const defaultShowId = resolveDefaultShowId(registry?.defaultShowId, shows)
  const updatedAt = new Date().toISOString()
  await db.prepare(`INSERT INTO site_settings (setting_key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`)
    .bind(PODCAST_SHOWS_SETTING_KEY, JSON.stringify({ version: 1, shows, defaultShowId }), updatedAt)
    .run()
  return updatedAt
}

function normalizeRegistryShows(input = []) {
  const used = new Set()
  const shows = []
  for (const raw of Array.isArray(input) ? input : []) {
    const requested = slugifyShow(raw?.slug || raw?.id || raw?.podcastTitle || 'podcast')
    const slug = uniqueShowSlug(requested, used)
    used.add(slug)
    shows.push(normalizePodcastSettings({ ...raw, id: raw?.id || slug, slug, rssFeedUrl: podcastFeedUrl(slug) }))
  }
  return shows
}

function findShowInRegistry(registry, showKey = '') {
  const key = String(showKey || '').trim().toLowerCase()
  if (!key) return null
  return (registry?.shows || []).find((show) => {
    if (String(show.id || '').toLowerCase() === key || String(show.slug || '').toLowerCase() === key) return true
    return podcastShowSourceUrls(show).some((url) => url.toLowerCase() === key)
  }) || null
}

function resolveDefaultShowId(requested, shows) {
  const key = String(requested || '').trim()
  return shows.some((show) => show.id === key) ? key : (shows[0]?.id || '')
}

function slugifyShow(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'podcast'
}

function uniqueShowSlug(base, used) {
  let candidate = base || 'podcast'
  let counter = 2
  while (used.has(candidate)) {
    candidate = `${base}-${counter}`
    counter += 1
  }
  return candidate
}

function uniqueUrls(values = []) {
  const seen = new Set()
  const urls = []
  for (const value of values) {
    const url = cleanUrl(value)
    if (!url || seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls
}

function sameUrl(a, b) {
  return cleanUrl(a) === cleanUrl(b)
}

function parseObject(value) {
  try {
    const parsed = JSON.parse(String(value || 'null'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function clean(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function cleanUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw.slice(0, 2000)
  return ''
}

function cleanDate(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const time = new Date(raw).getTime()
  return Number.isFinite(time) ? new Date(time).toISOString() : ''
}

function earlierDate(current, next) {
  if (!next) return current || ''
  if (!current) return cleanDate(next)
  return dateNumber(next) < dateNumber(current) ? cleanDate(next) : current
}

function laterDate(current, next) {
  if (!next) return current || ''
  if (!current) return cleanDate(next)
  return dateNumber(next) > dateNumber(current) ? cleanDate(next) : current
}

function dateNumber(value) {
  const time = new Date(String(value || '')).getTime()
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER
}
