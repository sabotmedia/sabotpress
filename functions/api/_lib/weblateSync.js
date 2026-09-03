import { getExistingNativeEntry } from './nativePublicContent.js'
import { translationFromWeblateBundle, upsertTranslation } from './nativePublicTranslations.js'
import { writeAuditLog } from './auditLog.js'

const DEFAULT_BASE_URL = 'https://hosted.weblate.org'
const MAX_JSON_BYTES = 2 * 1024 * 1024

export const WEBLATE_COMPONENTS = new Map([
  ['sabotpress/ai-server-called-paranoia', 'the-server-called-paranoia'],
])

function normalizeBaseUrl(value) {
  const url = new URL(String(value || DEFAULT_BASE_URL))
  if (url.protocol !== 'https:') throw new Error('WEBLATE_BASE_URL must use https')
  if (url.username || url.password) throw new Error('WEBLATE_BASE_URL must not contain credentials')
  return url.origin
}

function authHeaders(token, accept = 'application/json') {
  if (!token) throw new Error('WEBLATE_API_TOKEN is not configured')
  return { Authorization: `Token ${token}`, Accept: accept }
}

async function readBoundedText(response, maxBytes = MAX_JSON_BYTES) {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared && declared > maxBytes) throw new Error('Weblate response is too large')
  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('Weblate response is too large')
  return text
}

export async function fetchWeblateTranslationFile({ env, project, component, language }) {
  const base = normalizeBaseUrl(env?.WEBLATE_BASE_URL)
  const endpoint = `${base}/api/translations/${encodeURIComponent(project)}/${encodeURIComponent(component)}/${encodeURIComponent(language)}/file/`
  const response = await fetch(endpoint, { headers: authHeaders(env?.WEBLATE_API_TOKEN, 'application/json') })
  if (!response.ok) throw new Error(`Weblate translation fetch failed (${response.status})`)
  const text = await readBoundedText(response)
  try { return JSON.parse(text) } catch { throw new Error('Weblate returned invalid translation JSON') }
}

export async function listWeblateTranslations({ env, project, component }) {
  const base = normalizeBaseUrl(env?.WEBLATE_BASE_URL)
  let endpoint = `${base}/api/components/${encodeURIComponent(project)}/${encodeURIComponent(component)}/translations/`
  const results = []
  for (let page = 0; endpoint && page < 20; page += 1) {
    const response = await fetch(endpoint, { headers: authHeaders(env?.WEBLATE_API_TOKEN) })
    if (!response.ok) throw new Error(`Weblate translation list failed (${response.status})`)
    const payload = JSON.parse(await readBoundedText(response))
    results.push(...(Array.isArray(payload?.results) ? payload.results : []))
    endpoint = payload?.next ? String(payload.next) : ''
    if (endpoint && !endpoint.startsWith(base)) throw new Error('Weblate pagination escaped configured origin')
  }
  return results
}

function languageCodeFromTranslation(item) {
  return String(item?.language?.code || item?.language_code || item?.language || item?.code || '').trim().toLowerCase().replace(/_/g, '-')
}

function languageLabelFromTranslation(item, code) {
  return String(item?.language?.name || item?.language_name || item?.name || code).trim() || code
}

async function getExistingTranslationRow(db, nativeContentId, languageCode) {
  return db.prepare(`SELECT status, translation_json, translator_credit, reviewer_credit, reviewed_at, published_at
    FROM native_public_content_translations
    WHERE native_content_id = ? AND language_code = ? LIMIT 1`)
    .bind(nativeContentId, languageCode).first()
}

function sameTranslation(existingJson, nextTranslation) {
  try { return JSON.stringify(JSON.parse(existingJson || '{}')) === JSON.stringify(nextTranslation || {}) } catch { return false }
}

export async function importWeblateTranslation({ db, env, project, component, language, languageLabel = '', translatorCredit = '', provenanceUrl = '', auditDetail = {} }) {
  const key = `${project}/${component}`
  const slug = WEBLATE_COMPONENTS.get(key)
  if (!slug) return { ok: true, ignored: true, reason: 'unmapped-component' }
  const code = String(language || '').trim().toLowerCase().replace(/_/g, '-')
  if (!code || code === 'en') return { ok: true, ignored: true, reason: 'source-language' }

  const content = await getExistingNativeEntry(db, slug)
  if (!content) throw new Error(`Mapped Sabot article not found: ${slug}`)
  const bundle = await fetchWeblateTranslationFile({ env, project, component, language: code })
  const base = normalizeBaseUrl(env?.WEBLATE_BASE_URL)
  const input = translationFromWeblateBundle(bundle, {
    nativeContentId: content.id,
    languageCode: code,
    languageLabel: languageLabel || code,
    status: 'in_review',
    provider: 'weblate',
    translatorCredit: translatorCredit || 'Community translation via Weblate',
    weblateUrl: provenanceUrl || `${base}/projects/${encodeURIComponent(project)}/${encodeURIComponent(component)}/${encodeURIComponent(code)}/`,
  })

  const existing = await getExistingTranslationRow(db, content.id, code)
  const unchanged = Boolean(existing && sameTranslation(existing.translation_json, input.translation))
  if (unchanged) {
    input.status = String(existing.status || 'in_review')
    input.translatorCredit = String(existing.translator_credit || input.translatorCredit)
    input.reviewerCredit = String(existing.reviewer_credit || '')
    input.reviewedAt = String(existing.reviewed_at || '')
    input.publishedAt = String(existing.published_at || '')
  } else {
    // Changed/new Weblate content always returns to review and can never auto-publish.
    input.status = 'in_review'
    input.publishedAt = ''
    if (existing?.reviewer_credit) input.reviewerCredit = String(existing.reviewer_credit)
  }

  const saved = await upsertTranslation(db, input)
  await writeAuditLog(db, {
    action: unchanged ? 'native_translation.weblate_sync_unchanged' : 'native_translation.weblate_sync',
    entityType: 'native_translation',
    entityId: saved.id,
    actor: 'weblate-sync',
    detail: { project, component, language: code, status: saved.status, changed: !unchanged, ...auditDetail },
  })
  return { ok: true, translation: saved, changed: !unchanged }
}

export async function syncWeblateComponent({ db, env, project, component }) {
  if (!WEBLATE_COMPONENTS.has(`${project}/${component}`)) return { ok: true, ignored: true, reason: 'unmapped-component' }
  const translations = await listWeblateTranslations({ env, project, component })
  const imported = []
  for (const item of translations) {
    const code = languageCodeFromTranslation(item)
    if (!code || code === 'en') continue
    const result = await importWeblateTranslation({
      db, env, project, component, language: code,
      languageLabel: languageLabelFromTranslation(item, code),
      provenanceUrl: String(item?.url || ''),
      auditDetail: { trigger: 'component-sync' },
    })
    if (result?.translation) imported.push({ language: code, status: result.translation.status, changed: result.changed })
  }
  return { ok: true, imported }
}
