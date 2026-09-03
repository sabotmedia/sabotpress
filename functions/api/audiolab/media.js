import { resolvePublicSitePermission } from '../_lib/publicSiteAuth.js'

const MAX_AUDIO_UPLOAD_BYTES = 1024 * 1024 * 750
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/flac',
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

    const bucket = getAudioBucket(context)
    if (!bucket) {
      return json({ ok: false, error: 'Audio storage binding missing. Configure SABOT_AUDIO_BUCKET, AUDIO_MEDIA_BUCKET, or MEDIA_BUCKET as an R2 binding.' }, 503)
    }

    const form = await context.request.formData()
    const file = form.get('file') || form.get('audio')
    if (!file || typeof file.arrayBuffer !== 'function') return json({ ok: false, error: 'missing audio file' }, 400)

    const declaredMimeType = String(form.get('mimeType') || file.type || 'audio/wav').toLowerCase()
    const mimeType = normalizeAudioMimeType(declaredMimeType)
    if (!ALLOWED_AUDIO_TYPES.has(mimeType)) {
      return json({ ok: false, error: `unsupported audio MIME type: ${declaredMimeType || 'unknown'}` }, 415)
    }

    const size = Number(file.size || 0)
    if (!size) return json({ ok: false, error: 'audio file is empty' }, 400)
    if (size > MAX_AUDIO_UPLOAD_BYTES) return json({ ok: false, error: 'audio file is too large for this upload endpoint' }, 413)

    const projectId = sanitizeSegment(form.get('projectId') || 'project')
    const mediaId = createId('audiolab-media')
    const role = normalizeRole(form.get('role') || 'master')
    const filename = sanitizeFilename(form.get('filename') || file.name || `${mediaId}.${extensionForMime(mimeType)}`)
    const duration = Number(form.get('duration') || 0)
    const title = String(form.get('title') || filename).slice(0, 240)
    const codec = String(form.get('codec') || '').slice(0, 80)
    const bitrateKbps = Number(form.get('bitrateKbps') || 0)
    const sourceMediaId = String(form.get('sourceMediaId') || '').slice(0, 160)
    const storageKey = `audio/audiolab/${projectId}/${role}/${mediaId}-${filename}`
    const bytes = await file.arrayBuffer()
    const createdAt = new Date().toISOString()

    await bucket.put(storageKey, bytes, {
      httpMetadata: { contentType: mimeType, cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: {
        mediaId,
        projectId,
        role,
        source: 'audiolab-render',
        title,
        duration: String(duration || ''),
        codec,
        bitrateKbps: String(bitrateKbps || ''),
        sourceMediaId,
        createdAt,
      },
    })

    const publicUrl = makePublicMediaUrl(context.request.url, storageKey, filename)
    return json({
      ok: true,
      media: {
        id: mediaId,
        mediaId,
        projectId,
        role,
        filename,
        mimeType,
        size,
        duration,
        publicUrl,
        storageKey,
        codec,
        bitrateKbps,
        sourceMediaId,
        createdAt,
        source: 'audiolab-render',
      },
    })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

export async function onRequestGet(context) {
  try {
    const bucket = getAudioBucket(context)
    if (!bucket) return text('Audio storage binding missing', 503)

    const url = new URL(context.request.url)
    const storageKey = String(url.searchParams.get('key') || '').trim()
    if (!storageKey || storageKey.includes('..') || !storageKey.startsWith('audio/audiolab/')) {
      return text('missing or invalid audio key', 400)
    }

    const head = await bucket.head(storageKey)
    if (!head) return text('audio not found', 404)

    const contentType = head.httpMetadata?.contentType || head.customMetadata?.contentType || guessContentType(storageKey)
    const size = Number(head.size || 0)
    const rangeHeader = context.request.headers.get('range') || ''
    const range = parseRange(rangeHeader, size)
    const object = range ? await bucket.get(storageKey, { range: { offset: range.start, length: range.end - range.start + 1 } }) : await bucket.get(storageKey)
    if (!object?.body) return text('audio not found', 404)

    const headers = new Headers()
    headers.set('content-type', contentType)
    headers.set('accept-ranges', 'bytes')
    headers.set('cache-control', 'public, max-age=31536000, immutable')
    headers.set('content-disposition', `inline; filename="${sanitizeFilename(url.searchParams.get('filename') || storageKey.split('/').pop() || 'audio.wav')}"`)

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

function getAudioBucket(context) {
  return context?.env?.SABOT_AUDIO_BUCKET || context?.env?.AUDIO_MEDIA_BUCKET || context?.env?.MEDIA_BUCKET || context?.env?.ASSETS_BUCKET || null
}

function makePublicMediaUrl(requestUrl, storageKey, filename) {
  const url = new URL(requestUrl)
  url.pathname = '/api/audiolab/media'
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
  return String(value || 'item').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'item'
}

function sanitizeFilename(value) {
  const cleaned = String(value || 'audio.wav').split(/[\\/]/).pop().trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return (cleaned || 'audio.wav').slice(0, 160)
}

function normalizeAudioMimeType(value) {
  const type = String(value || '').split(';')[0].trim().toLowerCase()
  if (type === 'audio/x-wav' || type === 'audio/wave') return 'audio/wav'
  return type || 'audio/wav'
}

function normalizeRole(value) {
  return String(value || '').toLowerCase() === 'delivery' ? 'delivery' : 'master'
}

function extensionForMime(mimeType = '') {
  const lower = String(mimeType).toLowerCase()
  if (lower.includes('webm')) return 'webm'
  if (lower.includes('ogg')) return 'ogg'
  if (lower.includes('mpeg')) return 'mp3'
  if (lower.includes('mp4') || lower.includes('aac')) return 'm4a'
  if (lower.includes('flac')) return 'flac'
  return 'wav'
}

function guessContentType(key = '') {
  const lower = String(key).toLowerCase()
  if (lower.endsWith('.webm')) return 'audio/webm'
  if (lower.endsWith('.ogg') || lower.endsWith('.oga')) return 'audio/ogg'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4'
  if (lower.endsWith('.flac')) return 'audio/flac'
  return 'audio/wav'
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
