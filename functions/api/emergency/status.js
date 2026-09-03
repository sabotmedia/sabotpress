export async function onRequestGet(context) {
  const mode = hasDb(context) ? 'd1' : 'scaffold'
  const fallback = createFallbackState()

  if (!hasDb(context)) {
    return json({
      ok: true,
      mode,
      data: fallback,
    })
  }

  try {
    const db = context.env.BF_DB
    const globalEmergency = await readGlobalEmergency(db)

    return json({
      ok: true,
      mode,
      data: {
        globalEmergency,
        orgLockdown: { active: false, lastUpdated: null, updatedAt: null },
        lastUpdated: globalEmergency.lastUpdated,
        updatedAt: globalEmergency.updatedAt,
      },
    })
  } catch {
    return json({
      ok: true,
      mode,
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
