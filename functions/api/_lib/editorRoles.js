export function createRoleId() {
  return `role-${Math.random().toString(36).slice(2, 10)}`
}

export function normalizeEditorRole(input) {
  const raw = input || {}
  const now = new Date().toISOString()
  return {
    id: String(raw.id || createRoleId()),
    principal: String(raw.principal || '').trim(),
    role: normalizeEnum(raw.role, ['admin', 'editor', 'contributor', 'reviewer', 'viewer']) || 'viewer',
    notes: String(raw.notes || ''),
    createdAt: String(raw.createdAt || raw.created_at || now),
    updatedAt: String(raw.updatedAt || raw.updated_at || now),
  }
}

export async function ensureEditorRolesTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS editor_roles (
    id TEXT PRIMARY KEY,
    principal TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'viewer',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_editor_roles_role ON editor_roles(role)').run()
}

export async function listEditorRoles(db) {
  await ensureEditorRolesTable(db)
  const result = await db.prepare('SELECT id, principal, role, notes, created_at, updated_at FROM editor_roles ORDER BY role ASC, principal ASC').all()
  const rows = Array.isArray(result?.results) ? result.results : []
  return rows.map(normalizeEditorRole)
}

export async function upsertEditorRole(db, record) {
  await ensureEditorRolesTable(db)
  const normalized = normalizeEditorRole({ ...record, updatedAt: new Date().toISOString() })
  if (!normalized.principal) throw new Error('principal is required')
  await db.prepare(`INSERT INTO editor_roles (id, principal, role, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(principal) DO UPDATE SET role = excluded.role, notes = excluded.notes, updated_at = excluded.updated_at`)
    .bind(normalized.id, normalized.principal, normalized.role, normalized.notes, normalized.createdAt, normalized.updatedAt)
    .run()
  return normalized
}

export async function deleteEditorRole(db, id) {
  await ensureEditorRolesTable(db)
  await db.prepare('DELETE FROM editor_roles WHERE id = ?').bind(id).run()
  return { ok: true, deleted: id }
}

function normalizeEnum(value, allowed) {
  const str = String(value || '').trim()
  return allowed.includes(str) ? str : ''
}
