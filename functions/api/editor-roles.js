import { permissionHasCapability, resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import { ensureEditorRolesTable, listEditorRoles, upsertEditorRole, deleteEditorRole } from './_lib/editorRoles.js'
import { writeAuditLog } from './_lib/auditLog.js'
import { databaseUnavailable, getBoundDb } from './_lib/database.js'

export async function onRequestOptions(context) {
  const permission = await resolvePublicSitePermission(context)
  return json({ ok: true, canEdit: permissionHasCapability(permission, 'users:manage'), authMode: permission.mode, authReason: permission.reason, mode: getBoundDb(context) ? 'd1' : 'unavailable' })
}

export async function onRequestGet(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permissionHasCapability(permission, 'users:manage')) return json({ ok: false, error: 'user-management permission required', canEdit: false }, 403)
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('editor role reads')
    await ensureEditorRolesTable(db)
    return json({ ok: true, mode: 'd1', items: await listEditorRoles(db) })
  } catch (error) { return json({ ok: false, error: String(error?.message || error) }, 500) }
}

export async function onRequestPost(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permissionHasCapability(permission, 'users:manage')) return json({ ok: false, error: 'user-management permission required', canEdit: false }, 403)
    const body = await context.request.json()
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('editor role writes')
    const saved = await upsertEditorRole(db, body?.record || body || {})
    await writeAuditLog(db, { action: 'editor_role.upsert', entityType: 'editor_role', entityId: saved.id, actor: permission.actor, detail: saved })
    return json({ ok: true, mode: 'd1', record: saved })
  } catch (error) { return json({ ok: false, error: String(error?.message || error) }, 400) }
}

export async function onRequestDelete(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permissionHasCapability(permission, 'users:manage')) return json({ ok: false, error: 'user-management permission required', canEdit: false }, 403)
    const id = new URL(context.request.url).searchParams.get('id') || ''
    if (!id) return json({ ok: false, error: 'missing id' }, 400)
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('editor role deletion')
    const result = await deleteEditorRole(db, id)
    await writeAuditLog(db, { action: 'editor_role.delete', entityType: 'editor_role', entityId: id, actor: permission.actor, detail: result })
    return json({ ok: true, mode: 'd1', ...result })
  } catch (error) { return json({ ok: false, error: String(error?.message || error) }, 500) }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}
