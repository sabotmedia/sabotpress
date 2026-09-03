export function createTaxonomyId(prefix = 'tax') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function slugifyTaxonomy(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeTaxonomyTerm(input) {
  const raw = input || {}
  const now = new Date().toISOString()

  return {
    id: String(raw.id || createTaxonomyId('term')),
    label: String(raw.label || '').trim(),
    slug: slugifyTaxonomy(raw.slug || raw.label || ''),
    taxonomy: normalizeEnum(raw.taxonomy, ['tag', 'series', 'theme', 'project']) || 'tag',
    description: String(raw.description || ''),
    createdAt: String(raw.createdAt || raw.created_at || now),
    updatedAt: String(raw.updatedAt || raw.updated_at || now),
  }
}

export function normalizeTaxonomyLink(input) {
  const raw = input || {}
  const now = new Date().toISOString()

  return {
    id: String(raw.id || createTaxonomyId('link')),
    nativeContentId: String(raw.nativeContentId || raw.native_content_id || ''),
    termId: String(raw.termId || raw.term_id || ''),
    createdAt: String(raw.createdAt || raw.created_at || now),
  }
}

export async function ensureTaxonomyTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS taxonomy_terms (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    taxonomy TEXT NOT NULL DEFAULT 'tag',
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run()

  await db.prepare(`CREATE TABLE IF NOT EXISTS native_content_taxonomy (
    id TEXT PRIMARY KEY,
    native_content_id TEXT NOT NULL,
    term_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run()

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_taxonomy ON taxonomy_terms(taxonomy)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_label ON taxonomy_terms(label)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_native_content_taxonomy_native ON native_content_taxonomy(native_content_id)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_native_content_taxonomy_term ON native_content_taxonomy(term_id)').run()
}

export async function listTaxonomyTerms(db, options = {}) {
  await ensureTaxonomyTables(db)
  const clauses = []
  const binds = []
  if (options.taxonomy) {
    clauses.push('taxonomy = ?')
    binds.push(options.taxonomy)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const stmt = db.prepare(`SELECT id, label, slug, taxonomy, description, created_at, updated_at FROM taxonomy_terms ${where} ORDER BY taxonomy ASC, label ASC`)
  const result = binds.length ? await stmt.bind(...binds).all() : await stmt.all()
  const rows = Array.isArray(result?.results) ? result.results : []
  return rows.map(normalizeTaxonomyTerm)
}

export async function upsertTaxonomyTerm(db, term) {
  await ensureTaxonomyTables(db)
  const normalized = normalizeTaxonomyTerm({ ...term, updatedAt: new Date().toISOString() })
  if (!normalized.label) throw new Error('taxonomy term requires label')
  await db.prepare(`INSERT INTO taxonomy_terms (id, label, slug, taxonomy, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET label = excluded.label, slug = excluded.slug, taxonomy = excluded.taxonomy, description = excluded.description, updated_at = excluded.updated_at`)
    .bind(normalized.id, normalized.label, normalized.slug, normalized.taxonomy, normalized.description, normalized.createdAt, normalized.updatedAt)
    .run()
  return normalized
}

export async function deleteTaxonomyTerm(db, id) {
  await ensureTaxonomyTables(db)
  await db.prepare('DELETE FROM native_content_taxonomy WHERE term_id = ?').bind(id).run()
  await db.prepare('DELETE FROM taxonomy_terms WHERE id = ?').bind(id).run()
  return { ok: true, deleted: id }
}

export async function listLinksForNativeContent(db, nativeContentId) {
  await ensureTaxonomyTables(db)
  const result = await db.prepare(`SELECT l.id, l.native_content_id, l.term_id, l.created_at,
    t.label, t.slug, t.taxonomy, t.description
    FROM native_content_taxonomy l
    JOIN taxonomy_terms t ON t.id = l.term_id
    WHERE l.native_content_id = ?
    ORDER BY t.taxonomy ASC, t.label ASC`)
    .bind(nativeContentId)
    .all()
  const rows = Array.isArray(result?.results) ? result.results : []
  return rows.map((row) => ({
    id: row.id,
    nativeContentId: row.native_content_id,
    termId: row.term_id,
    createdAt: row.created_at,
    term: normalizeTaxonomyTerm({ id: row.term_id, label: row.label, slug: row.slug, taxonomy: row.taxonomy, description: row.description }),
  }))
}

export async function replaceLinksForNativeContent(db, nativeContentId, termIds = []) {
  await ensureTaxonomyTables(db)
  const cleanIds = [...new Set((Array.isArray(termIds) ? termIds : []).map((v) => String(v || '').trim()).filter(Boolean))]
  await db.prepare('DELETE FROM native_content_taxonomy WHERE native_content_id = ?').bind(nativeContentId).run()
  for (const termId of cleanIds) {
    const link = normalizeTaxonomyLink({ nativeContentId, termId })
    await db.prepare('INSERT INTO native_content_taxonomy (id, native_content_id, term_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(link.id, link.nativeContentId, link.termId, link.createdAt)
      .run()
  }
  return listLinksForNativeContent(db, nativeContentId)
}

function normalizeEnum(value, allowed) {
  const str = String(value || '').trim()
  return allowed.includes(str) ? str : ''
}
