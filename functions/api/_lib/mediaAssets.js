const MEDIA_TYPES = ['image', 'svg', 'audio', 'video', 'pdf', 'document', 'archive', 'epub', 'text', 'file']

export function createMediaId() {
  return `media-${Math.random().toString(36).slice(2, 10)}`
}

export function normalizeMediaAsset(input) {
  const raw = input || {}
  const metadata = parseMetadata(raw.metadataJson || raw.metadata_json || raw.metadata)
  const merged = { ...metadata, ...raw }
  const now = new Date().toISOString()
  const url = String(merged.url || merged.publicUrl || merged.downloadUrl || '').trim()
  const filename = String(merged.filename || '')
  const mimeType = String(merged.mimeType || merged.mime_type || '')
  const mediaType = normalizeMediaType(merged.mediaType || merged.media_type, mimeType, filename)
  const tags = normalizeTags(merged.tags)
  const altText = String(merged.altText || merged.alt_text || merged.alt || '')
  const sourceUrl = String(merged.sourceUrl || merged.source_url || merged.landingUrl || merged.landingPageUrl || '')
  const attribution = String(merged.attribution || merged.attributionText || merged.credit || '')

  return {
    id: String(merged.id || createMediaId()),
    title: String(merged.title || filename.replace(/\.[^.]+$/, '') || 'Untitled media'),
    url,
    downloadUrl: String(merged.downloadUrl || merged.download_url || url),
    altText,
    alt: altText,
    caption: String(merged.caption || ''),
    description: String(merged.description || ''),
    credit: String(merged.credit || attribution),
    attribution,
    creator: String(merged.creator || ''),
    license: String(merged.license || ''),
    licenseUrl: String(merged.licenseUrl || merged.license_url || ''),
    sourceUrl,
    folder: String(merged.folder || defaultFolder(mediaType)),
    tags,
    mediaType,
    mimeType,
    filename,
    size: Math.max(0, Number(merged.size || merged.sizeBytes || merged.size_bytes || 0) || 0),
    extension: String(merged.extension || extensionFromFilename(filename) || ''),
    storageKey: String(merged.storageKey || merged.storage_key || ''),
    source: String(merged.source || 'registry'),
    createdAt: String(merged.createdAt || merged.created_at || now),
    updatedAt: String(merged.updatedAt || merged.updated_at || now),
  }
}

export async function ensureMediaAssetsTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    alt_text TEXT NOT NULL DEFAULT '',
    caption TEXT NOT NULL DEFAULT '',
    credit TEXT NOT NULL DEFAULT '',
    media_type TEXT NOT NULL DEFAULT 'image',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run()

  const columns = await db.prepare('PRAGMA table_info(media_assets)').all()
  const names = new Set((columns?.results || []).map((row) => String(row.name || '')))
  if (!names.has('metadata_json')) {
    await db.prepare("ALTER TABLE media_assets ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'").run()
  }

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_media_assets_updated_at ON media_assets(updated_at DESC)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_media_assets_media_type ON media_assets(media_type)').run()
}

export async function listMediaAssets(db, options = {}) {
  await ensureMediaAssetsTable(db)
  const clauses = []
  const binds = []
  if (options.mediaType) {
    clauses.push('media_type = ?')
    binds.push(options.mediaType)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const stmt = db.prepare(`SELECT id, title, url, alt_text, caption, credit, media_type, metadata_json, created_at, updated_at
    FROM media_assets ${where} ORDER BY datetime(updated_at) DESC`)
  const result = binds.length ? await stmt.bind(...binds).all() : await stmt.all()
  const rows = Array.isArray(result?.results) ? result.results : []
  return rows.map(rowToMediaAsset)
}

export async function upsertMediaAsset(db, asset) {
  await ensureMediaAssetsTable(db)
  const normalized = normalizeMediaAsset({ ...asset, updatedAt: new Date().toISOString() })
  if (!normalized.url) throw new Error('media asset URL is required')
  await db.prepare(`INSERT INTO media_assets (id, title, url, alt_text, caption, credit, media_type, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      url = excluded.url,
      alt_text = excluded.alt_text,
      caption = excluded.caption,
      credit = excluded.credit,
      media_type = excluded.media_type,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at`)
    .bind(
      normalized.id,
      normalized.title,
      normalized.url,
      normalized.altText,
      normalized.caption,
      normalized.credit,
      normalized.mediaType,
      JSON.stringify(toExtendedMetadata(normalized)),
      normalized.createdAt,
      normalized.updatedAt
    )
    .run()
  return normalized
}

export async function deleteMediaAsset(db, id) {
  await ensureMediaAssetsTable(db)
  await db.prepare('DELETE FROM media_assets WHERE id = ?').bind(id).run()
  return { ok: true, deleted: id }
}

function rowToMediaAsset(row) {
  return normalizeMediaAsset({
    ...parseMetadata(row.metadata_json),
    id: row.id,
    title: row.title,
    url: row.url,
    altText: row.alt_text,
    caption: row.caption,
    credit: row.credit,
    mediaType: row.media_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function toExtendedMetadata(asset) {
  return {
    downloadUrl: asset.downloadUrl,
    description: asset.description,
    attribution: asset.attribution,
    creator: asset.creator,
    license: asset.license,
    licenseUrl: asset.licenseUrl,
    sourceUrl: asset.sourceUrl,
    folder: asset.folder,
    tags: asset.tags,
    mimeType: asset.mimeType,
    filename: asset.filename,
    size: asset.size,
    extension: asset.extension,
    storageKey: asset.storageKey,
    source: asset.source,
  }
}

function parseMetadata(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(String(value || '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeTags(value) {
  if (Array.isArray(value)) return [...new Set(value.map((tag) => String(tag || '').trim()).filter(Boolean))]
  return [...new Set(String(value || '').split(',').map((tag) => tag.trim()).filter(Boolean))]
}

function normalizeMediaType(value, mimeType = '', filename = '') {
  const explicit = String(value || '').trim().toLowerCase()
  if (MEDIA_TYPES.includes(explicit)) return explicit
  const mime = String(mimeType || '').toLowerCase()
  const ext = extensionFromFilename(filename)
  if (mime.startsWith('image/')) return mime.includes('svg') ? 'svg' : 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mime.includes('epub') || ext === 'epub') return 'epub'
  if (mime.includes('zip') || ext === 'zip') return 'archive'
  if (mime.startsWith('text/') || ['txt', 'md', 'markdown', 'csv'].includes(ext)) return 'text'
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'document'
  return 'file'
}

function extensionFromFilename(filename = '') {
  const parts = String(filename || '').split('.')
  return parts.length > 1 ? String(parts.pop() || '').toLowerCase() : ''
}

function defaultFolder(mediaType) {
  if (['image', 'svg'].includes(mediaType)) return 'Images'
  if (mediaType === 'pdf') return 'Zines / PDFs'
  if (mediaType === 'audio') return 'Audio'
  if (mediaType === 'video') return 'Video'
  return 'Files'
}
