import { permissionHasCapability, resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import { ensureAuditLogTable, listAuditLog } from './_lib/auditLog.js'

export async function onRequestOptions(context) {
  const permission = await resolvePublicSitePermission(context)
  return json({
    ok: true,
    canView: permissionHasCapability(permission, 'system:view'),
    authMode: permission.mode,
    authReason: permission.reason,
    mode: hasDb(context) ? 'd1' : 'unavailable',
  })
}

export async function onRequestGet(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permissionHasCapability(permission, 'system:view')) return json({ ok: false, error: 'system-view permission required' }, 403)
    if (!hasDb(context)) return json({ ok: false, mode: 'unavailable', error: 'audit storage unavailable: BF_DB is not bound' }, 503)

    const url = new URL(context.request.url)
    const entityType = url.searchParams.get('entityType') || ''
    const entityId = url.searchParams.get('entityId') || ''
    await ensureAuditLogTable(context.env.BF_DB)
    const items = await listAuditLog(context.env.BF_DB, { entityType: entityType || undefined, entityId: entityId || undefined })
    return json({ ok: true, mode: 'd1', items })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

function hasDb(context) { return Boolean(context?.env?.BF_DB) }
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}
