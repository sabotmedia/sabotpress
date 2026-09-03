import { canonicalizeAnalyticsPath } from '../../shared/analyticsPath'

export async function fetchAnalyticsReport(days = 30) {
  const response = await fetch(`/api/analytics/report?days=${encodeURIComponent(days)}`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) throw new Error(data?.error || `analytics request failed: ${response.status}`)
  return data
}

export function trackPageView({ path, title, referrer }) {
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return
  if (!isTrackablePath(path)) return

  const canonicalPath = canonicalizeAnalyticsPath(path)
  const sessionId = getSessionId()
  const key = `sabot-analytics-last:${canonicalPath}`
  const last = Number(sessionStorage.getItem(key) || 0)
  if (Date.now() - last < 30_000) return
  sessionStorage.setItem(key, String(Date.now()))

  const params = new URLSearchParams(window.location.search)
  const navigation = getNavigationContext(canonicalPath, referrer)
  const payload = JSON.stringify({
    sessionId,
    path: canonicalPath,
    title,
    referrer: navigation.referrer,
    source: params.get('utm_source') || '',
    medium: params.get('utm_medium') || '',
    campaign: params.get('utm_campaign') || '',
  })
  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon('/api/analytics/collect', new Blob([payload], { type: 'application/json' }))
    if (sent) return
  }
  fetch('/api/analytics/collect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {})
}

function getSessionId() {
  const key = 'sabot-analytics-session-v1'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
  }
  return id
}

function getNavigationContext(path, externalReferrer) {
  const key = 'sabot-analytics-navigation-v1'
  const day = new Date().toISOString().slice(0, 10)
  let previous = null
  try { previous = JSON.parse(sessionStorage.getItem(key) || 'null') } catch { previous = null }

  const referrer = previous?.day === day && previous?.path
    ? `${window.location.origin}${previous.path}`
    : externalReferrer

  sessionStorage.setItem(key, JSON.stringify({ day, path }))
  return { referrer }
}

function isTrackablePath(path) {
  return !/^\/(?:admin|wp-admin|login|logout|printlab|audiolab|api|native-|posts|post-new|add-new|media|settings|tools|users|pages|customize|site-editor|analytics|audit-log|qa|review)(?:\/|$)/.test(String(path || ''))
}
