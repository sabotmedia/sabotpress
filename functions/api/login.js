import { createAdminSessionCookie, validateAdminLoginToken } from './_lib/publicSiteAuth.js'
import { getAdminUserByEmail, markAdminUserLogin, publicUser, verifyPassword } from './_lib/adminUsers.js'

export async function onRequestPost(context) {
  let body = null
  try {
    body = await context.request.json()
  } catch {
    body = {}
  }

  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')
  const token = String(body?.token || '').trim()

  if (email) return loginUser(context, email, password)
  if (token) return loginBootstrap(context, token)

  return json({
    ok: false,
    authenticated: false,
    error: 'email and password are required',
  }, 400)
}

async function loginUser(context, email, password) {
  const db = context?.env?.BF_DB
  if (!db) return json({ ok: false, authenticated: false, error: 'user login unavailable: BF_DB is not bound' }, 503)

  try {
    const row = await getAdminUserByEmail(db, email)
    const valid = row?.status === 'active' && await verifyPassword(password, row)
    if (!valid) return json({ ok: false, authenticated: false, error: 'Invalid email or password.' }, 401)

    const user = publicUser(row)
    const cookie = await createAdminSessionCookie(context, user)
    await markAdminUserLogin(db, user.id)
    return json({
      ok: true,
      authenticated: true,
      mode: 'user',
      user,
      role: user.role,
      capabilities: user.capabilities,
    }, 200, { 'set-cookie': cookie })
  } catch (error) {
    return json({ ok: false, authenticated: false, error: String(error?.message || error) }, 500)
  }
}

async function loginBootstrap(context, token) {
  const result = validateAdminLoginToken(context, token)
  if (!result.ok) return json({ ok: false, authenticated: false, error: result.reason }, 401)

  try {
    const cookie = await createAdminSessionCookie(context, 'bootstrap-owner')
    return json({
      ok: true,
      authenticated: true,
      mode: 'bootstrap',
      role: 'owner',
      capabilities: ['*'],
    }, 200, { 'set-cookie': cookie })
  } catch (error) {
    return json({ ok: false, authenticated: false, error: String(error?.message || error) }, 500)
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  })
}
