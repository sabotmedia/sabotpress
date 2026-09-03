import { getBoundDb, databaseUnavailable } from './_lib/database.js'
import { getExistingNativeEntry } from './_lib/nativePublicContent.js'
import { resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import { writeAuditLog, inferActorFromRequest } from './_lib/auditLog.js'
import {
  buildWeblateSourceBundle,
  deleteTranslation,
  ensureNativePublicTranslationsTable,
  listTranslations,
  translationFromWeblateBundle,
  upsertTranslation,
} from './_lib/nativePublicTranslations.js'

export async function onRequestOptions(context) {
  const permission = await resolvePublicSitePermission(context)
  return json({ ok: true, canEdit: permission.canEdit })
}

export async function onRequestGet(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('content translations')

    await ensureNativePublicTranslationsTable(db)
    const url = new URL(context.request.url)
    const contentId = String(url.searchParams.get('contentId') || url.searchParams.get('id') || '').trim()
    const slug = String(url.searchParams.get('slug') || '').trim()
    const format = String(url.searchParams.get('format') || '').trim().toLowerCase()
    const content = await resolveContent(db, contentId, slug)

    if (!content) return json({ ok: false, error: 'content not found' }, 404)

    if (format === 'weblate-source') {
      if (!permission.canEdit) return json({ ok: false, error: permission.reason, canEdit: false }, 403)
      return json({ ok: true, bundle: buildWeblateSourceBundle(content) })
    }

    const translations = await listTranslations(db, content.id, {
      includeUnpublished: permission.canEdit && url.searchParams.get('includeUnpublished') === '1',
    })

    return json({
      ok: true,
      content: { id: content.id, slug: content.slug, title: content.title },
      current: { code: 'en', label: 'English' },
      translations: translations.map((item) => publicTranslationShape(item, content.slug)),
    })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

export async function onRequestPost(context) {
  return handleWrite(context)
}

export async function onRequestPut(context) {
  return handleWrite(context)
}

export async function onRequestDelete(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permission.canEdit) return json({ ok: false, error: permission.reason, canEdit: false }, 403)

    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('content translation deletion')

    const url = new URL(context.request.url)
    const contentId = String(url.searchParams.get('contentId') || '').trim()
    const languageCode = String(url.searchParams.get('languageCode') || '').trim()
    if (!contentId || !languageCode) return json({ ok: false, error: 'contentId and languageCode are required' }, 400)

    const result = await deleteTranslation(db, contentId, languageCode)
    await writeAuditLog(db, {
      action: 'native_translation.delete',
      entityType: 'native_translation',
      entityId: `${contentId}:${languageCode}`,
      actor: inferActorFromRequest(context.request),
      detail: { contentId, languageCode },
    })
    return json(result)
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 400)
  }
}

async function handleWrite(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permission.canEdit) return json({ ok: false, error: permission.reason, canEdit: false }, 403)

    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('content translation writes')

    const body = await context.request.json()
    const defaults = body?.translation || body || {}
    const contentId = String(defaults.nativeContentId || defaults.contentId || defaults.native_content_id || '').trim()
    const slug = String(defaults.slug || '').trim()
    const content = await resolveContent(db, contentId, slug)
    if (!content) return json({ ok: false, error: 'content not found' }, 404)

    const input = body?.weblateBundle
      ? translationFromWeblateBundle(body.weblateBundle, {
          ...defaults,
          nativeContentId: content.id,
          provider: defaults.provider || 'weblate',
        })
      : {
          ...defaults,
          nativeContentId: content.id,
        }

    const saved = await upsertTranslation(db, input)
    await writeAuditLog(db, {
      action: 'native_translation.upsert',
      entityType: 'native_translation',
      entityId: saved.id,
      actor: inferActorFromRequest(context.request),
      detail: {
        contentId: saved.nativeContentId,
        languageCode: saved.languageCode,
        status: saved.status,
        provider: saved.provider,
      },
    })

    return json({ ok: true, translation: saved })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 400)
  }
}

async function resolveContent(db, contentId, slug) {
  if (contentId) return getExistingNativeEntry(db, contentId)
  if (slug) return getExistingNativeEntry(db, slug)
  return null
}

function publicTranslationShape(item, slug) {
  const localHref = item.status === 'published'
    ? `/post/${encodeURIComponent(String(slug || ''))}?lang=${encodeURIComponent(item.languageCode)}`
    : ''
  return {
    code: item.languageCode,
    label: item.languageLabel || item.languageCode,
    href: item.externalUrl || localHref,
    credit: item.translatorCredit || (item.provider === 'weblate' ? 'Community translation via Weblate' : 'Translation'),
    reviewerCredit: item.reviewerCredit,
    status: item.status,
    provider: item.provider,
    weblateUrl: item.weblateUrl,
    translation: item.translation,
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
