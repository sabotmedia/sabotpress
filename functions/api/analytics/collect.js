import {
  cleanPath,
  cleanText,
  ensureAnalyticsTable,
  hashSession,
  isAutomatedRequest,
  isSameOriginAnalyticsRequest,
  json,
  ANALYTICS_TIME_ZONE,
  parseDevice,
  parseReferrer,
  reportingDay,
} from './_lib.js'

export async function onRequestPost(context) {
  if (!context.env?.BF_DB) return json({ ok: false, error: 'analytics storage unavailable' }, 503)

  if (respectsPrivacySignal(context.request)) {
    return json({ ok: true, ignored: 'privacy-signal' }, 202)
  }

  if (!isSameOriginAnalyticsRequest(context.request)) {
    return json({ ok: true, ignored: 'non-site-origin' }, 202)
  }

  try {
    const body = await context.request.json()
    const sessionId = cleanText(body?.sessionId, 120)
    if (sessionId.length < 12) return json({ ok: false, error: 'invalid session' }, 400)

    const agent = parseDevice(context.request.headers.get('user-agent'))
    if (isAutomatedRequest(context, agent)) return json({ ok: true, ignored: 'bot' }, 202)

    const url = new URL(context.request.url)
    const referrer = parseReferrer(body?.referrer, url.origin)
    const now = new Date()
    const occurredAt = now.toISOString()
    const day = reportingDay(now)
    const sessionHash = await hashSession(`${day}:${sessionId}`)
    const path = cleanPath(body?.path)
    const id = crypto.randomUUID()
    const country = cleanText(context.request.cf?.country || '', 3).toUpperCase()

    await ensureAnalyticsTable(context.env.BF_DB)
    if (path === '/deployment-check') {
      await context.env.BF_DB.prepare("DELETE FROM analytics_events WHERE path = '/deployment-check'").run()
      return json({ ok: true, ignored: 'health-check' }, 202)
    }
    await context.env.BF_DB.prepare(`
      INSERT INTO analytics_events (
        id, occurred_at, day, path, page_title, session_hash,
        referrer_host, referrer_path, source, medium, campaign, device, browser, country, event_type, reporting_timezone
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pageview', ?)
    `).bind(
      id,
      occurredAt,
      day,
      path,
      cleanText(body?.title, 220),
      sessionHash,
      referrer.host,
      referrer.path,
      cleanText(body?.source, 120) || referrer.source,
      cleanText(body?.medium, 80) || referrer.medium,
      cleanText(body?.campaign, 160),
      agent.device,
      agent.browser,
      country,
      ANALYTICS_TIME_ZONE,
    ).run()

    if (Math.random() < 0.01) {
      await context.env.BF_DB.prepare("DELETE FROM analytics_events WHERE occurred_at < datetime('now', '-400 days')").run()
    }

    return json({ ok: true }, 202)
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 400)
  }
}

export function onRequestGet() {
  return json({ ok: false, error: 'method not allowed' }, 405)
}

export function respectsPrivacySignal(request) {
  const dnt = String(request?.headers?.get?.('dnt') || '').trim()
  const gpc = String(request?.headers?.get?.('sec-gpc') || '').trim()
  return dnt === '1' || gpc === '1'
}
