import { isBrowserLocalRuntime } from './runtime'
import {
  localDelete,
  localDeleteBlob,
  localGet,
  localList,
  localPutBlob,
  localSet,
} from './browserLocalDb'

const DEFAULT_SETUP = {
  firstRunComplete: false,
  preset: 'simple',
  modules: ['articles'],
  identity: { name: 'SabotPress', description: '', logoUrl: '', primaryEditor: '' },
}

const DEFAULT_PUBLIC_CONFIG = { text: {}, styles: {}, blocks: {} }

let installed = false
let originalFetch = null

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function makeId(prefix = 'item') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function slugify(value = '') {
  return String(value || '').toLowerCase().trim().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || makeId('post')
}

async function readJsonBody(input, init = {}) {
  if (init.body && typeof init.body === 'string') return JSON.parse(init.body || '{}')
  if (typeof Request !== 'undefined' && input instanceof Request) {
    try { return await input.clone().json() } catch { return {} }
  }
  return {}
}

async function readFormBody(input, init = {}) {
  if (init.body instanceof FormData) return init.body
  if (typeof Request !== 'undefined' && input instanceof Request) {
    try { return await input.clone().formData() } catch { return new FormData() }
  }
  return new FormData()
}

function requestMethod(input, init = {}) {
  return String(init.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase()
}

async function handleNativeContent(url, input, init) {
  const method = requestMethod(input, init)
  if (method === 'OPTIONS') return json({ ok: true, canEdit: true, mode: 'browser-local' })
  if (method === 'GET') {
    let items = await localList('native:')
    const id = url.searchParams.get('id')
    const slug = url.searchParams.get('slug')
    const type = url.searchParams.get('type')
    const status = url.searchParams.get('status')
    if (id) items = items.filter((item) => String(item.id) === id)
    if (slug) items = items.filter((item) => String(item.slug) === slug)
    if (type) items = items.filter((item) => String(item.type || item.contentType || 'article') === type)
    if (status) items = items.filter((item) => String(item.status || 'draft') === status)
    items.sort((a, b) => new Date(b.updatedAt || b.publishedAt || 0) - new Date(a.updatedAt || a.publishedAt || 0))
    return json({ ok: true, items, mode: 'browser-local' })
  }
  if (method === 'POST' || method === 'PUT') {
    const body = await readJsonBody(input, init)
    const incoming = body.item || body.entry || body
    const now = new Date().toISOString()
    const item = {
      ...incoming,
      id: String(incoming.id || makeId('native')),
      slug: String(incoming.slug || slugify(incoming.title || incoming.id)),
      type: String(incoming.type || incoming.contentType || 'article'),
      status: String(incoming.status || 'draft'),
      createdAt: String(incoming.createdAt || now),
      updatedAt: now,
    }
    await localSet(`native:${item.id}`, item)
    const revision = {
      id: makeId('revision'),
      nativeContentId: item.id,
      snapshot: item,
      revisionNote: String(body.revisionNote || 'save'),
      createdAt: now,
    }
    await localSet(`revision:${item.id}:${revision.id}`, revision)
    return json({ ok: true, item, saved: true, mode: 'browser-local' })
  }
  if (method === 'DELETE') {
    const key = url.searchParams.get('id') || url.searchParams.get('slug') || ''
    const items = await localList('native:')
    const match = items.find((item) => String(item.id) === key || String(item.slug) === key)
    if (match) await localDelete(`native:${match.id}`)
    return json({ ok: true, removed: Boolean(match), mode: 'browser-local' })
  }
  return json({ ok: false, error: 'Unsupported local content operation.' }, 405)
}

async function handleNativeRevisions(url, input, init) {
  const method = requestMethod(input, init)
  if (method === 'GET') {
    const nativeId = url.searchParams.get('nativeId') || url.searchParams.get('contentId') || ''
    const prefix = nativeId ? `revision:${nativeId}:` : 'revision:'
    const items = await localList(prefix)
    items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    return json({ ok: true, items, mode: 'browser-local' })
  }
  if (method === 'POST') {
    const body = await readJsonBody(input, init)
    const revisions = await localList('revision:')
    const revision = revisions.find((item) => String(item.id) === String(body.revisionId || ''))
    if (!revision?.snapshot?.id) return json({ ok: false, error: 'Revision not found.' }, 404)
    const item = { ...revision.snapshot, updatedAt: new Date().toISOString() }
    await localSet(`native:${item.id}`, item)
    return json({ ok: true, item, mode: 'browser-local' })
  }
  return json({ ok: false, error: 'Unsupported revision operation.' }, 405)
}

async function handleSimpleCollection(namespace, url, input, init, bodyField = 'item') {
  const method = requestMethod(input, init)
  const prefix = `${namespace}:`
  if (method === 'GET') {
    let items = await localList(prefix)
    const id = url.searchParams.get('id')
    const slug = url.searchParams.get('slug')
    if (id) items = items.filter((item) => String(item.id) === id)
    if (slug) items = items.filter((item) => String(item.slug) === slug)
    return json({ ok: true, items, item: (id || slug) ? items[0] || null : undefined, mode: 'browser-local' })
  }
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const body = await readJsonBody(input, init)
    const incoming = body[bodyField] || body.item || body.publication || body.asset || body
    const now = new Date().toISOString()
    const item = { ...incoming, id: String(incoming.id || makeId(namespace)), updatedAt: now, createdAt: String(incoming.createdAt || now) }
    if ('title' in item && !item.slug) item.slug = slugify(item.title)
    await localSet(`${prefix}${item.id}`, item)
    return json({ ok: true, item, [bodyField]: item, saved: true, mode: 'browser-local' })
  }
  if (method === 'DELETE') {
    const body = await readJsonBody(input, init).catch(() => ({}))
    const id = url.searchParams.get('id') || body.id || ''
    if (id) await localDelete(`${prefix}${id}`)
    return json({ ok: true, removed: Boolean(id), mode: 'browser-local' })
  }
  return json({ ok: false, error: `Unsupported ${namespace} operation.` }, 405)
}

async function handlePublishingSetup(input, init) {
  const method = requestMethod(input, init)
  if (method === 'GET') return json({ ok: true, setup: (await localGet('config:publishing-setup')) || DEFAULT_SETUP, mode: 'browser-local' })
  if (method === 'PUT' || method === 'POST') {
    const body = await readJsonBody(input, init)
    const setup = body.setup || body
    await localSet('config:publishing-setup', setup)
    return json({ ok: true, setup, saved: true, mode: 'browser-local' })
  }
  return json({ ok: false, error: 'Unsupported setup operation.' }, 405)
}

async function handlePublicConfig(input, init) {
  const method = requestMethod(input, init)
  if (method === 'OPTIONS') return json({ ok: true, canEdit: true, mode: 'browser-local' })
  if (method === 'GET') {
    const config = (await localGet('config:public-site')) || DEFAULT_PUBLIC_CONFIG
    return json({ ok: true, config, payload: config, mode: 'browser-local' })
  }
  if (method === 'PUT' || method === 'POST') {
    const body = await readJsonBody(input, init)
    const config = body.config || body.payload || body
    await localSet('config:public-site', config)
    return json({ ok: true, config, payload: config, saved: true, mode: 'browser-local' })
  }
  return json({ ok: false, error: 'Unsupported site configuration operation.' }, 405)
}

function inferMediaType(file) {
  const type = String(file?.type || '')
  if (type.startsWith('image/')) return type === 'image/svg+xml' ? 'svg' : 'image'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  if (type === 'application/pdf') return 'pdf'
  return 'file'
}

async function saveMediaFile(file, form = new FormData(), role = '') {
  if (!(file instanceof Blob)) throw new Error('No media file supplied.')
  const id = makeId('media')
  const filename = String(form.get('filename') || file.name || 'upload')
  const mimeType = String(form.get('mimeType') || file.type || 'application/octet-stream')
  const now = new Date().toISOString()
  const asset = {
    id,
    url: `./__local_media/${encodeURIComponent(id)}`,
    publicUrl: `./__local_media/${encodeURIComponent(id)}`,
    downloadUrl: `./__local_media/${encodeURIComponent(id)}?download=1`,
    filename,
    title: String(form.get('title') || filename.replace(/\.[^.]+$/, '') || 'Media'),
    mimeType,
    mediaType: inferMediaType(file),
    source: 'browser-local',
    storageKey: id,
    size: Number(file.size || 0),
    role: role || String(form.get('role') || ''),
    uploadedAt: now,
    createdAt: now,
    updatedAt: now,
  }
  await localPutBlob(id, file, { filename, mimeType, title: asset.title })
  await localSet(`media:${id}`, asset)
  return asset
}

async function handleMediaFiles(input, init, audioLab = false) {
  const method = requestMethod(input, init)
  if (method !== 'POST') return json({ ok: false, error: 'Local media endpoint only accepts uploads.' }, 405)
  const form = await readFormBody(input, init)
  const file = form.get('file')
  try {
    const media = await saveMediaFile(file, form, audioLab ? String(form.get('role') || 'master') : '')
    return json({ ok: true, media, mode: 'browser-local' })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 400)
  }
}

async function handleMediaAssets(url, input, init) {
  const method = requestMethod(input, init)
  if (method === 'GET') return json({ ok: true, items: await localList('media:'), mode: 'browser-local' })
  if (method === 'POST' || method === 'PUT') {
    const body = await readJsonBody(input, init)
    const incoming = body.asset || body.item || body
    const now = new Date().toISOString()
    const asset = { ...incoming, id: String(incoming.id || makeId('media')), updatedAt: now, createdAt: String(incoming.createdAt || now) }
    await localSet(`media:${asset.id}`, asset)
    return json({ ok: true, asset, item: asset, saved: true, mode: 'browser-local' })
  }
  if (method === 'DELETE') {
    const id = url.searchParams.get('id') || ''
    const asset = id ? await localGet(`media:${id}`) : null
    if (id) {
      await localDelete(`media:${id}`)
      if (asset?.storageKey) await localDeleteBlob(asset.storageKey)
    }
    return json({ ok: true, removed: Boolean(id), mode: 'browser-local' })
  }
  return json({ ok: false, error: 'Unsupported media operation.' }, 405)
}

async function handlePodcastSettings(url, input, init) {
  const method = requestMethod(input, init)
  const state = (await localGet('config:podcast-shows')) || { shows: [], defaultShowId: '' }
  if (method === 'GET') {
    const requested = url.searchParams.get('show') || ''
    const show = requested ? state.shows.find((item) => item.id === requested || item.slug === requested) : state.shows.find((item) => item.id === state.defaultShowId) || state.shows[0]
    return json({ ok: true, shows: state.shows, defaultShowId: state.defaultShowId, show: show || null, settings: show || {}, mode: 'browser-local' })
  }
  if (method === 'POST' || method === 'PUT') {
    const body = await readJsonBody(input, init)
    const settings = { ...(body.settings || {}), id: String(body.showId || body.settings?.id || makeId('podcast')) }
    if (!settings.slug) settings.slug = slugify(settings.podcastTitle || settings.title || settings.id)
    const shows = state.shows.some((item) => item.id === settings.id) ? state.shows.map((item) => item.id === settings.id ? settings : item) : [settings, ...state.shows]
    const next = { shows, defaultShowId: state.defaultShowId || settings.id }
    await localSet('config:podcast-shows', next)
    return json({ ok: true, shows, defaultShowId: next.defaultShowId, show: settings, settings, saved: true, mode: 'browser-local' })
  }
  return json({ ok: false, error: 'Unsupported podcast settings operation.' }, 405)
}

async function handleCampaigns(url, input, init) {
  const method = requestMethod(input, init)
  if (method === 'GET') {
    let items = await localList('campaign:')
    const slug = url.searchParams.get('slug')
    if (slug) items = items.filter((item) => String(item.slug) === slug)
    return json({ ok: true, items, item: slug ? items[0] || null : undefined, mode: 'browser-local' })
  }
  if (method === 'POST' || method === 'PUT') {
    const body = await readJsonBody(input, init)
    const incoming = body.item || body
    const now = new Date().toISOString()
    const item = { ...incoming, id: String(incoming.id || makeId('campaign')), slug: String(incoming.slug || slugify(incoming.title || incoming.name)), updatedAt: now, createdAt: String(incoming.createdAt || now) }
    await localSet(`campaign:${item.id}`, item)
    const revision = { id: makeId('campaign-revision'), campaignId: item.id, snapshot: item, revisionNote: String(body.revisionNote || 'save'), createdAt: now }
    await localSet(`campaign-revision:${item.id}:${revision.id}`, revision)
    return json({ ok: true, item, saved: true, mode: 'browser-local' })
  }
  if (method === 'DELETE') {
    const body = await readJsonBody(input, init).catch(() => ({}))
    const id = String(body.id || url.searchParams.get('id') || '')
    if (id) await localDelete(`campaign:${id}`)
    return json({ ok: true, removed: Boolean(id), mode: 'browser-local' })
  }
  return json({ ok: false, error: 'Unsupported campaign operation.' }, 405)
}

async function handleCampaignRevisions(url, input, init) {
  const method = requestMethod(input, init)
  if (method === 'GET') {
    const campaignId = url.searchParams.get('campaignId') || ''
    const items = await localList(campaignId ? `campaign-revision:${campaignId}:` : 'campaign-revision:')
    items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    return json({ ok: true, items, mode: 'browser-local' })
  }
  if (method === 'POST') {
    const body = await readJsonBody(input, init)
    const revisions = await localList('campaign-revision:')
    const revision = revisions.find((item) => String(item.id) === String(body.revisionId || ''))
    if (!revision?.snapshot?.id) return json({ ok: false, error: 'Campaign revision not found.' }, 404)
    const item = { ...revision.snapshot, updatedAt: new Date().toISOString() }
    await localSet(`campaign:${item.id}`, item)
    return json({ ok: true, item, mode: 'browser-local' })
  }
  return json({ ok: false, error: 'Unsupported campaign revision operation.' }, 405)
}

async function handleTranslations(url, input, init) {
  const method = requestMethod(input, init)
  if (method === 'GET') {
    const contentId = url.searchParams.get('contentId') || ''
    const slug = url.searchParams.get('slug') || ''
    let items = await localList('translation:')
    if (contentId) items = items.filter((item) => String(item.contentId) === contentId)
    if (slug) items = items.filter((item) => String(item.slug || item.contentSlug) === slug)
    if (url.searchParams.get('format') === 'weblate-source') return json({ ok: true, bundle: { schemaVersion: 1, contentId, slug, translations: items }, mode: 'browser-local' })
    return json({ ok: true, items, translations: items, mode: 'browser-local' })
  }
  if (method === 'POST' || method === 'PUT') {
    const body = await readJsonBody(input, init)
    const incoming = body.translation || body
    const id = String(incoming.id || `${incoming.contentId || incoming.slug || 'content'}:${incoming.languageCode || incoming.language || 'und'}`)
    const translation = { ...incoming, id, updatedAt: new Date().toISOString() }
    await localSet(`translation:${id}`, translation)
    return json({ ok: true, translation, saved: true, mode: 'browser-local' })
  }
  if (method === 'DELETE') {
    const contentId = url.searchParams.get('contentId') || ''
    const languageCode = url.searchParams.get('languageCode') || ''
    const items = await localList('translation:')
    const match = items.find((item) => String(item.contentId) === contentId && String(item.languageCode || item.language) === languageCode)
    if (match) await localDelete(`translation:${match.id}`)
    return json({ ok: true, removed: Boolean(match), mode: 'browser-local' })
  }
  return json({ ok: false, error: 'Unsupported translation operation.' }, 405)
}

async function handleLocalApi(url, input, init) {
  const path = url.pathname
  if (path === '/api/session') return json({ authenticated: true, role: 'owner', capabilities: ['*'], user: { id: 'browser-local-owner', displayName: 'Local owner' }, mode: 'browser-local' })
  if (path === '/api/login') return json({ authenticated: true, role: 'owner', capabilities: ['*'], mode: 'browser-local' })
  if (path === '/api/logout') return json({ ok: true, localSession: true, mode: 'browser-local' })
  if (path === '/api/publishing-setup') return handlePublishingSetup(input, init)
  if (path === '/api/public-site-config') return handlePublicConfig(input, init)
  if (path === '/api/native-content') return handleNativeContent(url, input, init)
  if (path === '/api/native-content-revisions') return handleNativeRevisions(url, input, init)
  if (path === '/api/media-assets') return handleMediaAssets(url, input, init)
  if (path === '/api/media/files') return handleMediaFiles(input, init, false)
  if (path === '/api/audiolab/media') return handleMediaFiles(input, init, true)
  if (path === '/api/collections') return handleSimpleCollection('collection', url, input, init)
  if (path === '/api/publications') return handleSimpleCollection('publication', url, input, init, 'publication')
  if (path === '/api/podcast-settings') return handlePodcastSettings(url, input, init)
  if (path === '/api/campaigns') return handleCampaigns(url, input, init)
  if (path === '/api/campaign-revisions') return handleCampaignRevisions(url, input, init)
  if (path === '/api/native-translations') return handleTranslations(url, input, init)
  if (path === '/api/feed-settings') {
    const method = requestMethod(input, init)
    if (method === 'GET') return json({ ok: true, settings: (await localGet('config:feed-settings')) || {}, mode: 'browser-local' })
    const body = await readJsonBody(input, init); const settings = body.settings || body; await localSet('config:feed-settings', settings); return json({ ok: true, settings, saved: true, mode: 'browser-local' })
  }
  if (path === '/api/taxonomy') return handleSimpleCollection('taxonomy', url, input, init)
  if (path === '/api/site-health') return json({ ok: true, mode: 'browser-local', status: 'local', checks: [{ id: 'storage', status: 'ok', label: 'Browser-local storage ready' }] })
  if (path === '/api/backup-status') return json({ ok: true, mode: 'browser-local', status: 'manual', message: 'Export a portable SabotPress backup from Publish Online.' })
  if (path === '/api/deployment-status') return json({ ok: true, provider: 'browser-local', public: false, mode: 'browser-local' })
  if (path.startsWith('/api/analytics')) return json({ ok: true, mode: 'browser-local', disabled: true, items: [], report: {} })
  if (path === '/api/weblate-sync') return json({ ok: false, error: 'Weblate sync requires a server-connected SabotPress instance.', mode: 'browser-local' }, 409)
  if (path.startsWith('/api/campaign-coverage')) return json({ ok: true, items: [], page: 1, total: 0, mode: 'browser-local' })
  if (path.startsWith('/api/campaign-monitor')) return json({ ok: true, items: [], mode: 'browser-local', automation: false })
  return json({ ok: false, mode: 'browser-local', error: 'This tool needs a server-connected SabotPress instance. Your local publication data was not uploaded.' }, 501)
}

export function installBrowserLocalApi() {
  if (installed || !isBrowserLocalRuntime() || typeof window === 'undefined' || typeof window.fetch !== 'function') return false
  installed = true
  originalFetch = window.fetch.bind(window)
  window.fetch = async function browserLocalFetch(input, init = {}) {
    let rawUrl = ''
    if (typeof input === 'string') rawUrl = input
    else if (input instanceof URL) rawUrl = input.toString()
    else if (typeof Request !== 'undefined' && input instanceof Request) rawUrl = input.url
    const url = new URL(rawUrl || '/', window.location.origin)
    if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) return handleLocalApi(url, input, init)
    return originalFetch(input, init)
  }
  return true
}

export function getOriginalFetch() { return originalFetch }
