import {
  canAccessAdmin,
  capabilitiesForRole,
  countAdminUsers,
  getAdminUserByEmail,
  getAdminUserById,
  hasCapability,
  publicUser,
} from './adminUsers.js'

const SESSION_COOKIE_NAME = 'sabot_session'
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

export async function resolvePublicSitePermission(context) {
  const trustAccessHeaders = String(context?.env?.SABOT_TRUST_CF_ACCESS || '').toLowerCase() === 'true'
  const accessEmail = getCloudflareAccessEmail(context?.request)
  const db = context?.env?.BF_DB || null

  if (trustAccessHeaders && accessEmail) {
    if (db) {
      const user = await getAdminUserByEmail(db, accessEmail)
      if (user && canAccessAdmin(user)) return permissionFromUser(publicUser(user), 'cloudflare-access', 'Cloudflare Access identity mapped to active SabotPress user')
      const userCount = await countAdminUsers(db)
      if (userCount === 0) {
        return bootstrapPermission(accessEmail, 'cloudflare-access-bootstrap', 'Cloudflare Access bootstrap identity; provision the first owner account')
      }
      return deniedPermission('cloudflare-access', 'Cloudflare Access identity is not provisioned as an active SabotPress user')
    }
    return bootstrapPermission(accessEmail, 'cloudflare-access-bootstrap', 'Cloudflare Access identity present; BF_DB unavailable for user mapping')
  }

  const session = await verifyAdminSession(context)
  if (session.valid) {
    const payload = session.payload || {}
    if (payload.userId) {
      if (!db) return deniedPermission('session', 'BF_DB is required to validate this user session')
      const row = await getAdminUserById(db, payload.userId)
      const user = row ? publicUser(row) : null
      if (!user || !canAccessAdmin(user)) return deniedPermission('session', 'user account is missing or disabled')
      return {
        ...permissionFromUser(user, 'session', 'valid signed user session'),
        sessionExpiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : '',
      }
    }

    return {
      ...bootstrapPermission(payload.sub || 'admin', 'bootstrap-session', 'valid emergency/bootstrap admin session'),
      sessionExpiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : '',
    }
  }

  return deniedPermission(
    missingSessionSecret(context) ? 'locked' : 'session',
    session.reason || (missingSessionSecret(context) ? 'editing locked; set SABOT_SESSION_SECRET' : 'valid session required'),
  )
}

export function permissionHasCapability(permission, capability) {
  if (!permission?.canAccessAdmin) return false
  return hasCapability(permission, capability)
}

export function validateAdminLoginToken(context, token) {
  const expected = String(context?.env?.SABOT_ADMIN_TOKEN || '')
  const received = String(token || '')

  if (!expected) {
    return {
      ok: false,
      reason: 'editing locked; set SABOT_ADMIN_TOKEN',
    }
  }

  return {
    ok: timingSafeEqual(received, expected),
    reason: 'valid admin token required',
  }
}

export async function createAdminSessionCookie(context, identity = 'admin') {
  const secret = getSessionSecret(context)
  if (!secret) throw new Error('SABOT_SESSION_SECRET is required to create admin sessions')

  const now = Math.floor(Date.now() / 1000)
  const ttl = getSessionTtlSeconds(context)
  const isIdentityObject = identity && typeof identity === 'object'
  const role = isIdentityObject ? String(identity.role || 'viewer') : 'owner'
  const payload = {
    v: 2,
    sub: String(isIdentityObject ? (identity.email || identity.displayName || identity.id || 'user') : (identity || 'admin')).slice(0, 254),
    userId: isIdentityObject ? String(identity.id || '').slice(0, 180) : '',
    email: isIdentityObject ? String(identity.email || '').slice(0, 254) : '',
    role,
    iat: now,
    exp: now + ttl,
    sid: createSessionId(),
  }
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = await signSession(secret, encodedPayload)
  const value = `${encodedPayload}.${signature}`

  return serializeCookie(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    secure: shouldUseSecureCookie(context),
    sameSite: 'Lax',
    path: '/',
    maxAge: ttl,
    expires: new Date(payload.exp * 1000),
  })
}

export function clearAdminSessionCookie(context) {
  return serializeCookie(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: shouldUseSecureCookie(context),
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  })
}

export async function verifyAdminSession(context) {
  const secret = getSessionSecret(context)
  if (!secret) return { valid: false, reason: 'editing locked; set SABOT_SESSION_SECRET' }

  const cookie = getCookie(context?.request, SESSION_COOKIE_NAME)
  if (!cookie) return { valid: false, reason: 'valid session required' }

  const [encodedPayload, signature] = String(cookie).split('.')
  if (!encodedPayload || !signature) return { valid: false, reason: 'invalid session' }

  const expectedSignature = await signSession(secret, encodedPayload)
  if (!timingSafeEqual(signature, expectedSignature)) return { valid: false, reason: 'invalid session signature' }

  let payload = null
  try {
    payload = JSON.parse(base64UrlDecodeToString(encodedPayload))
  } catch {
    return { valid: false, reason: 'invalid session payload' }
  }

  const now = Math.floor(Date.now() / 1000)
  if (!payload?.exp || Number(payload.exp) <= now) return { valid: false, reason: 'session expired' }

  return { valid: true, payload }
}

export function getCloudflareAccessEmail(request) {
  return String(request?.headers?.get('cf-access-authenticated-user-email') || '').trim().toLowerCase()
}

function permissionFromUser(user, mode, reason) {
  const capabilities = capabilitiesForRole(user?.role)
  return {
    canAccessAdmin: true,
    canEdit: user?.role !== 'viewer',
    mode,
    reason,
    actor: user?.email || user?.id || 'user',
    role: user?.role || 'viewer',
    capabilities,
    user,
  }
}

function bootstrapPermission(actor, mode, reason) {
  return {
    canAccessAdmin: true,
    canEdit: true,
    mode,
    reason,
    actor: String(actor || 'admin').slice(0, 254),
    role: 'owner',
    capabilities: ['*'],
    user: null,
    bootstrap: true,
  }
}

function deniedPermission(mode, reason) {
  return {
    canAccessAdmin: false,
    canEdit: false,
    mode,
    reason,
    actor: 'anonymous',
    role: '',
    capabilities: [],
    user: null,
  }
}

function getSessionSecret(context) {
  return String(context?.env?.SABOT_SESSION_SECRET || '')
}

function missingSessionSecret(context) {
  return !getSessionSecret(context)
}

function getSessionTtlSeconds(context) {
  const raw = Number(context?.env?.SABOT_SESSION_TTL_SECONDS || 0)
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw)
  return DEFAULT_SESSION_TTL_SECONDS
}

function shouldUseSecureCookie(context) {
  try {
    return new URL(context.request.url).protocol === 'https:'
  } catch {
    return true
  }
}

function getCookie(request, name) {
  const header = request?.headers?.get('cookie') || ''
  const prefix = `${name}=`
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length))
  }
  return ''
}

async function signSession(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return base64UrlEncode(new Uint8Array(signature))
}

function createSessionId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function base64UrlEncode(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecodeToString(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new TextDecoder().decode(bytes)
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0, Number(options.maxAge) || 0)}`)
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`)
  if (options.path) parts.push(`Path=${options.path}`)
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`)
  if (options.secure) parts.push('Secure')
  if (options.httpOnly) parts.push('HttpOnly')
  return parts.join('; ')
}

function timingSafeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ''))
  const b = new TextEncoder().encode(String(right || ''))
  let diff = a.length ^ b.length
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) diff |= (a[index] || 0) ^ (b[index] || 0)
  return diff === 0
}
