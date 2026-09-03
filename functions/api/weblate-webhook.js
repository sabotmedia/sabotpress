import { getBoundDb, databaseUnavailable } from './_lib/database.js'
import { importWeblateTranslation } from './_lib/weblateSync.js'

const MAX_BODY_BYTES = 256 * 1024
const MAX_AGE_SECONDS = 300

export async function onRequestPost(context) {
  try {
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('Weblate webhook')
    const secret = String(context.env?.WEBLATE_WEBHOOK_SECRET || '').trim()
    if (!secret) return json({ ok: false, error: 'WEBLATE_WEBHOOK_SECRET is not configured' }, 503)

    const request = context.request
    const webhookId = String(request.headers.get('webhook-id') || '').trim()
    const timestamp = String(request.headers.get('webhook-timestamp') || '').trim()
    const signature = String(request.headers.get('webhook-signature') || '').trim()
    if (!webhookId || !timestamp || !signature) return json({ ok: false, error: 'missing webhook signature headers' }, 401)

    const raw = await request.text()
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ ok: false, error: 'payload too large' }, 413)
    if (!(await verifyStandardWebhook({ secret, webhookId, timestamp, signature, raw }))) {
      return json({ ok: false, error: 'invalid or stale webhook signature' }, 401)
    }

    await ensureReplayTable(db)
    const replay = await db.prepare('SELECT webhook_id FROM weblate_webhook_deliveries WHERE webhook_id = ? LIMIT 1').bind(webhookId).first()
    if (replay) return json({ ok: true, duplicate: true })

    let payload
    try { payload = JSON.parse(raw) } catch { return json({ ok: false, error: 'invalid JSON payload' }, 400) }
    const project = String(payload?.project || request.headers.get('project') || '').trim()
    const component = String(payload?.component || request.headers.get('component') || '').trim()
    const language = String(payload?.translation || '').trim().toLowerCase().replace(/_/g, '-')
    const action = String(payload?.action || request.headers.get('action') || '').trim().toLowerCase()

    const supportedAction = action === 'translation completed' || action === 'translation uploaded' || action === 'resource updated'
    if (!supportedAction) {
      await rememberDelivery(db, webhookId, action || 'ignored')
      return json({ ok: true, ignored: true, reason: 'unrelated-event' })
    }
    if (!project || !component || !language) return json({ ok: false, error: 'project, component, and translation are required' }, 400)

    const result = await importWeblateTranslation({
      db,
      env: context.env,
      project,
      component,
      language,
      languageLabel: language,
      translatorCredit: String(payload?.author || payload?.user || 'Community translation via Weblate'),
      provenanceUrl: String(payload?.url || ''),
      auditDetail: { webhookId, action },
    })
    await rememberDelivery(db, webhookId, action)
    return json({ ok: true, imported: Boolean(result?.translation), ignored: Boolean(result?.ignored), language })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 400)
  }
}

async function verifyStandardWebhook({ secret, webhookId, timestamp, signature, raw }) {
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > MAX_AGE_SECONDS) return false
  let encodedSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret
  let keyBytes
  try {
    const binary = atob(encodedSecret)
    keyBytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch { return false }
  if (keyBytes.byteLength < 24 || keyBytes.byteLength > 64) return false
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = `${webhookId}.${timestamp}.${raw}`
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed)))
  const expected = btoa(String.fromCharCode(...mac))
  const candidates = signature.split(/\s+/).map((part) => part.startsWith('v1,') ? part.slice(3) : '').filter(Boolean)
  return candidates.some((candidate) => constantTimeEqual(candidate, expected))
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}

async function ensureReplayTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS weblate_webhook_deliveries (
    webhook_id TEXT PRIMARY KEY,
    action TEXT NOT NULL DEFAULT '',
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`).run()
  await db.prepare(`DELETE FROM weblate_webhook_deliveries WHERE received_at < datetime('now', '-7 days')`).run()
}

async function rememberDelivery(db, webhookId, action) {
  await db.prepare(`INSERT OR IGNORE INTO weblate_webhook_deliveries (webhook_id, action) VALUES (?, ?)`).bind(webhookId, action).run()
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
