import { permissionHasCapability, resolvePublicSitePermission } from '../_lib/publicSiteAuth.js'
import { ensureNativePublicContentTable } from '../_lib/nativePublicContent.js'
import { ANALYTICS_TIME_ZONE, daysAgo, ensureAnalyticsReportingDays, ensureAnalyticsTable, json, reportingDay } from './_lib.js'
import { resolveNamedQueries } from './reportQueries.js'
import { analyticsPathLabel } from '../../../shared/analyticsPath.js'

const STATIC_PAGE_TITLES = Object.freeze({
  '/': 'Homepage',
  '/about': 'About',
  '/archive': 'Archive',
  '/campaigns': 'Campaigns',
  '/campaigns/example-campaign': 'Communications Infrastructure Is Not Terrorism',
  '/campaigns/example-campaign/coverage': 'A/I Campaign Coverage Archive',
  '/collections': 'Collections',
  '/contact': 'Contact',
  '/feeds': 'Feeds',
  '/press': 'Press',
  '/publications': 'Publications',
  '/search': 'Search',
  '/security': 'Security',
  '/submit': 'Submit',
  '/support': 'Support',
  '/updates': 'Updates',
})

export async function onRequestGet(context) {
  const permission = await resolvePublicSitePermission(context)
  if (!permissionHasCapability(permission, 'analytics:view')) return json({ ok: false, error: 'analytics-view permission required' }, 403)
  if (!context.env?.BF_DB) return json({ ok: false, error: 'analytics storage unavailable' }, 503)

  try {
    const url = new URL(context.request.url)
    const requestedDays = Number(url.searchParams.get('days') || 30)
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30
    const since = daysAgo(days)
    const previousSince = daysAgo(days * 2)
    const today = reportingDay()
    const db = context.env.BF_DB
    await ensureAnalyticsTable(db)
    await Promise.all([ensureAnalyticsReportingDays(db), ensureNativePublicContentTable(db)])

    const report = await resolveNamedQueries({
      summary: db.prepare(`SELECT
          SUM(CASE WHEN day >= ? THEN 1 ELSE 0 END) AS views,
          COUNT(DISTINCT CASE WHEN day >= ? THEN session_hash END) AS sessions,
          SUM(CASE WHEN day = ? THEN 1 ELSE 0 END) AS views_today,
          COUNT(DISTINCT CASE WHEN day = ? THEN session_hash END) AS sessions_today,
          SUM(CASE WHEN day < ? THEN 1 ELSE 0 END) AS previous_views,
          COUNT(DISTINCT CASE WHEN day < ? THEN session_hash END) AS previous_sessions
        FROM analytics_events WHERE event_type = 'pageview' AND day >= ?`).bind(since, since, today, today, since, since, previousSince).first(),
      daily: db.prepare(`SELECT day, COUNT(*) AS views, COUNT(DISTINCT session_hash) AS sessions
        FROM analytics_events WHERE event_type = 'pageview' AND day >= ? GROUP BY day ORDER BY day ASC`).bind(since).all(),
      topPages: db.prepare(`WITH cleaned AS (
          SELECT occurred_at, page_title, session_hash,
            CASE WHEN path != '/' THEN RTRIM(path, '/') ELSE '/' END AS clean_path
          FROM analytics_events WHERE event_type = 'pageview' AND day >= ?
        ), normalized AS (
          SELECT occurred_at, page_title, session_hash,
            CASE
              WHEN LOWER(clean_path) GLOB '/piece/*/print' THEN '/post/' || LOWER(SUBSTR(clean_path, 8, LENGTH(clean_path) - 13))
              WHEN LOWER(clean_path) GLOB '/piece/*' THEN '/post/' || LOWER(SUBSTR(clean_path, 8))
              WHEN LOWER(clean_path) GLOB '/post/*/print' THEN LOWER(SUBSTR(clean_path, 1, LENGTH(clean_path) - 6))
              WHEN LOWER(clean_path) GLOB '/print/*' THEN '/post/' || LOWER(SUBSTR(clean_path, 8))
              WHEN LOWER(clean_path) GLOB '/updates/*' THEN '/post/' || LOWER(SUBSTR(clean_path, 10))
              ELSE LOWER(clean_path)
            END AS canonical_path
          FROM cleaned
        ), ranked AS (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY canonical_path
            ORDER BY CASE WHEN page_title != '' THEN 0 ELSE 1 END, occurred_at DESC
          ) AS title_rank
          FROM normalized
        )
        SELECT canonical_path AS path,
          MAX(CASE WHEN title_rank = 1 THEN page_title ELSE '' END) AS title,
          COUNT(*) AS views,
          COUNT(DISTINCT session_hash) AS sessions
        FROM ranked GROUP BY canonical_path ORDER BY views DESC LIMIT 15`).bind(since).all(),
      referrers: db.prepare(`WITH entries AS (
          SELECT referrer_host, session_hash, ROW_NUMBER() OVER (PARTITION BY session_hash ORDER BY occurred_at, id) AS entry_rank
          FROM analytics_events WHERE event_type = 'pageview' AND day >= ?
        )
        SELECT referrer_host AS referrer, COUNT(*) AS views, COUNT(DISTINCT session_hash) AS sessions
        FROM entries WHERE entry_rank = 1 AND referrer_host != '' GROUP BY referrer_host ORDER BY views DESC LIMIT 12`).bind(since).all(),
      campaigns: db.prepare(`WITH entries AS (
          SELECT campaign, session_hash, ROW_NUMBER() OVER (PARTITION BY session_hash ORDER BY occurred_at, id) AS entry_rank
          FROM analytics_events WHERE event_type = 'pageview' AND day >= ?
        )
        SELECT campaign AS label, COUNT(*) AS views, COUNT(DISTINCT session_hash) AS sessions
        FROM entries WHERE entry_rank = 1 AND campaign != '' GROUP BY campaign ORDER BY views DESC LIMIT 12`).bind(since).all(),
      sources: db.prepare(`WITH entries AS (
          SELECT campaign, referrer_host, source, session_hash,
            ROW_NUMBER() OVER (PARTITION BY session_hash ORDER BY occurred_at, id) AS entry_rank
          FROM analytics_events WHERE event_type = 'pageview' AND day >= ?
        )
        SELECT CASE
          WHEN campaign != '' THEN 'Campaign tagged'
          WHEN referrer_host != '' THEN 'External referral'
          ELSE 'Direct / unknown'
        END AS label, COUNT(*) AS views, COUNT(DISTINCT session_hash) AS sessions
        FROM entries WHERE entry_rank = 1 GROUP BY label ORDER BY views DESC`).bind(since).all(),
      devices: db.prepare(`SELECT device AS label, COUNT(*) AS views, COUNT(DISTINCT session_hash) AS sessions FROM analytics_events WHERE event_type = 'pageview' AND day >= ? GROUP BY device ORDER BY views DESC`).bind(since).all(),
      browsers: db.prepare(`SELECT browser AS label, COUNT(*) AS views, COUNT(DISTINCT session_hash) AS sessions FROM analytics_events WHERE event_type = 'pageview' AND day >= ? GROUP BY browser ORDER BY views DESC`).bind(since).all(),
      countries: db.prepare(`SELECT country AS label, COUNT(*) AS views, COUNT(DISTINCT session_hash) AS sessions FROM analytics_events
        WHERE event_type = 'pageview' AND day >= ? AND country != '' GROUP BY country HAVING COUNT(*) >= 3 ORDER BY views DESC LIMIT 12`).bind(since).all(),
      realtime: db.prepare(`SELECT COUNT(*) AS views, COUNT(DISTINCT session_hash) AS sessions
        FROM analytics_events WHERE event_type = 'pageview' AND occurred_at >= ?`).bind(new Date(Date.now() - 30 * 60_000).toISOString()).first(),
      dataRange: db.prepare(`SELECT MIN(occurred_at) AS tracking_since, MAX(occurred_at) AS last_event_at FROM analytics_events WHERE event_type = 'pageview'`).first(),
      nativeTitles: db.prepare(`SELECT slug, json_extract(content_json, '$.title') AS title
        FROM native_public_content WHERE status IN ('published', 'scheduled')`).all(),
    })

    const nativeTitles = new Map(rows(report.nativeTitles).map((row) => [String(row.slug || '').toLowerCase(), String(row.title || '')]))
    const topPages = rows(report.topPages).map((row) => ({
      ...row,
      title: resolvePageTitle(row, nativeTitles),
    }))

    return json({
      ok: true,
      generatedAt: new Date().toISOString(),
      reportingDate: today,
      reportingTimeZone: ANALYTICS_TIME_ZONE,
      days,
      summary: normalizeRow(report.summary),
      realtime: normalizeRow(report.realtime),
      dataRange: report.dataRange || {},
      daily: rows(report.daily),
      topPages,
      referrers: rows(report.referrers),
      campaigns: rows(report.campaigns),
      sources: rows(report.sources),
      devices: rows(report.devices),
      browsers: rows(report.browsers),
      countries: rows(report.countries),
      privacy: {
        cookies: false,
        ipAddressesStored: false,
        fingerprinting: false,
        sessionScope: 'browser-tab session; daily rotating hash',
        retention: '400 days',
        privacySignals: 'DNT and GPC excluded',
        countryThreshold: 3,
      },
    })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

function rows(result) { return Array.isArray(result?.results) ? result.results.map(normalizeRow) : [] }
function normalizeRow(row) {
  const next = { ...(row || {}) }
  for (const key of ['views', 'sessions', 'views_today', 'sessions_today', 'previous_views', 'previous_sessions']) {
    if (key in next) next[key] = Number(next[key] || 0)
  }
  return next
}

export function resolvePageTitle(row, nativeTitles = new Map()) {
  const path = String(row?.path || '/')
  if (STATIC_PAGE_TITLES[path]) return STATIC_PAGE_TITLES[path]
  if (path.startsWith('/post/')) {
    const title = nativeTitles.get(path.slice('/post/'.length).toLowerCase())
    if (title) return title
  }
  const recorded = String(row?.title || '').replace(/\s*\|\s*SabotPress\s*$/i, '').trim()
  return recorded || analyticsPathLabel(path)
}
