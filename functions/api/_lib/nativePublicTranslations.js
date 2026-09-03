const TRANSLATION_STATUSES = ['draft', 'in_review', 'approved', 'published', 'archived']

export async function ensureNativePublicTranslationsTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS native_public_content_translations (
      id TEXT PRIMARY KEY,
      native_content_id TEXT NOT NULL,
      language_code TEXT NOT NULL,
      language_label TEXT NOT NULL DEFAULT '',
      translation_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      provider TEXT NOT NULL DEFAULT 'manual',
      translator_credit TEXT NOT NULL DEFAULT '',
      reviewer_credit TEXT NOT NULL DEFAULT '',
      external_url TEXT NOT NULL DEFAULT '',
      weblate_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT,
      published_at TEXT,
      UNIQUE(native_content_id, language_code)
    );
  `).run()

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_native_public_content_translations_content ON native_public_content_translations(native_content_id);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_native_public_content_translations_status ON native_public_content_translations(status);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_native_public_content_translations_language ON native_public_content_translations(language_code);`).run()
}

function normalizeLanguageCode(value) {
  return String(value || '').trim().toLowerCase().replace(/_/g, '-').slice(0, 35)
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase()
  return TRANSLATION_STATUSES.includes(status) ? status : 'draft'
}

function createTranslationId(nativeContentId, languageCode) {
  const safeContent = String(nativeContentId || 'content').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80)
  const safeLanguage = normalizeLanguageCode(languageCode).replace(/[^a-z0-9-]+/g, '-')
  return `translation-${safeContent}-${safeLanguage}`
}

export function normalizeTranslation(input = {}) {
  const languageCode = normalizeLanguageCode(input.languageCode || input.language_code)
  if (!languageCode) throw new Error('languageCode is required')

  const nativeContentId = String(input.nativeContentId || input.native_content_id || '').trim()
  if (!nativeContentId) throw new Error('nativeContentId is required')

  const status = normalizeStatus(input.status)
  const now = new Date().toISOString()
  const translation = input.translation && typeof input.translation === 'object' ? input.translation : {}

  return {
    id: String(input.id || createTranslationId(nativeContentId, languageCode)),
    nativeContentId,
    languageCode,
    languageLabel: String(input.languageLabel || input.language_label || languageCode),
    status,
    provider: String(input.provider || 'manual').trim() || 'manual',
    translatorCredit: String(input.translatorCredit || input.translator_credit || ''),
    reviewerCredit: String(input.reviewerCredit || input.reviewer_credit || ''),
    externalUrl: String(input.externalUrl || input.external_url || ''),
    weblateUrl: String(input.weblateUrl || input.weblate_url || ''),
    translation: {
      title: String(translation.title || input.title || ''),
      excerpt: String(translation.excerpt || input.excerpt || ''),
      bodyHtml: String(translation.bodyHtml || translation.body_html || input.bodyHtml || input.body_html || ''),
      seoTitle: String(translation.seoTitle || translation.seo_title || input.seoTitle || ''),
      seoDescription: String(translation.seoDescription || translation.seo_description || input.seoDescription || ''),
    },
    createdAt: String(input.createdAt || input.created_at || now),
    updatedAt: String(input.updatedAt || input.updated_at || now),
    reviewedAt: String(input.reviewedAt || input.reviewed_at || ''),
    publishedAt: String(input.publishedAt || input.published_at || ''),
  }
}

function rowToTranslation(row) {
  let translation = {}
  try {
    translation = JSON.parse(row.translation_json || '{}')
  } catch {
    translation = {}
  }
  return normalizeTranslation({
    id: row.id,
    nativeContentId: row.native_content_id,
    languageCode: row.language_code,
    languageLabel: row.language_label,
    translation,
    status: row.status,
    provider: row.provider,
    translatorCredit: row.translator_credit,
    reviewerCredit: row.reviewer_credit,
    externalUrl: row.external_url,
    weblateUrl: row.weblate_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at || '',
    publishedAt: row.published_at || '',
  })
}

export async function listTranslations(db, nativeContentId, { includeUnpublished = false } = {}) {
  await ensureNativePublicTranslationsTable(db)
  const statusClause = includeUnpublished ? '' : `AND status = 'published'`
  const result = await db.prepare(`
    SELECT * FROM native_public_content_translations
    WHERE native_content_id = ? ${statusClause}
    ORDER BY language_label COLLATE NOCASE ASC
  `).bind(nativeContentId).all()
  return (result?.results || []).map(rowToTranslation)
}

export async function upsertTranslation(db, input) {
  await ensureNativePublicTranslationsTable(db)
  const normalized = normalizeTranslation({ ...input, updatedAt: new Date().toISOString() })
  const existing = await db.prepare(`SELECT created_at, reviewer_credit FROM native_public_content_translations WHERE native_content_id = ? AND language_code = ? LIMIT 1`)
    .bind(normalized.nativeContentId, normalized.languageCode).first()
  if (existing?.created_at) normalized.createdAt = existing.created_at
  if (!normalized.reviewerCredit && existing?.reviewer_credit) normalized.reviewerCredit = String(existing.reviewer_credit)
  if (normalized.status === 'approved' && !normalized.reviewedAt) normalized.reviewedAt = new Date().toISOString()
  if (normalized.status === 'published' && !normalized.publishedAt) normalized.publishedAt = new Date().toISOString()

  await db.prepare(`
    INSERT INTO native_public_content_translations (
      id, native_content_id, language_code, language_label, translation_json, status, provider,
      translator_credit, reviewer_credit, external_url, weblate_url,
      created_at, updated_at, reviewed_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(native_content_id, language_code) DO UPDATE SET
      language_label = excluded.language_label,
      translation_json = excluded.translation_json,
      status = excluded.status,
      provider = excluded.provider,
      translator_credit = excluded.translator_credit,
      reviewer_credit = excluded.reviewer_credit,
      external_url = excluded.external_url,
      weblate_url = excluded.weblate_url,
      updated_at = excluded.updated_at,
      reviewed_at = excluded.reviewed_at,
      published_at = excluded.published_at
  `).bind(
    normalized.id,
    normalized.nativeContentId,
    normalized.languageCode,
    normalized.languageLabel,
    JSON.stringify(normalized.translation),
    normalized.status,
    normalized.provider,
    normalized.translatorCredit,
    normalized.reviewerCredit,
    normalized.externalUrl,
    normalized.weblateUrl,
    normalized.createdAt,
    normalized.updatedAt,
    normalized.reviewedAt || null,
    normalized.publishedAt || null,
  ).run()
  return normalized
}

export async function deleteTranslation(db, nativeContentId, languageCode) {
  await ensureNativePublicTranslationsTable(db)
  await db.prepare(`DELETE FROM native_public_content_translations WHERE native_content_id = ? AND language_code = ?`)
    .bind(nativeContentId, normalizeLanguageCode(languageCode)).run()
  return { ok: true }
}

function splitArticleBodyHtml(value) {
  const html = String(value || '').trim()
  if (!html) return {}

  const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
  const tagPattern = /<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g
  const chunks = []
  let depth = 0
  let chunkStart = 0
  let match

  while ((match = tagPattern.exec(html))) {
    const tag = match[0]
    const name = String(match[1] || '').toLowerCase()
    const closing = /^<\//.test(tag)
    const selfClosing = /\/\s*>$/.test(tag) || voidElements.has(name)

    if (closing) {
      depth = Math.max(0, depth - 1)
    } else if (!selfClosing) {
      depth += 1
    }

    if (depth === 0) {
      const chunk = html.slice(chunkStart, tagPattern.lastIndex).trim()
      if (chunk) chunks.push(chunk)
      chunkStart = tagPattern.lastIndex
    }
  }

  const tail = html.slice(chunkStart).trim()
  if (tail) chunks.push(tail)

  return Object.fromEntries(
    chunks.map((chunk, index) => [String(index + 1).padStart(3, '0'), chunk])
  )
}

function joinArticleBodyHtml(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ''
  return Object.entries(body)
    .sort(([left], [right]) => left.localeCompare(right, 'en', { numeric: true }))
    .map(([, value]) => String(value || ''))
    .join('')
}

export function buildWeblateSourceBundle(content) {
  if (!content) throw new Error('content not found')
  return {
    title: String(content.title || ''),
    excerpt: String(content.excerpt || ''),
    body: splitArticleBodyHtml(content.bodyHtml || content.body || ''),
    seoTitle: String(content.seoTitle || ''),
    seoDescription: String(content.seoDescription || ''),
  }
}

export function translationFromWeblateBundle(bundle = {}, defaults = {}) {
  const strings = bundle.strings && typeof bundle.strings === 'object' ? bundle.strings : bundle
  return normalizeTranslation({
    ...defaults,
    translation: {
      title: strings.title,
      excerpt: strings.excerpt,
      bodyHtml: joinArticleBodyHtml(strings.body) || String(strings.bodyHtml || ''),
      seoTitle: strings.seoTitle,
      seoDescription: strings.seoDescription,
    },
  })
}
