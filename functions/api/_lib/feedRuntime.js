import { ensureNativePublicContentTable, listNativeEntries } from './nativePublicContent.js'
import { buildRssBundle } from '../../../src/lib/rssFeeds.js'
import { mergeFeedSettings, normalizeFeedTerm } from '../../../src/lib/feedSettings.js'

const SETTING_KEY = 'feed-settings-v1'

export async function buildLiveFeedBundle(db) {
  if (!db) throw new Error('BF_DB binding is required for live feeds')

  await ensureNativePublicContentTable(db)
  await ensureFeedSettingsTable(db)

  const [entries, row] = await Promise.all([
    // listNativeEntries without includeFuture already applies the canonical
    // native public-visibility rule, including scheduled work whose time arrived.
    listNativeEntries(db, {}),
    db.prepare('SELECT value_json, updated_at FROM site_settings WHERE setting_key = ? LIMIT 1').bind(SETTING_KEY).first(),
  ])

  const settings = mergeFeedSettings(parseSettings(row?.value_json) || {})
  const items = Array.isArray(entries) ? entries : []
  const bundle = buildRssBundle(items, { settings })

  return {
    settings,
    bundle,
    terms: buildDetectedTerms(items, settings),
    updatedAt: row?.updated_at || '',
    itemCount: items.length,
  }
}

export function normalizeFeedRequestPath(value) {
  const parts = Array.isArray(value) ? value : value == null ? [] : [value]
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join('/')
    .replace(/^\/+|\/+$/g, '')
}

export function buildDetectedTerms(items = [], settings = {}) {
  const kinds = {
    format: new Set(),
    project: new Set(),
    collection: new Set(),
    author: new Set(),
    topic: new Set(),
    series: new Set(),
  }

  for (const item of items) {
    addTerm(kinds.format, 'format', item?.contentType || item?.type || 'article', settings)
    addTerm(kinds.author, 'author', item?.author || item?.byline || 'SabotPress Collective', settings)
    addTerms(kinds.project, 'project', [item?.primaryProject, ...(item?.projects || []), ...(item?.categories || [])], settings)
    addTerms(kinds.collection, 'collection', [item?.collection, ...(item?.collections || [])], settings)
    addTerms(kinds.topic, 'topic', [...(item?.topics || []), ...(item?.tags || [])], settings)
    addTerms(kinds.series, 'series', [item?.series, item?.seriesSlug], settings)
  }

  return Object.fromEntries(Object.entries(kinds).map(([kind, terms]) => [kind, [...terms].sort((a, b) => a.localeCompare(b))]))
}

async function ensureFeedSettingsTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS site_settings (
    setting_key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_site_settings_updated_at ON site_settings(updated_at DESC)').run()
}

function addTerms(set, kind, values, settings) {
  for (const value of values || []) addTerm(set, kind, value, settings)
}

function addTerm(set, kind, value, settings) {
  const normalized = normalizeFeedTerm(kind, value, settings)
  if (normalized) set.add(normalized)
}

function parseSettings(value) {
  try {
    const parsed = JSON.parse(String(value || 'null'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}
