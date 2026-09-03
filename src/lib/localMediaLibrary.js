const STORAGE_KEY = 'sabot.wpClone.localMedia.v1'
const METADATA_STORAGE_KEY = 'sabot.wpClone.localMedia.meta.v1'
const MAX_LOCAL_IMAGE_EDGE = 1800
const JPEG_QUALITY = 0.84

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function extensionFromFilename(filename = '') {
  return String(filename || '').split('.').pop()?.toLowerCase() || ''
}

function inferMediaType({ mimeType = '', extension = '', mediaType = '' } = {}) {
  const explicit = String(mediaType || '').toLowerCase()
  if (explicit && explicit !== 'media') return explicit
  const type = String(mimeType || '').toLowerCase()
  const ext = String(extension || '').toLowerCase()
  if (type.startsWith('image/')) return type.includes('svg') ? 'svg' : 'image'
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  if (type.includes('zip') || ['zip', 'epub'].includes(ext)) return ext === 'epub' ? 'epub' : 'archive'
  if (type.startsWith('text/') || ['txt', 'md', 'markdown', 'csv'].includes(ext)) return 'text'
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'document'
  return 'file'
}

function labelForMediaType(mediaType = '', extension = '') {
  const type = String(mediaType || '').toLowerCase()
  if (type === 'pdf') return 'PDF'
  if (type === 'epub') return 'EPUB'
  if (type === 'archive') return 'ZIP'
  if (type === 'text') return 'TEXT'
  if (type === 'document') return 'DOC'
  if (type === 'audio') return 'AUDIO'
  if (type === 'video') return 'VIDEO'
  if (type === 'svg') return 'SVG'
  if (type === 'image') return 'IMAGE'
  return String(extension || 'FILE').toUpperCase()
}

function normalizeMediaItem(item) {
  if (!item || !item.id) return null
  const url = String(item.url || item.dataUrl || item.downloadUrl || '').trim()
  if (!url) return null
  const filename = String(item.filename || '')
  const extension = String(item.extension || extensionFromFilename(filename) || '').toLowerCase()
  const mimeType = String(item.mimeType || '')
  const mediaType = inferMediaType({ mimeType, extension, mediaType: item.mediaType })
  const title = String(item.title || filename.replace(/\.[^.]+$/, '') || 'Uploaded media')
  const isImage = mediaType === 'image' || mediaType === 'svg'
  return {
    id: String(item.id),
    url,
    dataUrl: String(item.dataUrl || url),
    filename,
    title,
    alt: String(item.alt || ''),
    caption: String(item.caption || ''),
    description: String(item.description || ''),
    folder: String(item.folder || (mediaType === 'pdf' ? 'Zines / PDFs' : mediaType === 'file' ? 'Files' : 'Unfiled')),
    tags: Array.isArray(item.tags) ? item.tags.map((tag) => String(tag || '').trim()).filter(Boolean) : String(item.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean),
    uploadedAt: String(item.uploadedAt || item.createdAt || new Date().toISOString()),
    source: String(item.source || 'local-upload'),
    mimeType,
    extension,
    thumbnailUrl: isImage ? String(item.thumbnailUrl || item.thumbUrl || url) : String(item.thumbnailUrl || item.thumbUrl || ''),
    fullUrl: String(item.fullUrl || url),
    previewUrl: isImage ? String(item.previewUrl || item.thumbnailUrl || url) : String(item.previewUrl || ''),
    downloadUrl: String(item.downloadUrl || item.fullUrl || url),
    creator: String(item.creator || ''),
    license: String(item.license || ''),
    licenseUrl: String(item.licenseUrl || ''),
    attribution: String(item.attribution || ''),
    attributionText: String(item.attributionText || item.attribution || ''),
    mediaType,
    mediaTypeLabel: String(item.mediaTypeLabel || labelForMediaType(mediaType, extension)),
    category: String(item.category || ''),
    landingUrl: String(item.landingUrl || item.landingPageUrl || ''),
    landingPageUrl: String(item.landingPageUrl || item.landingUrl || ''),
    sourceLabel: String(item.sourceLabel || item.source || ''),
    originalProvider: String(item.originalProvider || item.source || ''),
    originalId: String(item.originalId || item.id || ''),
    size: Number(item.size || item.sizeBytes || 0) || 0,
  }
}

function toMediaMetadataKey(input) {
  if (!input) return ''
  if (typeof input === 'string') return input.trim()
  const url = String(input.url || input.dataUrl || input.downloadUrl || '').trim()
  if (url) return url
  return String(input.id || '').trim()
}

function normalizeMediaMetadata(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const next = {}
  for (const [key, value] of Object.entries(raw)) {
    const cleanKey = toMediaMetadataKey(key)
    if (!cleanKey || !value || typeof value !== 'object') continue
    next[cleanKey] = {
      title: String(value.title || ''),
      alt: String(value.alt || ''),
      caption: String(value.caption || ''),
      description: String(value.description || ''),
      folder: String(value.folder || 'Unfiled'),
      tags: Array.isArray(value.tags) ? value.tags.map((tag) => String(tag || '').trim()).filter(Boolean) : String(value.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean),
    }
  }
  return next
}

export function loadLocalMediaItems() {
  if (!canUseStorage()) return []
  const raw = window.localStorage.getItem(STORAGE_KEY)
  const parsed = safeJson(raw || '[]', [])
  if (!Array.isArray(parsed)) return []
  return parsed.map(normalizeMediaItem).filter(Boolean)
}

export function loadLocalMediaMetadata() {
  if (!canUseStorage()) return {}
  const raw = window.localStorage.getItem(METADATA_STORAGE_KEY)
  return normalizeMediaMetadata(safeJson(raw || '{}', {}))
}

function saveLocalMediaMetadata(metadata) {
  if (!canUseStorage()) return
  const normalized = normalizeMediaMetadata(metadata)
  window.localStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(normalized))
}

function trySaveLocalMediaItems(normalized) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function saveLocalMediaItems(items) {
  if (!canUseStorage()) return []
  const normalized = Array.isArray(items) ? items.map(normalizeMediaItem).filter(Boolean) : []
  try {
    return trySaveLocalMediaItems(normalized)
  } catch (error) {
    // Data URLs are absurdly expensive in localStorage. Keep the newest upload
    // rather than failing the whole media picker like a sulky appliance.
    const localFirst = normalized.filter((item) => item.source === 'local-upload')
    const serverFirst = normalized.filter((item) => item.source === 'server-upload')
    const imported = normalized.filter((item) => item.source !== 'local-upload' && item.source !== 'server-upload')
    const fallback = [...serverFirst.slice(0, 80), ...localFirst.slice(0, 1), ...imported.slice(0, 30)]
    try {
      return trySaveLocalMediaItems(fallback)
    } catch {
      console.warn('Unable to persist local media library item.', error)
      return loadLocalMediaItems()
    }
  }
}

export function addLocalMediaItem(item) {
  const normalized = normalizeMediaItem(item)
  if (!normalized) return loadLocalMediaItems()
  const existing = loadLocalMediaItems()
  const next = [normalized, ...existing.filter((entry) => entry.id !== normalized.id)]
  return saveLocalMediaItems(next)
}

export function updateLocalMediaItem(id, fields) {
  if (!id) return []
  const existing = loadLocalMediaItems()
  const next = existing.map((item) => {
    if (item.id !== id) return item
    return normalizeMediaItem({ ...item, ...fields, id: item.id, source: item.source || 'local-upload' })
  }).filter(Boolean)
  return saveLocalMediaItems(next)
}

export function updateLocalMediaMetadata(itemOrKey, fields) {
  const key = toMediaMetadataKey(itemOrKey)
  if (!key) return loadLocalMediaMetadata()
  const updates = {
    title: String(fields?.title || ''),
    alt: String(fields?.alt || ''),
    caption: String(fields?.caption || ''),
    description: String(fields?.description || ''),
    folder: String(fields?.folder || 'Unfiled'),
    tags: Array.isArray(fields?.tags) ? fields.tags.map((tag) => String(tag || '').trim()).filter(Boolean) : String(fields?.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean),
  }
  const existing = loadLocalMediaMetadata()
  const next = { ...existing, [key]: updates }
  saveLocalMediaMetadata(next)
  return next
}

export function applyLocalMediaMetadata(item) {
  const key = toMediaMetadataKey(item)
  if (!key) return item
  const metadata = loadLocalMediaMetadata()
  const saved = metadata[key]
  if (!saved) return item
  return {
    ...item,
    title: String(saved.title || item.title || ''),
    alt: String(saved.alt || item.alt || ''),
    caption: String(saved.caption || item.caption || ''),
    description: String(saved.description || item.description || ''),
    folder: String(saved.folder || item.folder || 'Unfiled'),
    tags: Array.isArray(saved.tags) ? saved.tags : (Array.isArray(item.tags) ? item.tags : []),
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read file'))
    reader.readAsDataURL(file)
  })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to process resized image'))
    reader.readAsDataURL(blob)
  })
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to decode image'))
    image.src = dataUrl
  })
}

async function canvasToDataUrl(canvas, mimeType = 'image/jpeg', quality = JPEG_QUALITY) {
  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality))
    if (blob) return blobToDataUrl(blob)
  }
  return canvas.toDataURL(mimeType, quality)
}

async function resizeRasterImage(file) {
  const original = await readFileAsDataUrl(file)
  if (typeof document === 'undefined') return original
  const image = await loadImage(original)
  const width = Number(image.naturalWidth || image.width || 0)
  const height = Number(image.naturalHeight || image.height || 0)
  if (!width || !height) return original

  const scale = Math.min(1, MAX_LOCAL_IMAGE_EDGE / Math.max(width, height))
  const nextWidth = Math.max(1, Math.round(width * scale))
  const nextHeight = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = nextWidth
  canvas.height = nextHeight
  const context = canvas.getContext('2d')
  if (!context) return original
  context.drawImage(image, 0, 0, nextWidth, nextHeight)

  const preferredMime = /image\/(?:jpeg|jpg|webp)/i.test(file.type || '') ? file.type : 'image/jpeg'
  const resized = await canvasToDataUrl(canvas, preferredMime, JPEG_QUALITY)
  return resized.length < original.length ? resized : original
}

export async function fileToDataUrl(file) {
  const type = String(file?.type || '').toLowerCase()
  if (!type.startsWith('image/')) return readFileAsDataUrl(file)
  if (type.includes('svg') || type.includes('gif')) return readFileAsDataUrl(file)
  try {
    return await resizeRasterImage(file)
  } catch {
    return readFileAsDataUrl(file)
  }
}

export function mediaTypeFromFile(file) {
  const filename = String(file?.name || 'upload')
  const extension = extensionFromFilename(filename) || 'file'
  return inferMediaType({ mimeType: file?.type || '', extension })
}

export function makeLocalMediaFromFile(file) {
  const filename = String(file?.name || 'upload')
  const name = filename.replace(/\.[^.]+$/, '')
  const ext = extensionFromFilename(filename) || 'file'
  const mediaType = mediaTypeFromFile(file)
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url: '',
    dataUrl: '',
    filename,
    title: name || 'Uploaded file',
    alt: '',
    caption: '',
    description: '',
    mimeType: file?.type || '',
    extension: ext,
    source: 'local-upload',
    uploadedAt: new Date().toISOString(),
    mediaType,
    mediaTypeLabel: labelForMediaType(mediaType, ext),
    folder: mediaType === 'pdf' ? 'Zines / PDFs' : mediaType === 'image' || mediaType === 'svg' ? 'Unfiled' : 'Files',
    size: Number(file?.size || 0) || 0,
  }
}
