export async function onRequestGet(context) {
  const mode = hasDb(context) ? 'd1' : 'scaffold'
  const orgId = String(context?.params?.orgId || '').trim()
  const fallback = createFallbackState()

  if (!hasDb(context)) {
    return json({
      ok: true,
      mode,
      orgId,
      data: fallback,
    })
  }

  try {
    const db = context.env.BF_DB
    const [globalEmergency, orgLockdown] = await Promise.all([
      readGlobalEmergency(db),
      readOrgLockdown(db, orgId),
    ])

    return json({
      ok: true,
      mode,
      orgId,
      data: {
        globalEmergency,
        orgLockdown,
        lastUpdated: pickLatest(globalEmergency.lastUpdated, orgLockdown.lastUpdated),
        updatedAt: pickLatest(globalEmergency.updatedAt, orgLockdown.updatedAt),
      },
    })
  } catch {
    return json({
      ok: true,
      mode,
      orgId,
      data: fallback,
    })
  }
}

function createFallbackState() {
  return {
    globalEmergency: { active: false, lastUpdated: null, updatedAt: null },
    orgLockdown: { active: false, lastUpdated: null, updatedAt: null },
    lastUpdated: null,
    updatedAt: null,
  }
}

async function readGlobalEmergency(db) {
  const candidates = [
    'SELECT active, updated_at, updatedAt FROM emergency_status WHERE scope = ? ORDER BY updated_at DESC LIMIT 1',
    'SELECT is_active AS active, updated_at, updatedAt FROM emergency_status WHERE scope = ? ORDER BY updated_at DESC LIMIT 1',
    'SELECT active, updated_at, updatedAt FROM emergency_state WHERE scope = ? ORDER BY updated_at DESC LIMIT 1',
    'SELECT value AS active, updated_at, updatedAt FROM app_settings WHERE key = ? LIMIT 1',
  ]

  for (const sql of candidates) {
    try {
      const scope = sql.includes('app_settings') ? 'global_emergency_active' : 'global'
      const row = await db.prepare(sql).bind(scope).first()
      if (!row) continue

      const active = asBoolean(row.active)
      const updatedAt = row.updated_at || row.updatedAt || null

      return {
        active,
        lastUpdated: updatedAt,
        updatedAt,
      }
    } catch {
      // Try next query shape.
    }
  }

  return {
    active: false,
    lastUpdated: null,
    updatedAt: null,
  }
}

async function readOrgLockdown(db, orgId) {
  if (!orgId) {
    return {
      active: false,
      lastUpdated: null,
      updatedAt: null,
    }
  }

  const candidates = [
    'SELECT active, updated_at, updatedAt FROM org_emergency_status WHERE org_id = ? ORDER BY updated_at DESC LIMIT 1',
    'SELECT lockdown_active AS active, updated_at, updatedAt FROM org_emergency_status WHERE org_id = ? ORDER BY updated_at DESC LIMIT 1',
    'SELECT active, updated_at, updatedAt FROM org_lockdowns WHERE org_id = ? ORDER BY updated_at DESC LIMIT 1',
    'SELECT value AS active, updated_at, updatedAt FROM org_settings WHERE org_id = ? AND key = ? LIMIT 1',
  ]

  for (const sql of candidates) {
    try {
      const row = sql.includes('org_settings')
        ? await db.prepare(sql).bind(orgId, 'lockdown_active').first()
        : await db.prepare(sql).bind(orgId).first()

      if (!row) continue

      const active = asBoolean(row.active)
      const updatedAt = row.updated_at || row.updatedAt || null

      return {
        active,
        lastUpdated: updatedAt,
        updatedAt,
      }
    } catch {
      // Try next query shape.
    }
  }

  return {
    active: false,
    lastUpdated: null,
    updatedAt: null,
  }
}

function pickLatest(a, b) {
  if (!a && !b) return null
  if (!a) return b || null
  if (!b) return a || null

  const ad = Date.parse(a)
  const bd = Date.parse(b)

  if (Number.isNaN(ad) && Number.isNaN(bd)) return a
  if (Number.isNaN(ad)) return b
  if (Number.isNaN(bd)) return a

  return ad >= bd ? a : b
}

function asBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return ['1', 'true', 'yes', 'on', 'active', 'enabled'].includes(normalized)
  }
  return false
}

function hasDb(context) {
  return Boolean(context?.env?.BF_DB)
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
