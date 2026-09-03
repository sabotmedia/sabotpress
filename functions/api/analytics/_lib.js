import { canonicalizeAnalyticsPath } from '../../../shared/analyticsPath.js'

export const ANALYTICS_TIME_ZONE = 'America/Los_Angeles'

export async function ensureAnalyticsTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      occurred_at TEXT NOT NULL,
      day TEXT NOT NULL,
      path TEXT NOT NULL,
      page_title TEXT NOT NULL DEFAULT '',
      session_hash TEXT NOT NULL,
      referrer_host TEXT NOT NULL DEFAULT '',
      referrer_path TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'direct',
      medium TEXT NOT NULL DEFAULT 'none',
      campaign TEXT NOT NULL DEFAULT '',
      device TEXT NOT NULL DEFAULT 'desktop',
      browser TEXT NOT NULL DEFAULT 'other',
      country TEXT NOT NULL DEFAULT '',
      event_type TEXT NOT NULL DEFAULT 'pageview',
      reporting_timezone TEXT NOT NULL DEFAULT ''
    );
  `).run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_analytics_events_time ON analytics_events(occurred_at DESC);').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_analytics_events_day ON analytics_events(day);').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_analytics_events_path ON analytics_events(path);').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(day, session_hash);').run()
  const columns = await db.prepare('PRAGMA table_info(analytics_events)').all()
  if (!(columns?.results || []).some((column) => column.name === 'reporting_timezone')) {
    try {
      await db.prepare("ALTER TABLE analytics_events ADD COLUMN reporting_timezone TEXT NOT NULL DEFAULT ''").run()
    } catch (error) {
      if (!/duplicate column/i.test(String(error?.message || error))) throw error
    }
  }
}

export async function ensureAnalyticsReportingDays(db, timeZone = ANALYTICS_TIME_ZONE) {
  const result = await db.prepare(`SELECT id, occurred_at, day FROM analytics_events
    WHERE reporting_timezone IS NULL OR reporting_timezone != ? LIMIT 5000`).bind(timeZone).all()
  const rows = Array.isArray(result?.results) ? result.results : []
  const statements = rows.map((row) => db.prepare('UPDATE analytics_events SET day = ?, reporting_timezone = ? WHERE id = ?')
    .bind(reportingDay(row.occurred_at, timeZone), timeZone, row.id))
  for (let index = 0; index < statements.length; index += 100) await db.batch(statements.slice(index, index + 100))
  return rows.length
}

export function cleanPath(value) {
  return canonicalizeAnalyticsPath(value)
}

export function cleanText(value, max = 180) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max)
}

export function parseReferrer(value, siteOrigin) {
  try {
    const ref = new URL(String(value || ''))
    const site = new URL(siteOrigin)
    if (ref.hostname === site.hostname || ref.hostname === `www.${site.hostname}`) {
      return { host: '', path: cleanPath(ref.pathname), source: 'internal', medium: 'navigation' }
    }
    return {
      host: cleanText(ref.hostname.replace(/^www\./, ''), 120),
      path: cleanPath(ref.pathname),
      source: cleanText(ref.hostname.replace(/^www\./, ''), 120),
      medium: 'referral',
    }
  } catch {
    return { host: '', path: '', source: 'direct', medium: 'none' }
  }
}

export function parseDevice(userAgent) {
  const ua = String(userAgent || '')
  if (!ua || /bot|crawler|spider|preview|facebookexternalhit|slurp|headless|lighthouse|pingdom|uptime|curl|wget/i.test(ua)) {
    return { bot: true, device: 'bot', browser: 'bot' }
  }
  const device = /ipad|tablet|kindle|silk/i.test(ua) ? 'tablet' : /mobile|iphone|ipod|android/i.test(ua) ? 'mobile' : 'desktop'
  const browser = /firefox|fxios/i.test(ua)
    ? 'Firefox'
    : /edg(?:e|a|ios)?\//i.test(ua)
      ? 'Edge'
      : /opr\/|opera/i.test(ua)
        ? 'Opera'
        : /chrome|crios/i.test(ua)
          ? 'Chrome'
          : /safari/i.test(ua) && !/android/i.test(ua)
            ? 'Safari'
            : 'Other'
  return { bot: false, device, browser }
}

export function isAutomatedRequest(context, parsedAgent) {
  if (parsedAgent?.bot) return true
  const botManagement = context?.request?.cf?.botManagement || context?.request?.cf?.bot_management
  if (botManagement?.verifiedBot === true || botManagement?.verified_bot === true) return true
  const score = Number(botManagement?.score)
  return Number.isFinite(score) && score > 0 && score <= 10
}

export function isSameOriginAnalyticsRequest(request) {
  try {
    const requestUrl = new URL(request.url)
    const origin = String(request.headers.get('origin') || '').trim()
    if (origin) return new URL(origin).origin === requestUrl.origin
    return String(request.headers.get('sec-fetch-site') || '').toLowerCase() === 'same-origin'
  } catch {
    return false
  }
}

export async function hashSession(value) {
  const bytes = new TextEncoder().encode(String(value || ''))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function reportingDay(value = new Date(), timeZone = ANALYTICS_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function daysAgo(days, now = new Date(), timeZone = ANALYTICS_TIME_ZONE) {
  const today = reportingDay(now, timeZone)
  const [year, month, day] = today.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day - Math.max(0, days - 1))).toISOString().slice(0, 10)
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
