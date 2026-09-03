import { resolvePublicSitePermission } from '../_lib/publicSiteAuth.js'
import { databaseUnavailable, getBoundDb } from '../_lib/database.js'
import { upsertMediaAsset } from '../_lib/mediaAssets.js'
import { writeAuditLog, inferActorFromRequest } from '../_lib/auditLog.js'

const MAX_FILE_UPLOAD_BYTES = 1024 * 1024 * 250
const CANONICAL_MEDIA_BINDING = 'SABOT_MEDIA_BUCKET'
const MEDIA_BINDING_NAMES = [CANONICAL_MEDIA_BINDING, 'MEDIA_BUCKET', 'ASSETS_BUCKET', 'SABOT_AUDIO_BUCKET', 'AUDIO_MEDIA_BUCKET']
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/epub+zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/flac',
  'video/mp4',
  'video/webm',
  'video/ogg',
])

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      allow: 'GET,POST,OPTIONS',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  })
}

export async function onRequestPost(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permission.canEdit) {
      return json({ ok: false, error: permission.reason || 'valid session required', canEdit: false }, 403)
    }

    const storage = getMediaBucket(context)
    if (!storage?.bucket) {
      return json({
        ok: false,
        error: `Media storage binding missing. Configure the R2 binding ${CANONICAL_MEDIA_BINDING}.`,
        requiredBinding: CANONICAL_MEDIA_BINDING,
      }, 503)
    }

    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('media upload registration')

    const form = await context.request.formData()
    const file = form.get('file') || form.get('media')
    if (!file || typeof file.arrayBuffer !== 'function') return json({ ok: false, error: 'missing media file' }, 400)

    const declaredMimeType = String(form.get('mimeType') || file.type || guessContentType(file.name || '')).toLowerCase()
    const mimeType = normalizeMimeType(declaredMimeType || guessContentType(file.name || ''))
    if (!isAllowedFileType(mimeType)) {
      return json({ ok: false, error: `unsupported media MIME type: ${declaredMimeType || 'unknown'}` }, 415)
    }

    const size = Number(file.size || 0)
    if (!size) return json({ ok: false, error: 'media file is empty' }, 400)
    if (size > MAX_FILE_UPLOAD_BYTES) return json({ ok: false, error: 'media file is too large for this upload endpoint' }, 413)

    const mediaId = createId('media')
    const filename = sanitizeFilename(form.get('filename') || file.name || `${mediaId}.${extensionForMime(mimeType)}`)
    const title = String(form.get('title') || filename.replace(/\.[^.]+$/, '') || filename).slice(0, 240)
    const mediaType = mediaTypeForMime(mimeType)
    const folder = sanitizeSegment(form.get('folder') || mediaType)
    const storageKey = `media/uploads/${folder}/${mediaId}-${filename}`
    const bytes = await file.arrayBuffer()
    const createdAt = new Date().toISOString()

    await storage.bucket.put(storageKey, bytes, {
      httpMetadata: {
        contentType: mimeType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        mediaId,
        source: 'sabot-media-upload',
        title,
        filename,
        mediaType,
        size: String(size),
        createdAt,
      },
    })

    const publicUrl = makePublicMediaUrl(context.request.url, storageKey, filename)
    let saved
    try {
      saved = await upsertMediaAsset(db, {
        id: mediaId,
        title,
        url: publicUrl,
        downloadUrl: publicUrl,
        mimeType,
        size,
        mediaType,
        extension: extensionForMime(mimeType, filename),
        filename,
        folder: folderLabel(mediaType),
        storageKey,
        source: 'server-upload',
        createdAt,
      })
      await writeAuditLog(db, {
        action: 'media.upload',
        entityType: 'media_asset',
        entityId: saved.id,
        actor: inferActorFromRequest(context.request),
        detail: {
          filename: saved.filename,
          mediaType: saved.mediaType,
          mimeType: saved.mimeType,
          size: saved.size,
          storageKey: saved.storageKey,
          storageBinding: storage.name,
        },
      })
    } catch (registrationError) {
      try { await storage.bucket.delete(storageKey) } catch { /* best-effort orphan cleanup */ }
      throw new Error(`Media registry write failed; uploaded object was rolled back. ${String(registrationError?.message || registrationError)}`)
    }

    return json({
      ok: true,
      media: {
        ...saved,
        publicUrl: saved.url,
        storageBinding: storage.name,
      },
    })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

export async function onRequestGet(context) {
  try {
    const storage = getMediaBucket(context)
    if (!storage?.bucket) return text(`Media storage binding ${CANONICAL_MEDIA_BINDING} missing`, 503)

    const url = new URL(context.request.url)
    const storageKey = String(url.searchParams.get('key') || '').trim()
    if (!storageKey || storageKey.includes('..') || !(storageKey.startsWith('media/uploads/') || storageKey.startsWith('media/campaign-contributors/') || storageKey.startsWith('media/campaign-instagram/'))) {
      return text('missing or invalid media key', 400)
    }

    const head = await storage.bucket.head(storageKey)
    if (!head) return text('media not found', 404)

    const contentType = head.httpMetadata?.contentType || head.customMetadata?.contentType || guessContentType(storageKey)
    const size = Number(head.size || 0)
    const rangeHeader = context.request.headers.get('range') || ''
    const range = parseRange(rangeHeader, size)
    const object = range
      ? await storage.bucket.get(storageKey, { range: { offset: range.start, length: range.end - range.start + 1 } })
      : await storage.bucket.get(storageKey)
    if (!object?.body) return text('media not found', 404)

    const headers = new Headers()
    headers.set('content-type', contentType)
    headers.set('accept-ranges', 'bytes')
    headers.set('cache-control', 'public, max-age=31536000, immutable')
    headers.set('content-disposition', `${shouldRenderInline(contentType) ? 'inline' : 'attachment'}; filename="${sanitizeFilename(url.searchParams.get('filename') || storageKey.split('/').pop() || 'download')}"`)

    if (range) {
      headers.set('content-range', `bytes ${range.start}-${range.end}/${size}`)
      headers.set('content-length', String(range.end - range.start + 1))
      return new Response(object.body, { status: 206, headers })
    }

    if (size) headers.set('content-length', String(size))
    return new Response(object.body, { status: 200, headers })
  } catch (error) {
    return text(String(error?.message || error), 500)
  }
}

export function detectMediaStorageBinding(env = {}) {
  for (const name of MEDIA_BINDING_NAMES) {
    if (env?.[name]) return name
  }
  return ''
}

function getMediaBucket(context) {
  const name = detectMediaStorageBinding(context?.env || {})
  return name ? { name, bucket: context.env[name] } : null
}

function makePublicMediaUrl(requestUrl, storageKey, filename) {
  const url = new URL(requestUrl)
  url.pathname = '/api/media/files'
  url.search = ''
  url.searchParams.set('key', storageKey)
  if (filename) url.searchParams.set('filename', filename)
  return url.toString()
}

function createId(prefix) {
  if (typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function sanitizeSegment(value) {
  return String(value || 'files').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'files'
}

function sanitizeFilename(value) {
  const cleaned = String(value || 'download').split(/[\\/]/).pop().trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return (cleaned || 'download').slice(0, 180)
}

function normalizeMimeType(value) {
  const type = String(value || '').split(';')[0].trim().toLowerCase()
  if (type === 'image/jpg') return 'image/jpeg'
  if (type === 'application/x-pdf') return 'application/pdf'
  if (type === 'text/x-markdown') return 'text/markdown'
  return type || 'application/octet-stream'
}

function isAllowedFileType(mimeType) {
  if (ALLOWED_FILE_TYPES.has(mimeType)) return true
  if (mimeType.startsWith('image/')) return true
  if (mimeType.startsWith('text/')) return true
  return false
}

function mediaTypeForMime(mimeType = '') {
  const type = String(mimeType).toLowerCase()
  if (type.startsWith('image/')) return type.includes('svg') ? 'svg' : 'image'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  if (type === 'application/pdf') return 'pdf'
  if (type.includes('epub')) return 'epub'
  if (type.includes('zip')) return 'archive'
  if (type.startsWith('text/')) return 'text'
  if (type.includes('word') || type.includes('document') || type.includes('rtf') || type.includes('opendocument')) return 'document'
  return 'file'
}

function folderLabel(mediaType) {
  if (['image', 'svg'].includes(mediaType)) return 'Images'
  if (mediaType === 'pdf') return 'Zines / PDFs'
  if (mediaType === 'audio') return 'Audio'
  if (mediaType === 'video') return 'Video'
  return 'Files'
}

function extensionForMime(mimeType = '', filename = '') {
  const parts = String(filename || '').split('.')
  const existing = parts.length > 1 ? String(parts.pop() || '').toLowerCase() : ''
  if (existing) return existing
  const lower = String(mimeType).toLowerCase()
  if (lower === 'application/pdf') return 'pdf'
  if (lower.includes('epub')) return 'epub'
  if (lower.includes('zip')) return 'zip'
  if (lower.includes('markdown')) return 'md'
  if (lower.includes('csv')) return 'csv'
  if (lower.startsWith('text/')) return 'txt'
  if (lower.includes('webp')) return 'webp'
  if (lower.includes('png')) return 'png'
  if (lower.includes('gif')) return 'gif'
  if (lower.includes('svg')) return 'svg'
  if (lower.includes('jpeg')) return 'jpg'
  if (lower.includes('mpeg')) return 'mp3'
  if (lower.includes('wav')) return 'wav'
  if (lower.includes('flac')) return 'flac'
  if (lower.includes('ogg')) return 'ogg'
  if (lower.includes('mp4')) return lower.startsWith('audio/') ? 'm4a' : 'mp4'
  if (lower.includes('webm')) return 'webm'
  if (lower.includes('wordprocessingml')) return 'docx'
  if (lower.includes('msword')) return 'doc'
  if (lower.includes('opendocument')) return 'odt'
  return 'file'
}

function guessContentType(key = '') {
  const lower = String(key).toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.zip')) return 'application/zip'
  if (lower.endsWith('.epub')) return 'application/epub+zip'
  if (lower.endsWith('.doc')) return 'application/msword'
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (lower.endsWith('.odt')) return 'application/vnd.oasis.opendocument.text'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown'
  if (lower.endsWith('.txt')) return 'text/plain'
  if (lower.endsWith('.csv')) return 'text/csv'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.m4a')) return 'audio/mp4'
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.flac')) return 'audio/flac'
  if (lower.endsWith('.ogg') || lower.endsWith('.oga')) return 'audio/ogg'
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.webm')) return 'video/webm'
  return 'application/octet-stream'
}

function shouldRenderInline(contentType = '') {
  return contentType === 'application/pdf' || contentType.startsWith('image/') || contentType.startsWith('audio/') || contentType.startsWith('video/') || contentType.startsWith('text/')
}

function parseRange(header = '', size = 0) {
  const match = String(header).match(/^bytes=(\d*)-(\d*)$/)
  if (!match || !size) return null
  let start = match[1] === '' ? 0 : Number(match[1])
  let end = match[2] === '' ? size - 1 : Number(match[2])
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  start = Math.max(0, Math.min(size - 1, start))
  end = Math.max(start, Math.min(size - 1, end))
  return { start, end }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

function text(body, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
