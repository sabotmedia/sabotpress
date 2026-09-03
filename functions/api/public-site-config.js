import {
  readPublicSiteConfig,
  writePublicSiteConfig,
  PUBLIC_CONFIG_SCHEMA_VERSION,
} from './_lib/publicSiteConfig.js'
import { resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import { databaseUnavailable, getBoundDb } from './_lib/database.js'

export async function onRequestOptions(context) {
  const permission = await resolvePublicSitePermission(context)
  return json({
    ok: true,
    canEdit: permission.canEdit,
    authMode: permission.mode,
    authReason: permission.reason,
    mode: getBoundDb(context) ? 'd1' : 'unavailable',
    schemaVersion: PUBLIC_CONFIG_SCHEMA_VERSION,
  })
}

export async function onRequestGet(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('public site config reads')

    const result = await readPublicSiteConfig(db, 'global')
    return json({
      ok: true,
      mode: 'd1',
      scope: result.scope,
      updatedAt: result.updatedAt,
      canEdit: permission.canEdit,
      authMode: permission.mode,
      authReason: permission.reason,
      version: result.version,
      schemaVersion: PUBLIC_CONFIG_SCHEMA_VERSION,
      config: result.config,
    })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

export async function onRequestPut(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permission.canEdit) {
      return json({
        ok: false,
        error: permission.reason,
        canEdit: false,
        authMode: permission.mode,
      }, 403)
    }

    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('public site config writes')

    const body = await context.request.json()
    const incoming = body?.publicSite || body?.config || body || {}
    const saved = await writePublicSiteConfig(db, incoming, 'global')

    return json({
      ok: true,
      mode: 'd1',
      saved: true,
      canEdit: true,
      authMode: permission.mode,
      authReason: permission.reason,
      received: { publicSite: saved.config },
      updatedAt: saved.updatedAt,
      scope: saved.scope,
      version: saved.version,
      schemaVersion: PUBLIC_CONFIG_SCHEMA_VERSION,
    })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 400)
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
