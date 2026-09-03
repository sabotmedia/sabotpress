// Cloudflare Workers caps Web Crypto PBKDF2 operations at 100,000 iterations.
// Keep this value aligned with the production runtime rather than Node's higher limit.
export const PASSWORD_ITERATIONS = 100_000
const MAX_PASSWORD_ITERATIONS = 100_000
const PASSWORD_MIN_LENGTH = 12

export const ADMIN_USER_ROLES = Object.freeze(['owner', 'admin', 'editor', 'viewer'])
export const ADMIN_USER_STATUSES = Object.freeze(['active', 'disabled'])

const ROLE_CAPABILITIES = Object.freeze({
  owner: ['*'],
  admin: ['content:write', 'media:write', 'publishing:write', 'site:manage', 'analytics:view', 'system:view', 'users:manage'],
  editor: ['content:write', 'media:write', 'publishing:write', 'analytics:view'],
  viewer: ['analytics:view'],
})

export async function ensureAdminUsersTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_iterations INTEGER NOT NULL DEFAULT ${PASSWORD_ITERATIONS},
    role TEXT NOT NULL DEFAULT 'viewer',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT
  )`).run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_admin_users_status ON admin_users(status)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email)').run()
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 254)
}

export function normalizeRole(value, fallback = 'viewer') {
  const role = String(value || '').trim().toLowerCase()
  return ADMIN_USER_ROLES.includes(role) ? role : fallback
}

export function normalizeStatus(value, fallback = 'active') {
  const status = String(value || '').trim().toLowerCase()
  return ADMIN_USER_STATUSES.includes(status) ? status : fallback
}

export function capabilitiesForRole(role) {
  return [...(ROLE_CAPABILITIES[normalizeRole(role)] || [])]
}

export function hasCapability(identity, capability) {
  if (!identity) return false
  const capabilities = Array.isArray(identity.capabilities)
    ? identity.capabilities
    : capabilitiesForRole(identity.role)
  return capabilities.includes('*') || capabilities.includes(capability)
}

export function canAccessAdmin(identity) {
  return Boolean(identity && normalizeStatus(identity.status) === 'active')
}

export function validatePassword(password) {
  const value = String(password || '')
  if (value.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `password must be at least ${PASSWORD_MIN_LENGTH} characters` }
  }
  if (value.length > 512) return { ok: false, error: 'password is too long' }
  return { ok: true }
}

export async function hashPassword(password, saltInput = '') {
  const validity = validatePassword(password)
  if (!validity.ok) throw new Error(validity.error)
  const saltBytes = saltInput ? base64ToBytes(saltInput) : randomBytes(16)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: saltBytes,
    iterations: PASSWORD_ITERATIONS,
  }, keyMaterial, 256)
  return {
    hash: bytesToBase64(new Uint8Array(bits)),
    salt: bytesToBase64(saltBytes),
    iterations: PASSWORD_ITERATIONS,
  }
}

export async function verifyPassword(password, user) {
  if (!user?.password_hash || !user?.password_salt) return false
  const iterations = Number(user.password_iterations || PASSWORD_ITERATIONS)
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_PASSWORD_ITERATIONS) return false
  try {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(String(password || '')),
      'PBKDF2',
      false,
      ['deriveBits'],
    )
    const bits = await crypto.subtle.deriveBits({
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: base64ToBytes(user.password_salt),
      iterations,
    }, keyMaterial, 256)
    return timingSafeBytesEqual(new Uint8Array(bits), base64ToBytes(user.password_hash))
  } catch {
    return false
  }
}

export async function getAdminUserByEmail(db, email) {
  await ensureAdminUsersTable(db)
  const normalized = normalizeEmail(email)
  if (!normalized) return null
  return db.prepare('SELECT * FROM admin_users WHERE email = ? LIMIT 1').bind(normalized).first()
}

export async function getAdminUserById(db, id) {
  await ensureAdminUsersTable(db)
  if (!id) return null
  return db.prepare('SELECT * FROM admin_users WHERE id = ? LIMIT 1').bind(String(id)).first()
}

export async function listAdminUsers(db) {
  await ensureAdminUsersTable(db)
  const result = await db.prepare(`SELECT id, email, display_name, role, status, created_at, updated_at, last_login_at
    FROM admin_users ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END, email COLLATE NOCASE ASC`).all()
  return (result?.results || []).map(publicUser)
}

export async function countAdminUsers(db) {
  await ensureAdminUsersTable(db)
  const row = await db.prepare('SELECT COUNT(*) AS total FROM admin_users').first()
  return Number(row?.total || 0)
}

export async function countActiveOwners(db) {
  await ensureAdminUsersTable(db)
  const row = await db.prepare("SELECT COUNT(*) AS total FROM admin_users WHERE role = 'owner' AND status = 'active'").first()
  return Number(row?.total || 0)
}

export async function createAdminUser(db, input = {}) {
  await ensureAdminUsersTable(db)
  const email = normalizeEmail(input.email)
  const displayName = String(input.displayName || input.display_name || '').trim().slice(0, 160)
  const role = normalizeRole(input.role)
  const status = normalizeStatus(input.status)
  const password = String(input.password || '')
  if (!email || !email.includes('@')) throw new Error('valid email is required')
  const credentials = await hashPassword(password)
  const id = String(input.id || `user-${crypto.randomUUID?.() || randomHex(16)}`)
  const now = new Date().toISOString()
  await db.prepare(`INSERT INTO admin_users (
    id, email, display_name, password_hash, password_salt, password_iterations, role, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    id, email, displayName, credentials.hash, credentials.salt, credentials.iterations, role, status, now, now,
  ).run()
  return publicUser(await getAdminUserById(db, id))
}

export async function updateAdminUser(db, id, patch = {}) {
  await ensureAdminUsersTable(db)
  const existing = await getAdminUserById(db, id)
  if (!existing) throw new Error('user not found')
  const email = Object.prototype.hasOwnProperty.call(patch, 'email') ? normalizeEmail(patch.email) : existing.email
  const displayName = Object.prototype.hasOwnProperty.call(patch, 'displayName')
    ? String(patch.displayName || '').trim().slice(0, 160)
    : existing.display_name
  const role = Object.prototype.hasOwnProperty.call(patch, 'role') ? normalizeRole(patch.role, existing.role) : existing.role
  const status = Object.prototype.hasOwnProperty.call(patch, 'status') ? normalizeStatus(patch.status, existing.status) : existing.status
  if (!email || !email.includes('@')) throw new Error('valid email is required')

  let passwordHash = existing.password_hash
  let passwordSalt = existing.password_salt
  let passwordIterations = existing.password_iterations
  if (String(patch.password || '')) {
    const credentials = await hashPassword(String(patch.password))
    passwordHash = credentials.hash
    passwordSalt = credentials.salt
    passwordIterations = credentials.iterations
  }

  const now = new Date().toISOString()
  await db.prepare(`UPDATE admin_users SET email = ?, display_name = ?, password_hash = ?, password_salt = ?,
    password_iterations = ?, role = ?, status = ?, updated_at = ? WHERE id = ?`).bind(
    email, displayName, passwordHash, passwordSalt, passwordIterations, role, status, now, String(id),
  ).run()
  return publicUser(await getAdminUserById(db, id))
}

export async function deleteAdminUser(db, id) {
  await ensureAdminUsersTable(db)
  const existing = await getAdminUserById(db, id)
  if (!existing) return { deleted: false, user: null }
  await db.prepare('DELETE FROM admin_users WHERE id = ?').bind(String(id)).run()
  return { deleted: true, user: publicUser(existing) }
}

export async function markAdminUserLogin(db, id) {
  if (!id) return
  await ensureAdminUsersTable(db)
  await db.prepare('UPDATE admin_users SET last_login_at = ?, updated_at = updated_at WHERE id = ?')
    .bind(new Date().toISOString(), String(id)).run()
}

export function publicUser(row) {
  if (!row) return null
  const role = normalizeRole(row.role)
  return {
    id: String(row.id || ''),
    email: normalizeEmail(row.email),
    displayName: String(row.display_name || row.displayName || ''),
    role,
    status: normalizeStatus(row.status),
    capabilities: capabilitiesForRole(role),
    createdAt: String(row.created_at || row.createdAt || ''),
    updatedAt: String(row.updated_at || row.updatedAt || ''),
    lastLoginAt: String(row.last_login_at || row.lastLoginAt || ''),
  }
}

function randomBytes(length) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

function randomHex(length) {
  return [...randomBytes(length)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function bytesToBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function timingSafeBytesEqual(left, right) {
  const a = left || new Uint8Array()
  const b = right || new Uint8Array()
  let diff = a.length ^ b.length
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) diff |= (a[index] || 0) ^ (b[index] || 0)
  return diff === 0
}
