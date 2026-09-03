import { getBoundDb, databaseUnavailable } from './_lib/database.js'
import { resolvePublicSitePermission, permissionHasCapability } from './_lib/publicSiteAuth.js'
import { upsertMediaAsset } from './_lib/mediaAssets.js'
import { writeAuditLog, inferActorFromRequest } from './_lib/auditLog.js'
import {
  ABERDEEN_1312_GALLERY,
  ensureGalleryTables,
  getGallery,
  legacyMediaId,
  legacyStorageKey,
  sanitizeLegacyFilename,
  upsertGallery,
  upsertGalleryItem,
} from './_lib/galleries.js'

const BATCH_SIZE = 5
const MAX_REMOTE_IMAGE_BYTES = 25 * 1024 * 1024
const MEDIA_BINDING_NAMES = ['SABOT_MEDIA_BUCKET', 'MEDIA_BUCKET', 'ASSETS_BUCKET', 'SABOT_AUDIO_BUCKET', 'AUDIO_MEDIA_BUCKET']
const LEGACY_HOST = 'sabotmedia.noblogs.org'

export async function onRequestGet(context) {
  const permission = await resolvePublicSitePermission(context)
  if (!permissionHasCapability(permission, 'media:write')) {
    return htmlPage({ error: 'Media write permission is required to run this migration.' }, 403)
  }
  const db = getBoundDb(context)
  if (!db) return htmlPage({ error: 'BF_DB is unavailable.' }, 503)
  const storage = getMediaBucket(context.env || {})
  const gallery = await getGallery(db, ABERDEEN_1312_GALLERY.slug)
  return htmlPage({ gallery, storageBinding: storage?.name || '' })
}

export async function onRequestPost(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permissionHasCapability(permission, 'media:write')) {
      return json({ ok: false, error: 'media:write permission required' }, 403)
    }
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('gallery migration')
    const storage = getMediaBucket(context.env || {})
    if (!storage?.bucket) return json({ ok: false, error: 'R2 media storage binding SABOT_MEDIA_BUCKET is required.' }, 503)

    await ensureGalleryTables(db)
    await upsertGallery(db, {
      ...ABERDEEN_1312_GALLERY,
      description: 'Historical Aberdeen Local 1312 image archive migrated from the original SabotPress Noblogs site.',
      expectedItemCount: ABERDEEN_1312_GALLERY.attachmentIds.length,
    })

    const existing = await getGallery(db, ABERDEEN_1312_GALLERY.slug)
    const donePositions = new Set((existing?.items || []).filter((item) => item.url).map((item) => item.position))
    const pending = ABERDEEN_1312_GALLERY.attachmentIds
      .map((attachmentId, position) => ({ attachmentId, position }))
      .filter((item) => !donePositions.has(item.position))
      .slice(0, BATCH_SIZE)

    if (!pending.length) {
      return json({ ok: true, complete: true, imported: existing?.items?.length || 0, expected: ABERDEEN_1312_GALLERY.attachmentIds.length })
    }

    let fallbackUrls = null
    const imported = []
    const errors = []
    for (const item of pending) {
      try {
        let source = await fetchWordPressMedia(item.attachmentId)
        if (!source?.url) {
          if (!fallbackUrls) fallbackUrls = await fetchLegacyGalleryImageUrls()
          const fallbackUrl = fallbackUrls[item.position] || ''
          if (!fallbackUrl) throw new Error(`Could not resolve source image for WordPress attachment ${item.attachmentId}`)
          source = {
            url: fallbackUrl,
            title: filenameFromUrl(fallbackUrl).replace(/\.[^.]+$/, ''),
            altText: '', caption: '', mimeType: guessImageMime(fallbackUrl),
          }
        }
        assertAllowedLegacyUrl(source.url)
        const remote = await fetch(source.url, { redirect: 'follow', headers: { 'user-agent': 'SabotPress historical media migration' } })
        if (!remote.ok) throw new Error(`Source image returned HTTP ${remote.status}`)
        const contentLength = Number(remote.headers.get('content-length') || 0)
        if (contentLength > MAX_REMOTE_IMAGE_BYTES) throw new Error('Source image exceeds migration size limit')
        const bytes = await remote.arrayBuffer()
        if (!bytes.byteLength) throw new Error('Source image is empty')
        if (bytes.byteLength > MAX_REMOTE_IMAGE_BYTES) throw new Error('Source image exceeds migration size limit')

        const filename = sanitizeLegacyFilename(filenameFromUrl(source.url) || `attachment-${item.attachmentId}.png`)
        const mimeType = normalizeImageMime(remote.headers.get('content-type') || source.mimeType || guessImageMime(filename))
        if (!mimeType.startsWith('image/')) throw new Error(`Remote file is not an image (${mimeType})`)
        const mediaId = legacyMediaId(item.attachmentId)
        const storageKey = legacyStorageKey(item.attachmentId, filename)
        await storage.bucket.put(storageKey, bytes, {
          httpMetadata: { contentType: mimeType, cacheControl: 'public, max-age=31536000, immutable' },
          customMetadata: {
            mediaId,
            source: 'legacy-noblogs-gallery',
            sourceAttachmentId: String(item.attachmentId),
            sourceUrl: source.url,
            filename,
          },
        })
        const publicUrl = makePublicMediaUrl(context.request.url, storageKey, filename)
        const saved = await upsertMediaAsset(db, {
          id: mediaId,
          title: source.title || filename.replace(/\.[^.]+$/, ''),
          url: publicUrl,
          downloadUrl: publicUrl,
          altText: source.altText || '',
          caption: source.caption || '',
          description: `Migrated from WordPress attachment ${item.attachmentId} in the Aberdeen Local 1312 Gallery.`,
          creator: 'SabotPress',
          sourceUrl: source.url,
          folder: 'Images',
          tags: ['AL1312', 'gallery', 'legacy-import'],
          mediaType: 'image',
          mimeType,
          filename,
          size: bytes.byteLength,
          extension: filename.split('.').pop()?.toLowerCase() || '',
          storageKey,
          source: 'legacy-noblogs-gallery',
        })
        await upsertGalleryItem(db, {
          gallerySlug: ABERDEEN_1312_GALLERY.slug,
          position: item.position,
          mediaId: saved.id,
          sourceAttachmentId: item.attachmentId,
          sourceUrl: source.url,
        })
        imported.push({ position: item.position, attachmentId: item.attachmentId, mediaId: saved.id, filename })
      } catch (error) {
        errors.push({ attachmentId: item.attachmentId, position: item.position, error: String(error?.message || error) })
      }
    }

    const gallery = await getGallery(db, ABERDEEN_1312_GALLERY.slug)
    await writeAuditLog(db, {
      action: 'gallery.legacy_migration.batch',
      entityType: 'gallery',
      entityId: ABERDEEN_1312_GALLERY.slug,
      actor: inferActorFromRequest(context.request),
      detail: { imported: imported.length, errors, complete: gallery?.complete || false, storageBinding: storage.name },
    })
    return json({
      ok: errors.length === 0,
      complete: Boolean(gallery?.complete),
      importedThisBatch: imported,
      errors,
      imported: gallery?.items?.filter((item) => item.url).length || 0,
      expected: ABERDEEN_1312_GALLERY.attachmentIds.length,
      publicUrl: '/aberdeen-local-1312-gallery/',
    }, errors.length ? 207 : 200)
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

async function fetchWordPressMedia(attachmentId) {
  try {
    const url = `https://${LEGACY_HOST}/wp-json/wp/v2/media/${encodeURIComponent(attachmentId)}`
    const response = await fetch(url, { redirect: 'follow', headers: { accept: 'application/json', 'user-agent': 'SabotPress historical media migration' } })
    if (!response.ok) return null
    const data = await response.json()
    const sourceUrl = String(data?.source_url || '').trim()
    if (!sourceUrl) return null
    assertAllowedLegacyUrl(sourceUrl)
    return {
      url: sourceUrl,
      title: stripHtml(data?.title?.rendered || ''),
      altText: stripHtml(data?.alt_text || ''),
      caption: stripHtml(data?.caption?.rendered || ''),
      mimeType: String(data?.mime_type || ''),
    }
  } catch {
    return null
  }
}

export function extractLegacyGalleryImageUrls(html) {
  const urls = []
  const seen = new Set()
  const imgTags = String(html || '').match(/<img\b[^>]*>/gi) || []
  for (const tag of imgTags) {
    const src = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2] || ''
    const decoded = decodeHtml(src)
    if (!decoded.includes(`${LEGACY_HOST}/files/2023/06/`)) continue
    try {
      const url = new URL(decoded)
      if (url.hostname.toLowerCase() !== LEGACY_HOST) continue
      if (seen.has(url.href)) continue
      seen.add(url.href)
      urls.push(url.href)
    } catch { /* ignore malformed legacy markup */ }
  }
  return urls
}

async function fetchLegacyGalleryImageUrls() {
  const response = await fetch(ABERDEEN_1312_GALLERY.sourceUrl, { redirect: 'follow', headers: { 'user-agent': 'SabotPress historical media migration' } })
  if (!response.ok) throw new Error(`Legacy gallery page returned HTTP ${response.status}`)
  const urls = extractLegacyGalleryImageUrls(await response.text())
  if (urls.length < ABERDEEN_1312_GALLERY.attachmentIds.length) {
    throw new Error(`Legacy gallery exposed ${urls.length} full-size images; expected ${ABERDEEN_1312_GALLERY.attachmentIds.length}`)
  }
  return urls.slice(0, ABERDEEN_1312_GALLERY.attachmentIds.length)
}

function assertAllowedLegacyUrl(value) {
  const url = new URL(String(value || ''))
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== LEGACY_HOST || !url.pathname.startsWith('/files/')) {
    throw new Error('Refusing unexpected remote media URL')
  }
}

function getMediaBucket(env) {
  for (const name of MEDIA_BINDING_NAMES) if (env?.[name]) return { name, bucket: env[name] }
  return null
}

function makePublicMediaUrl(requestUrl, storageKey, filename) {
  const url = new URL(requestUrl)
  url.pathname = '/api/media/files'
  url.search = ''
  url.searchParams.set('key', storageKey)
  url.searchParams.set('filename', filename)
  return url.toString()
}

function filenameFromUrl(value) {
  try { return decodeURIComponent(new URL(value).pathname.split('/').pop() || '') } catch { return '' }
}
function normalizeImageMime(value) {
  const mime = String(value || '').split(';')[0].trim().toLowerCase()
  return mime === 'image/jpg' ? 'image/jpeg' : mime
}
function guessImageMime(value) {
  const lower = String(value || '').toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'image/png'
}
function stripHtml(value) {
  return decodeHtml(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}
function decodeHtml(value) {
  return String(value || '').replace(/&amp;/g, '&').replace(/&#038;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
}

function htmlPage({ gallery = null, storageBinding = '', error = '' }, status = 200) {
  const imported = gallery?.items?.filter((item) => item.url).length || 0
  const expected = ABERDEEN_1312_GALLERY.attachmentIds.length
  const complete = Boolean(gallery?.complete)
  const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Example Project Gallery Migration</title><style>
body{font:16px/1.5 system-ui,sans-serif;max-width:850px;margin:40px auto;padding:0 20px;background:#f5f5f2;color:#171717}main{background:#fff;border:1px solid #ccc;padding:28px}button,a.button{display:inline-block;border:1px solid #111;background:#111;color:#fff;padding:10px 14px;text-decoration:none;cursor:pointer}code{background:#eee;padding:2px 5px}.error{color:#9c1c1c}.ok{color:#176b34}progress{width:100%;height:22px}</style></head><body><main>
<h1>Aberdeen Local 1312 Gallery Migration</h1><p>Source: <a href="${ABERDEEN_1312_GALLERY.sourceUrl}">${ABERDEEN_1312_GALLERY.sourceUrl}</a></p>
${error ? `<p class="error"><strong>${escapeHtml(error)}</strong></p>` : ''}
<p>R2 binding: <code>${escapeHtml(storageBinding || 'missing')}</code></p><p><strong id="count">${imported} / ${expected}</strong> images registered.</p>
<progress id="progress" max="${expected}" value="${imported}"></progress>
<p id="status" class="${complete ? 'ok' : ''}">${complete ? 'Migration complete.' : 'Ready to import or resume. Images are copied in small, retry-safe batches.'}</p>
${!error && !complete ? '<button id="run" type="button">Migrate / resume gallery</button>' : ''}
${complete ? '<p><a class="button" href="/aberdeen-local-1312-gallery/">Open public gallery</a></p>' : ''}
<p><a href="/wp-admin/media">Back to Media Library</a></p>
<script>const run=document.getElementById('run');if(run){run.addEventListener('click',async()=>{run.disabled=true;const status=document.getElementById('status');const count=document.getElementById('count');const progress=document.getElementById('progress');status.textContent='Migrating…';for(let i=0;i<30;i++){try{const r=await fetch('/api/gallery-migration',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const data=await r.json();count.textContent=data.imported+' / '+data.expected;progress.value=data.imported;if(data.errors?.length){status.textContent='Stopped on an image error: '+data.errors.map(e=>e.attachmentId+': '+e.error).join('; ');run.disabled=false;return}if(data.complete){status.textContent='Migration complete. Reloading…';location.reload();return}status.textContent='Migrating… '+data.imported+' / '+data.expected;}catch(e){status.textContent='Migration request failed: '+e.message;run.disabled=false;return}}status.textContent='Migration paused after safety limit. Click again to resume.';run.disabled=false;});}</script>
</main></body></html>`
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])) }
function json(data, status = 200) { return new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }) }
