import { permissionHasCapability, resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import {
  ADMIN_USER_ROLES,
  ADMIN_USER_STATUSES,
  countActiveOwners,
  createAdminUser,
  deleteAdminUser,
  getAdminUserById,
  listAdminUsers,
  publicUser,
  updateAdminUser,
} from './_lib/adminUsers.js'
import { getBoundDb, databaseUnavailable } from './_lib/database.js'
import { inferActorFromRequest, writeAuditLog } from './_lib/auditLog.js'

export async function onRequestOptions(context) {
  const permission = await resolvePublicSitePermission(context)
  return json({
    ok: true,
    canManageUsers: permissionHasCapability(permission, 'users:manage'),
    role: permission.role || '',
    bootstrap: permission.bootstrap === true,
    roles: ADMIN_USER_ROLES,
    statuses: ADMIN_USER_STATUSES,
  })
}

export async function onRequestGet(context) {
  const gate = await requireUserManager(context)
  if (gate.response) return gate.response
  const items = await listAdminUsers(gate.db)
  return json({ ok: true, mode: 'd1', items, currentUser: gate.permission.user || null, bootstrap: gate.permission.bootstrap === true })
}

export async function onRequestPost(context) {
  const gate = await requireUserManager(context)
  if (gate.response) return gate.response

  try {
    const body = await context.request.json()
    const requestedRole = String(body?.role || 'viewer').toLowerCase()
    if (requestedRole === 'owner' && gate.permission.role !== 'owner') {
      return json({ ok: false, error: 'only an owner can create another owner account' }, 403)
    }

    const user = await createAdminUser(gate.db, {
      email: body?.email,
      displayName: body?.displayName,
      password: body?.password,
      role: requestedRole,
      status: body?.status || 'active',
    })

    await writeAuditLog(gate.db, {
      action: 'user.create',
      entityType: 'admin_user',
      entityId: user.id,
      actor: gate.permission.actor || inferActorFromRequest(context.request),
      detail: safeAuditUser(user),
    })
    return json({ ok: true, mode: 'd1', user }, 201)
  } catch (error) {
    const message = String(error?.message || error)
    return json({ ok: false, error: message }, /unique|constraint/i.test(message) ? 409 : 400)
  }
}

export async function onRequestPut(context) {
  const gate = await requireUserManager(context)
  if (gate.response) return gate.response

  try {
    const body = await context.request.json()
    const id = String(body?.id || '')
    if (!id) return json({ ok: false, error: 'user id is required' }, 400)
    const existing = await getAdminUserById(gate.db, id)
    if (!existing) return json({ ok: false, error: 'user not found' }, 404)

    if (existing.role === 'owner' && gate.permission.role !== 'owner') {
      return json({ ok: false, error: 'only an owner can modify an owner account' }, 403)
    }
    if (String(body?.role || existing.role).toLowerCase() === 'owner' && gate.permission.role !== 'owner') {
      return json({ ok: false, error: 'only an owner can grant the owner role' }, 403)
    }

    const removesActiveOwner = existing.role === 'owner' && existing.status === 'active' && (
      (Object.prototype.hasOwnProperty.call(body, 'role') && String(body.role).toLowerCase() !== 'owner') ||
      (Object.prototype.hasOwnProperty.call(body, 'status') && String(body.status).toLowerCase() !== 'active')
    )
    if (removesActiveOwner && await countActiveOwners(gate.db) <= 1) {
      return json({ ok: false, error: 'cannot demote or disable the final active owner' }, 409)
    }

    const user = await updateAdminUser(gate.db, id, body)
    await writeAuditLog(gate.db, {
      action: 'user.update',
      entityType: 'admin_user',
      entityId: user.id,
      actor: gate.permission.actor || inferActorFromRequest(context.request),
      detail: safeAuditUser(user),
    })
    return json({ ok: true, mode: 'd1', user })
  } catch (error) {
    const message = String(error?.message || error)
    return json({ ok: false, error: message }, /unique|constraint/i.test(message) ? 409 : 400)
  }
}

export async function onRequestDelete(context) {
  const gate = await requireUserManager(context)
  if (gate.response) return gate.response

  const url = new URL(context.request.url)
  const id = String(url.searchParams.get('id') || '')
  if (!id) return json({ ok: false, error: 'user id is required' }, 400)

  try {
    const existing = await getAdminUserById(gate.db, id)
    if (!existing) return json({ ok: false, error: 'user not found' }, 404)
    if (existing.role === 'owner' && gate.permission.role !== 'owner') {
      return json({ ok: false, error: 'only an owner can delete an owner account' }, 403)
    }
    if (existing.role === 'owner' && existing.status === 'active' && await countActiveOwners(gate.db) <= 1) {
      return json({ ok: false, error: 'cannot delete the final active owner' }, 409)
    }
    if (gate.permission.user?.id === id) {
      return json({ ok: false, error: 'sign in as another owner or admin before deleting your own account' }, 409)
    }

    const result = await deleteAdminUser(gate.db, id)
    await writeAuditLog(gate.db, {
      action: 'user.delete',
      entityType: 'admin_user',
      entityId: id,
      actor: gate.permission.actor || inferActorFromRequest(context.request),
      detail: result.user ? safeAuditUser(result.user) : { id },
    })
    return json({ ok: true, mode: 'd1', deleted: result.deleted, id })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

async function requireUserManager(context) {
  const permission = await resolvePublicSitePermission(context)
  if (!permission.canAccessAdmin) return { response: json({ ok: false, error: permission.reason || 'authentication required' }, 403) }
  if (!permissionHasCapability(permission, 'users:manage')) {
    return { response: json({ ok: false, error: 'user-management permission required' }, 403) }
  }
  const db = getBoundDb(context)
  if (!db) return { response: databaseUnavailable('user accounts') }
  return { permission, db }
}

function safeAuditUser(user) {
  const safe = publicUser(user) || user || {}
  return {
    id: safe.id || '',
    email: safe.email || '',
    displayName: safe.displayName || '',
    role: safe.role || '',
    status: safe.status || '',
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
