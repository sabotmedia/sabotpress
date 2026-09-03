import { getBoundDb, databaseUnavailable } from './_lib/database.js'
import { contributorFromRequest } from './_lib/campaignCorrespondence.js'
import { upsertMediaAsset } from './_lib/mediaAssets.js'
import { writeAuditLog } from './_lib/auditLog.js'

const MAX_BYTES = 50 * 1024 * 1024
const CANONICAL_MEDIA_BINDING = 'SABOT_MEDIA_BUCKET'
const MEDIA_BINDING_NAMES = [CANONICAL_MEDIA_BINDING, 'MEDIA_BUCKET', 'ASSETS_BUCKET', 'SABOT_AUDIO_BUCKET', 'AUDIO_MEDIA_BUCKET']
const ALLOWED = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/aac',
  'video/webm', 'video/mp4', 'video/quicktime', 'video/ogg',
])

export async function onRequestPost(context) {
  try {
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('campaign contributor media')
    const contributor = await contributorFromRequest(db, context.request)
    if (!contributor?.permissions?.uploadMedia) return json({ ok: false, error: 'media permission required' }, 403)
    const storage = getMediaBucket(context.env)
    if (!storage) return json({ ok: false, error: `Media storage is not configured. Add the R2 binding ${CANONICAL_MEDIA_BINDING} in Cloudflare Pages.`, requiredBinding: CANONICAL_MEDIA_BINDING }, 503)
    const form = await context.request.formData()
    const file = form.get('file')
    if (!file || typeof file.arrayBuffer !== 'function') return json({ ok: false, error: 'choose an audio, video, or image file' }, 400)
    const declaredType = String(file.type || '').toLowerCase()
    const type = normalizeMimeType(declaredType, file.name || '')
    if (!ALLOWED.has(type)) return json({ ok: false, error: `Unsupported media type: ${declaredType || 'unknown'}. Upload a common image, audio, or video format.` }, 415)
    if (!file.size || file.size > MAX_BYTES) return json({ ok: false, error: 'file must be smaller than 50 MB' }, 413)
    const extension = extensionForMime(type, file.name || '')
    const mediaId = `media-${crypto.randomUUID()}`
    const filename = sanitizeFilename(file.name || `dispatch.${extension}`)
    const key = `media/campaign-contributors/${contributor.campaignId}/${mediaId}-${filename}`
    await storage.bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' }, customMetadata: { mediaId, contributorId: contributor.id, campaignId: contributor.campaignId, source: 'campaign-contributor' } })
    const url = new URL(context.request.url); url.pathname = '/api/media/files'; url.search = ''; url.searchParams.set('key', key)
    url.searchParams.set('filename', filename)
    const mediaType = type.startsWith('audio/') ? 'audio' : type.startsWith('video/') ? 'video' : 'image'
    try {
      await upsertMediaAsset(db, { id: mediaId, title: filename.replace(/\.[^.]+$/, ''), url: url.toString(), downloadUrl: url.toString(), mimeType: type, size: file.size, mediaType, extension, filename, folder: 'Campaign Dispatches', storageKey: key, source: 'campaign-contributor', createdAt: new Date().toISOString() })
      await writeAuditLog(db, { action: 'campaign_correspondence.media.upload', entityType: 'media_asset', entityId: mediaId, actor: `campaign-contributor:${contributor.id}`, detail: { campaignId: contributor.campaignId, size: file.size, mimeType: type, storageBinding: storage.name } })
    } catch (registrationError) {
      try { await storage.bucket.delete(key) } catch { /* best-effort orphan cleanup */ }
      throw new Error(`Media registry write failed; uploaded file was rolled back. ${String(registrationError?.message || registrationError)}`)
    }
    return json({ ok: true, mediaUrl: url.toString(), mediaType }, 201)
  } catch (error) { return json({ ok: false, error: String(error?.message || error) }, 500) }
}
function getMediaBucket(env = {}) { for (const name of MEDIA_BINDING_NAMES) if (env?.[name]) return { name, bucket: env[name] }; return null }
function sanitizeFilename(value) { return (String(value || 'dispatch').split(/[\\/]/).pop().trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'dispatch').slice(0, 180) }
function normalizeMimeType(value, filename = '') {
  const type = String(value || '').split(';')[0].trim().toLowerCase()
  if (type === 'image/jpg') return 'image/jpeg'
  if (type === 'audio/m4a') return 'audio/mp4'
  if (type) return type
  const extension = String(filename || '').split('.').pop().toLowerCase()
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', webm: 'video/webm', mp4: 'video/mp4', mov: 'video/quicktime', ogv: 'video/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', oga: 'audio/ogg', ogg: 'audio/ogg', wav: 'audio/wav', aac: 'audio/aac' })[extension] || ''
}
function extensionForMime(type, filename = '') {
  const existing = String(filename || '').split('.').pop().toLowerCase()
  if (/^[a-z0-9]{2,5}$/.test(existing) && filename.includes('.')) return existing
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac', 'video/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/ogg': 'ogv' })[type] || 'media'
}
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }) }
