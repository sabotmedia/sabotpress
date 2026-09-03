export const SITE_STATUS_OPTIONS = ['connected', 'planned', 'needs DNS', 'disabled']

export const DEFAULT_SITE = {
  id: 'publication-default',
  name: 'Publication',
  domain: '',
  basePath: '/',
  status: 'planned',
  notes: '',
}

function normalizeBasePath(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed || trimmed === '/') return '/'
  const withoutSlashes = trimmed.replace(/^\/+|\/+$/g, '')
  return `/${withoutSlashes}`
}

function normalizeDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
}

export function normalizeSite(site = {}) {
  const status = SITE_STATUS_OPTIONS.includes(site.status) ? site.status : 'planned'
  return {
    id: String(site.id || `site-${crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10)}`),
    name: String(site.name || '').trim() || 'Untitled site',
    domain: normalizeDomain(site.domain),
    basePath: normalizeBasePath(site.basePath),
    status,
    notes: String(site.notes || '').trim(),
    createdAt: String(site.createdAt || ''),
    updatedAt: String(site.updatedAt || ''),
  }
}

export function createSiteDraft(fields = {}) {
  return normalizeSite({
    ...fields,
    id: `site-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`,
  })
}

export async function loadSites() {
  const response = await fetch('/api/sites', { credentials: 'same-origin', headers: { accept: 'application/json' } })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok || data.mode !== 'd1' || !Array.isArray(data.items)) throw new Error(data?.error || `site registry request failed: ${response.status}`)
  return data.items.map(normalizeSite)
}

export async function saveSite(site) {
  const item = normalizeSite(site)
  const response = await fetch('/api/sites', {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ item }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok || data.mode !== 'd1' || !data.item) throw new Error(data?.error || `site save failed: ${response.status}`)
  return normalizeSite(data.item)
}

export async function deleteSite(id) {
  const url = new URL('/api/sites', window.location.origin)
  url.searchParams.set('id', String(id || ''))
  const response = await fetch(url.pathname + url.search, { method: 'DELETE', credentials: 'same-origin', headers: { accept: 'application/json' } })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok || data.mode !== 'd1') throw new Error(data?.error || `site delete failed: ${response.status}`)
  return true
}
