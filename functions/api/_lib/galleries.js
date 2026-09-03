import { ensureMediaAssetsTable } from './mediaAssets.js'

export const ABERDEEN_1312_GALLERY = Object.freeze({
  slug: 'aberdeen-local-1312',
  title: 'Aberdeen Local 1312 Gallery',
  sourceUrl: 'https://sabotmedia.noblogs.org/aberdeen-local-1312-gallery/',
  attachmentIds: Object.freeze([
    1571,1572,1573,1574,1575,1576,1577,1578,1579,1580,1581,1582,1583,1584,1585,1586,1587,1588,1589,1590,
    1591,1592,1593,1594,1595,1596,1597,1598,1599,1600,1601,1602,1603,1605,1606,1608,1609,1610,1611,1615,
    1616,1617,1618,1619,1620,1621,1622,1623,1625,1626,1627,1628,1629,1630,1631,1632,1634,1635,1636,1637,
    1638,1639,1612,1613,1640,1641,1642,1643,1644,1645,1646,1647,1648,1649,1650,1651,
  ]),
})

export async function ensureGalleryTables(db) {
  await ensureMediaAssetsTable(db)
  await db.prepare(`CREATE TABLE IF NOT EXISTS galleries (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    expected_item_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run()
  await db.prepare(`CREATE TABLE IF NOT EXISTS gallery_items (
    gallery_slug TEXT NOT NULL,
    position INTEGER NOT NULL,
    media_id TEXT NOT NULL,
    source_attachment_id TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (gallery_slug, position)
  )`).run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_gallery_items_media_id ON gallery_items(media_id)').run()
}

export async function upsertGallery(db, gallery) {
  await ensureGalleryTables(db)
  const now = new Date().toISOString()
  await db.prepare(`INSERT INTO galleries (slug, title, description, source_url, expected_item_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET title = excluded.title, description = excluded.description,
      source_url = excluded.source_url, expected_item_count = excluded.expected_item_count, updated_at = excluded.updated_at`)
    .bind(gallery.slug, gallery.title, gallery.description || '', gallery.sourceUrl || '', Number(gallery.expectedItemCount || 0), now, now)
    .run()
  return getGallery(db, gallery.slug)
}

export async function upsertGalleryItem(db, item) {
  await ensureGalleryTables(db)
  await db.prepare(`INSERT INTO gallery_items (gallery_slug, position, media_id, source_attachment_id, source_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(gallery_slug, position) DO UPDATE SET media_id = excluded.media_id,
      source_attachment_id = excluded.source_attachment_id, source_url = excluded.source_url`)
    .bind(item.gallerySlug, Number(item.position), item.mediaId, String(item.sourceAttachmentId || ''), item.sourceUrl || '', new Date().toISOString())
    .run()
}

export async function getGallery(db, slug) {
  await ensureGalleryTables(db)
  const gallery = await db.prepare(`SELECT slug, title, description, source_url, expected_item_count, created_at, updated_at
    FROM galleries WHERE slug = ?`).bind(slug).first()
  if (!gallery) return null
  const rows = await db.prepare(`SELECT gi.position, gi.media_id, gi.source_attachment_id, gi.source_url,
      m.title, m.url, m.alt_text, m.caption, m.media_type, m.metadata_json
    FROM gallery_items gi
    LEFT JOIN media_assets m ON m.id = gi.media_id
    WHERE gi.gallery_slug = ? ORDER BY gi.position ASC`).bind(slug).all()
  const items = (rows?.results || []).map((row) => {
    let metadata = {}
    try { metadata = JSON.parse(row.metadata_json || '{}') || {} } catch { metadata = {} }
    return {
      position: Number(row.position || 0),
      mediaId: row.media_id,
      sourceAttachmentId: row.source_attachment_id,
      sourceUrl: row.source_url,
      title: row.title || metadata.filename || '',
      url: row.url || '',
      altText: row.alt_text || '',
      caption: row.caption || '',
      mediaType: row.media_type || 'image',
      filename: metadata.filename || '',
      size: Number(metadata.size || 0),
    }
  })
  return {
    slug: gallery.slug,
    title: gallery.title,
    description: gallery.description,
    sourceUrl: gallery.source_url,
    expectedItemCount: Number(gallery.expected_item_count || 0),
    createdAt: gallery.created_at,
    updatedAt: gallery.updated_at,
    items,
    complete: Number(gallery.expected_item_count || 0) > 0 && items.filter((item) => item.url).length >= Number(gallery.expected_item_count || 0),
  }
}

export function legacyMediaId(attachmentId) {
  return `legacy-wp-${String(attachmentId)}`
}

export function sanitizeLegacyFilename(value) {
  const raw = String(value || 'image').split(/[\\/]/).pop()
  return (raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'image').slice(0, 180)
}

export function legacyStorageKey(attachmentId, filename) {
  return `media/uploads/images/legacy-noblogs-${String(attachmentId)}-${sanitizeLegacyFilename(filename)}`
}
