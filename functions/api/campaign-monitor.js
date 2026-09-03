import { getBoundDb } from './_lib/database.js'
import { getCampaign } from './_lib/campaigns.js'

const STATUS_PAGE_URL = 'https://kuma.accol.li/status/aimonitor'

export async function onRequestGet(context) {
  let statusPageUrl = STATUS_PAGE_URL
  try {
    const requestedSlug = new URL(context.request.url).searchParams.get('campaign') || 'example-campaign'
    if (requestedSlug !== 'example-campaign') {
      const db = getBoundDb(context)
      if (!db) throw new Error('campaign data unavailable')
      const campaign = await getCampaign(db, requestedSlug)
      if (!campaign || campaign.status !== 'published' || !campaign.monitorUrl) throw new Error('campaign monitor not configured')
      if (!campaign.automation?.enabled) {
        return json({ ok: false, disabled: true, source: '', checkedAt: null, overall: 'unknown', monitors: [] }, 200, 'public, max-age=60, s-maxage=120')
      }
      statusPageUrl = validateStatusPageUrl(campaign.monitorUrl)
    }
    const statusUrl = new URL(statusPageUrl)
    const pageSlug = statusUrl.pathname.match(/\/status\/([a-z0-9_-]+)\/?$/i)?.[1]
    if (!pageSlug) throw new Error('monitor URL must be an Uptime Kuma public status page')
    const statusApiUrl = new URL(`/api/status-page/${pageSlug}`, statusUrl.origin)
    const heartbeatApiUrl = new URL(`/api/status-page/heartbeat/${pageSlug}`, statusUrl.origin)
    const [page, heartbeat] = await Promise.all([
      fetchJson(statusApiUrl),
      fetchJson(heartbeatApiUrl),
    ])

    const groups = Array.isArray(page?.publicGroupList) ? page.publicGroupList : []
    const heartbeatList = heartbeat?.heartbeatList && typeof heartbeat.heartbeatList === 'object' ? heartbeat.heartbeatList : {}
    const uptimeList = heartbeat?.uptimeList && typeof heartbeat.uptimeList === 'object' ? heartbeat.uptimeList : {}

    const monitors = []
    for (const group of groups) {
      for (const monitor of Array.isArray(group?.monitorList) ? group.monitorList : []) {
        const id = String(monitor?.id ?? '')
        if (!id) continue
        const beats = Array.isArray(heartbeatList[id]) ? heartbeatList[id] : []
        const latest = beats.length ? beats[beats.length - 1] : null
        const statusCode = Number(latest?.status)
        monitors.push({
          id,
          group: String(group?.name || ''),
          name: String(monitor?.name || `Monitor ${id}`),
          type: String(monitor?.type || ''),
          statusCode: Number.isFinite(statusCode) ? statusCode : null,
          status: statusLabel(statusCode),
          message: String(latest?.msg || ''),
          ping: Number.isFinite(Number(latest?.ping)) ? Number(latest.ping) : null,
          lastCheckedAt: String(latest?.time || ''),
          uptime24h: resolveUptime24h(uptimeList, id),
        })
      }
    }

    const overall = aggregateStatus(monitors)
    return json({
      ok: true,
      source: statusPageUrl,
      checkedAt: new Date().toISOString(),
      overall,
      title: String(page?.config?.title || page?.config?.name || 'Infrastructure monitor'),
      description: String(page?.config?.description || ''),
      monitors,
    }, 200, 'public, max-age=45, s-maxage=60, stale-while-revalidate=120')
  } catch (error) {
    return json({
      ok: false,
      source: statusPageUrl,
      checkedAt: new Date().toISOString(),
      overall: 'unknown',
      monitors: [],
      error: String(error?.message || error),
    }, 502, 'public, max-age=15, s-maxage=15')
  }
}

function validateStatusPageUrl(value) {
  const url = new URL(String(value || ''))
  if (url.protocol !== 'https:') throw new Error('monitor URL must use HTTPS')
  if (/^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i.test(url.hostname)) throw new Error('monitor host is not public')
  return url.toString()
}

async function fetchJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6500)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': 'SabotMedia-CampaignMonitor/1.0',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`monitor endpoint returned ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

export function aggregateStatus(monitors) {
  if (!monitors.length) return 'unknown'
  const codes = monitors.map((monitor) => monitor.statusCode)
  if (codes.every((code) => code === 1)) return 'operational'
  const maintenance = codes.filter((code) => code === 3).length
  const down = codes.filter((code) => code === 0).length
  const uncertain = codes.filter((code) => code === 2 || code == null).length
  if (maintenance === codes.length) return 'maintenance'
  const coreDown = monitors.some((monitor) => monitor.statusCode === 0 && /(?:noblogs|mail|smtp|imap|webmail|vpn|dns)/i.test(`${monitor.group} ${monitor.name}`))
  if (coreDown || down > codes.length / 2) return 'major-outage'
  if (down || uncertain || maintenance) return 'partial-outage'
  return 'unknown'
}

function statusLabel(code) {
  if (code === 1) return 'operational'
  if (code === 0) return 'down'
  if (code === 2) return 'pending'
  if (code === 3) return 'maintenance'
  return 'unknown'
}

function resolveUptime24h(uptimeList, id) {
  const candidates = [`${id}_24`, `${id}_24h`, `${id}_1d`]
  for (const key of candidates) {
    const value = Number(uptimeList[key])
    if (Number.isFinite(value)) return Math.max(0, Math.min(1, value))
  }
  return null
}

function json(data, status = 200, cacheControl = 'no-store') {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
      'access-control-allow-origin': '*',
    },
  })
}
