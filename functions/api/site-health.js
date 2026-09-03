import { permissionHasCapability, resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import { databaseUnavailable, getBoundDb } from './_lib/database.js'

const CANONICAL_MEDIA_BINDING = 'SABOT_MEDIA_BUCKET'
const TABLES = [
  'native_public_content',
  'native_public_content_revisions',
  'media_assets',
  'taxonomy_terms',
  'native_content_taxonomy',
  'admin_users',
  'editor_roles',
  'audit_log',
  'analytics_events',
  'collections',
  'campaigns',
  'campaign_revisions',
  'campaign_coverage_archive',
  'campaign_coverage_refresh',
  'publications',
  'public_site_configs',
  'site_domains',
  'site_settings',
]

export async function onRequestGet(context) {
  const permission = await resolvePublicSitePermission(context)
  if (!permissionHasCapability(permission, 'system:view')) return json({ ok: false, error: 'system-view permission required' }, 403)

  const db = getBoundDb(context)
  if (!db) return databaseUnavailable('site health checks')

  try {
    const url = new URL(context.request.url)
    const tableRows = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
    const present = new Set((tableRows.results || []).map((row) => String(row.name || '')))
    const tables = []

    for (const name of TABLES) {
      const exists = present.has(name)
      let count = null
      let error = ''
      if (exists) {
        try {
          const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).first()
          count = Number(row?.count || 0)
        } catch (nextError) {
          error = String(nextError?.message || nextError)
        }
      }
      tables.push({ name, exists, count, error })
    }

    const mediaBinding = detectMediaBinding(context.env)
    const missingTables = tables.filter((table) => !table.exists).map((table) => table.name)
    const tableErrors = tables.filter((table) => table.error)
    const mediaBindingCanonical = mediaBinding === CANONICAL_MEDIA_BINDING

    return json({
      ok: true,
      generatedAt: new Date().toISOString(),
      requestHost: url.hostname,
      requestProtocol: url.protocol.replace(':', ''),
      auth: {
        mode: permission.mode,
        actor: permission.actor || '',
        role: permission.role || '',
        bootstrap: permission.bootstrap === true,
        adminTokenConfigured: Boolean(context.env?.SABOT_ADMIN_TOKEN),
        sessionSecretConfigured: Boolean(context.env?.SABOT_SESSION_SECRET),
        cloudflareAccessTrusted: String(context.env?.SABOT_TRUST_CF_ACCESS || '').toLowerCase() === 'true',
      },
      bindings: {
        BF_DB: true,
        ASSETS: Boolean(context.env?.ASSETS?.fetch),
        mediaStorage: Boolean(mediaBinding),
        mediaBinding: mediaBinding || '',
        mediaBindingRequired: CANONICAL_MEDIA_BINDING,
        mediaBindingCanonical,
      },
      tables,
      summary: {
        healthy: missingTables.length === 0 && tableErrors.length === 0 && Boolean(mediaBinding),
        missingTables,
        tableErrorCount: tableErrors.length,
        mediaStorageMissing: !mediaBinding,
        mediaBindingLegacyAlias: Boolean(mediaBinding && !mediaBindingCanonical),
        https: url.protocol === 'https:',
      },
    })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

function detectMediaBinding(env = {}) {
  for (const name of [CANONICAL_MEDIA_BINDING, 'MEDIA_BUCKET', 'ASSETS_BUCKET', 'SABOT_AUDIO_BUCKET', 'AUDIO_MEDIA_BUCKET']) {
    if (env?.[name]) return name
  }
  return ''
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}
