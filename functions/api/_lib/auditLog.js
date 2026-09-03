export function createAuditId() {
  return `audit-${Math.random().toString(36).slice(2, 10)}`
}

export async function ensureAuditLogTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL DEFAULT '',
    actor TEXT NOT NULL DEFAULT 'unknown',
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run()

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id)').run()
}

export async function writeAuditLog(db, entry) {
  if (!db) return { ok: false, skipped: true }

  await ensureAuditLogTable(db)

  const id = createAuditId()
  const action = String(entry?.action || '').trim()
  const entityType = String(entry?.entityType || '').trim()
  const entityId = String(entry?.entityId || '')
  const actor = String(entry?.actor || 'unknown')
  const detailJson = JSON.stringify(entry?.detail || {})
  const createdAt = new Date().toISOString()

  if (!action || !entityType) {
    throw new Error('audit log requires action and entityType')
  }

  await db
    .prepare('INSERT INTO audit_log (id, action, entity_type, entity_id, actor, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, action, entityType, entityId, actor, detailJson, createdAt)
    .run()

  return { ok: true, id }
}

export async function listAuditLog(db, options = {}) {
  await ensureAuditLogTable(db)

  const clauses = []
  const binds = []

  if (options.entityType) {
    clauses.push('entity_type = ?')
    binds.push(options.entityType)
  }

  if (options.entityId) {
    clauses.push('entity_id = ?')
    binds.push(options.entityId)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const stmt = db.prepare(`SELECT id, action, entity_type, entity_id, actor, detail_json, created_at
    FROM audit_log ${where}
    ORDER BY datetime(created_at) DESC
    LIMIT 200`)

  const result = binds.length ? await stmt.bind(...binds).all() : await stmt.all()
  const rows = Array.isArray(result?.results) ? result.results : []

  return rows.map((row) => {
    let detail = {}
    try {
      detail = JSON.parse(row.detail_json || '{}')
    } catch {
      detail = {}
    }

    return {
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      actor: row.actor,
      detail,
      createdAt: row.created_at,
    }
  })
}

export function inferActorFromRequest(request) {
  const auth =
    request.headers.get('x-sabot-actor') ||
    request.headers.get('cf-access-authenticated-user-email') ||
    ''

  return String(auth || 'unknown').slice(0, 160)
}
