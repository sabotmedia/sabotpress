const FORMAT = 'sabotpress-portable'
export const PORTABLE_BACKUP_VERSION = 1

async function jsonRequest(path, init = {}, fallback = null) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { accept: 'application/json', ...(init.headers || {}) }, ...init })
  const data = await response.json().catch(() => fallback)
  if (!response.ok || data?.ok === false) throw new Error(data?.error || `Backup request failed (${response.status})`)
  return data
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

function base64ToBlob(base64, type = 'application/octet-stream') {
  const binary = atob(String(base64 || ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

async function loadArray(path, field = 'items') {
  try {
    const data = await jsonRequest(path, {}, {})
    return Array.isArray(data?.[field]) ? data[field] : []
  } catch { return [] }
}

export async function createPortableBackup({ includeMedia = true } = {}) {
  const [setup, publicConfig, nativeContent, collections, publications, podcast, campaigns, translations, media, feedSettings] = await Promise.all([
    jsonRequest('/api/publishing-setup', {}, {}).then((d) => d.setup || {}),
    jsonRequest('/api/public-site-config', {}, {}).then((d) => d.config || d.payload || {}),
    loadArray('/api/native-content?includeFuture=1'),
    loadArray('/api/collections?includeDrafts=1'),
    loadArray('/api/publications?includeDrafts=1'),
    jsonRequest('/api/podcast-settings', {}, {}).then((d) => ({ shows: d.shows || [], defaultShowId: d.defaultShowId || '' })).catch(() => ({ shows: [], defaultShowId: '' })),
    loadArray('/api/campaigns?includeDrafts=1'),
    loadArray('/api/native-translations?includeUnpublished=1'),
    loadArray('/api/media-assets'),
    jsonRequest('/api/feed-settings', {}, {}).then((d) => d.settings || {}).catch(() => ({})),
  ])

  const mediaFiles = []
  if (includeMedia) {
    for (const asset of media) {
      const url = String(asset?.downloadUrl || asset?.url || '').trim()
      if (!url) continue
      try {
        const response = await fetch(url, { credentials: 'same-origin' })
        if (!response.ok) continue
        const blob = await response.blob()
        mediaFiles.push({
          id: String(asset.id || asset.storageKey || asset.filename || mediaFiles.length),
          filename: String(asset.filename || 'media'),
          mimeType: String(asset.mimeType || blob.type || 'application/octet-stream'),
          size: blob.size,
          dataBase64: await blobToBase64(blob),
          metadata: asset,
        })
      } catch { /* Keep metadata even when an external file cannot be embedded. */ }
    }
  }

  return {
    format: FORMAT,
    schemaVersion: PORTABLE_BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    data: { setup, publicConfig, nativeContent, collections, publications, podcast, campaigns, translations, media, feedSettings },
    mediaFiles,
  }
}

export function validatePortableBackup(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) throw new Error('Backup file must contain a SabotPress JSON object.')
  if (bundle.format !== FORMAT) throw new Error('This is not a SabotPress portable backup.')
  if (Number(bundle.schemaVersion) !== PORTABLE_BACKUP_VERSION) throw new Error(`Unsupported SabotPress backup version: ${bundle.schemaVersion}`)
  if (!bundle.data || typeof bundle.data !== 'object') throw new Error('Backup data is missing.')
  return bundle
}

export async function downloadPortableBackup() {
  const bundle = await createPortableBackup({ includeMedia: true })
  const blob = new Blob([JSON.stringify(bundle)], { type: 'application/vnd.sabotpress+json' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  anchor.href = href
  anchor.download = `sabotpress-backup-${date}.sabotpress`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(href), 2_000)
  try { window.localStorage.setItem('sabotpress-last-backup-at', new Date().toISOString()) } catch { /* reminder metadata only */ }
  window.dispatchEvent(new CustomEvent('sabotpress:backup-created'))
  return bundle
}

async function saveJson(path, payload, method = 'POST') {
  return jsonRequest(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }, {})
}

export async function importPortableBackup(rawBundle) {
  const bundle = validatePortableBackup(rawBundle)
  const data = bundle.data || {}
  const result = { imported: {}, warnings: [] }

  if (data.setup && Object.keys(data.setup).length) {
    await saveJson('/api/publishing-setup', { setup: data.setup }, 'PUT')
    result.imported.setup = 1
  }
  if (data.publicConfig && Object.keys(data.publicConfig).length) {
    await saveJson('/api/public-site-config', data.publicConfig, 'PUT')
    result.imported.publicConfig = 1
  }

  for (const item of data.nativeContent || []) await saveJson('/api/native-content', { item, revisionNote: 'portable import' })
  result.imported.nativeContent = (data.nativeContent || []).length
  for (const item of data.collections || []) await saveJson('/api/collections', { item })
  result.imported.collections = (data.collections || []).length
  for (const publication of data.publications || []) await saveJson('/api/publications', { publication })
  result.imported.publications = (data.publications || []).length
  for (const show of data.podcast?.shows || []) await saveJson('/api/podcast-settings', { showId: show.id || '', settings: show })
  result.imported.podcasts = (data.podcast?.shows || []).length
  for (const item of data.campaigns || []) await saveJson('/api/campaigns', { item, revisionNote: 'portable import' })
  result.imported.campaigns = (data.campaigns || []).length
  for (const translation of data.translations || []) await saveJson('/api/native-translations', translation)
  result.imported.translations = (data.translations || []).length
  if (data.feedSettings && Object.keys(data.feedSettings).length) await saveJson('/api/feed-settings', { settings: data.feedSettings })

  let mediaCount = 0
  for (const file of bundle.mediaFiles || []) {
    if (!file?.dataBase64) continue
    const blob = base64ToBlob(file.dataBase64, file.mimeType)
    const form = new FormData()
    form.append('file', blob, file.filename || 'media')
    form.append('filename', file.filename || 'media')
    form.append('mimeType', file.mimeType || blob.type)
    form.append('title', file.metadata?.title || String(file.filename || 'media').replace(/\.[^.]+$/, ''))
    const response = await fetch('/api/media/files', { method: 'POST', credentials: 'same-origin', body: form })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok) result.warnings.push(`${file.filename || 'media'}: ${payload?.error || 'could not import'}`)
    else mediaCount += 1
  }
  result.imported.mediaFiles = mediaCount
  window.dispatchEvent(new CustomEvent('sabotpress:portable-imported', { detail: result }))
  return result
}

export async function importPortableBackupFile(file) {
  const text = await file.text()
  return importPortableBackup(JSON.parse(text))
}
