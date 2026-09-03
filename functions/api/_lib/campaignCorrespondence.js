import { getCampaign } from './campaigns.js'

const SESSION_HOURS = 24 * 30
const PIN_ATTEMPT_LIMIT = 8
const PIN_WINDOW_SECONDS = 15 * 60

export async function ensureCampaignCorrespondenceTables(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS campaign_contributors (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, display_name TEXT NOT NULL, byline TEXT NOT NULL DEFAULT '', token_hash TEXT NOT NULL UNIQUE, pin_hash TEXT NOT NULL, pin_salt TEXT NOT NULL, permissions_json TEXT NOT NULL DEFAULT '{}', revoked_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS campaign_contributor_sessions (id TEXT PRIMARY KEY, contributor_id TEXT NOT NULL, session_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS campaign_messages (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, contributor_id TEXT, sender_role TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_url TEXT NOT NULL DEFAULT '', media_type TEXT NOT NULL DEFAULT '', visibility TEXT NOT NULL DEFAULT 'private', status TEXT NOT NULL DEFAULT 'sent', reply_to_id TEXT, reuse_social INTEGER NOT NULL DEFAULT 0, reuse_original INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS campaign_questions (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, question TEXT NOT NULL, submitter_name TEXT NOT NULL DEFAULT 'Anonymous', submitter_contact TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new', editor_note TEXT NOT NULL DEFAULT '', message_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS idx_campaign_contributors_campaign ON campaign_contributors(campaign_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_campaign_sessions_hash ON campaign_contributor_sessions(session_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_campaign_messages_campaign ON campaign_messages(campaign_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_campaign_questions_campaign ON campaign_questions(campaign_id, status, created_at DESC)`,
  ]
  for (const sql of statements) await db.prepare(sql).run()
  for (const sql of [
    `ALTER TABLE campaign_messages ADD COLUMN origin_source TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE campaign_messages ADD COLUMN origin_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE campaign_messages ADD COLUMN origin_url TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE campaign_messages ADD COLUMN original_published_at TEXT`,
    `ALTER TABLE campaign_messages ADD COLUMN publication_confirmed INTEGER NOT NULL DEFAULT 0`,
  ]) { try { await db.prepare(sql).run() } catch {} }
  try { await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_messages_origin ON campaign_messages(campaign_id, origin_source, origin_id) WHERE origin_id != ''`).run() } catch {}
}

export async function createContributor(db, campaignId, input = {}) {
  await ensureCampaignCorrespondenceTables(db)
  const campaign = await getCampaign(db, campaignId)
  if (!campaign) throw new Error('campaign not found')
  const displayName = clean(input.displayName, 120)
  const pin = String(input.pin || '').trim()
  if (!displayName) throw new Error('display name is required')
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN must be 4–8 digits')
  const id = crypto.randomUUID()
  const token = randomSecret(32)
  const salt = randomSecret(16)
  const now = new Date().toISOString()
  const permissions = {
    directPublish: input.directPublish !== false,
    uploadMedia: input.uploadMedia !== false,
    withdrawOwn: input.withdrawOwn !== false,
  }
  await db.prepare(`INSERT INTO campaign_contributors (id, campaign_id, display_name, byline, token_hash, pin_hash, pin_salt, permissions_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    id, campaign.id, displayName, clean(input.byline || displayName, 160), await sha256(token), await hashPin(pin, salt), salt, JSON.stringify(permissions), now, now,
  ).run()
  return { contributor: { id, campaignId: campaign.id, displayName, byline: clean(input.byline || displayName, 160), permissions, revokedAt: null, createdAt: now }, token }
}

export async function authenticateContributor(db, { token, pin, ip = '' }) {
  await ensureCampaignCorrespondenceTables(db)
  const tokenHash = await sha256(String(token || ''))
  const contributor = await db.prepare('SELECT * FROM campaign_contributors WHERE token_hash = ? LIMIT 1').bind(tokenHash).first()
  const rateKey = `campaign-pin:${await sha256(`${ip}:${tokenHash}`)}`
  if (!contributor || contributor.revoked_at) throw authError('Access link is invalid or has been revoked.')
  if (!(await allowAttempt(db, rateKey))) throw authError('Too many PIN attempts. Wait 15 minutes and try again.', 429)
  const matches = timingSafeEqual(await hashPin(String(pin || ''), contributor.pin_salt), contributor.pin_hash)
  if (!matches) throw authError('That PIN is not correct.')
  await clearAttempts(db, rateKey)
  const session = randomSecret(32)
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString()
  await db.prepare('INSERT INTO campaign_contributor_sessions (id, contributor_id, session_hash, expires_at) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), contributor.id, await sha256(session), expiresAt).run()
  return { session, expiresAt, contributor: contributorRow(contributor) }
}

export async function contributorFromRequest(db, request) {
  await ensureCampaignCorrespondenceTables(db)
  const dedicated = String(request.headers.get('x-sabot-contributor-session') || '').trim()
  const bearer = String(request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1] || ''
  const session = dedicated || bearer
  if (!session) return null
  const row = await db.prepare(`SELECT c.* FROM campaign_contributor_sessions s JOIN campaign_contributors c ON c.id = s.contributor_id WHERE s.session_hash = ? AND datetime(s.expires_at) > datetime(?) AND c.revoked_at IS NULL LIMIT 1`).bind(await sha256(session), new Date().toISOString()).first()
  return row ? contributorRow(row) : null
}

export async function listContributors(db, campaignId) {
  await ensureCampaignCorrespondenceTables(db)
  const result = await db.prepare('SELECT * FROM campaign_contributors WHERE campaign_id = ? ORDER BY created_at DESC').bind(campaignId).all()
  return (result.results || []).map(contributorRow)
}

export async function revokeContributor(db, id, revoked = true) {
  await ensureCampaignCorrespondenceTables(db)
  const at = revoked ? new Date().toISOString() : null
  await db.prepare('UPDATE campaign_contributors SET revoked_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(at, id).run()
  if (revoked) await db.prepare('DELETE FROM campaign_contributor_sessions WHERE contributor_id = ?').bind(id).run()
  return { id, revokedAt: at }
}

export async function reissueContributorToken(db, id) {
  await ensureCampaignCorrespondenceTables(db)
  const contributor = await db.prepare('SELECT * FROM campaign_contributors WHERE id = ? LIMIT 1').bind(id).first()
  if (!contributor) throw authError('contributor not found', 404)
  const token = randomSecret(32)
  await db.prepare('UPDATE campaign_contributors SET token_hash = ?, revoked_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(await sha256(token), id).run()
  await db.prepare('DELETE FROM campaign_contributor_sessions WHERE contributor_id = ?').bind(id).run()
  return { contributor: contributorRow({ ...contributor, revoked_at: null }), token }
}

export async function listMessages(db, campaignId, { publicOnly = false } = {}) {
  await ensureCampaignCorrespondenceTables(db)
  const where = publicOnly ? "AND m.visibility = 'public' AND m.status = 'sent' AND (m.sender_role = 'editor' OR m.publication_confirmed = 1)" : ''
  const result = await db.prepare(`SELECT m.*, c.display_name, c.byline FROM campaign_messages m LEFT JOIN campaign_contributors c ON c.id = m.contributor_id WHERE m.campaign_id = ? ${where} ORDER BY m.created_at ASC`).bind(campaignId).all()
  return (result.results || []).map(messageRow)
}

export async function createMessage(db, campaignId, input = {}, actor = {}) {
  await ensureCampaignCorrespondenceTables(db)
  const body = clean(input.body, 12000)
  const mediaUrl = clean(input.mediaUrl, 2000)
  if (!body && !mediaUrl) throw new Error('write a message or attach media')
  const visibility = input.visibility === 'public' && (actor.isEditor || (actor.permissions?.directPublish && actor.publicationConfirmed)) ? 'public' : 'private'
  const publicationConfirmed = visibility === 'public' && (actor.isEditor || actor.publicationConfirmed) ? 1 : 0
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const publishedAt = actor.isEditor && input.originalPublishedAt && !Number.isNaN(Date.parse(input.originalPublishedAt)) ? new Date(input.originalPublishedAt).toISOString() : now
  await db.prepare(`INSERT INTO campaign_messages (id, campaign_id, contributor_id, sender_role, body, media_url, media_type, visibility, status, reply_to_id, reuse_social, reuse_original, origin_source, origin_id, origin_url, original_published_at, publication_confirmed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    id, campaignId, actor.contributorId || null, actor.isEditor ? 'editor' : 'contributor', body, mediaUrl, clean(input.mediaType, 40), visibility, clean(input.replyToId, 80) || null, input.reuseSocial ? 1 : 0, input.reuseOriginal ? 1 : 0, clean(input.originSource, 40), clean(input.originId, 160), clean(input.originUrl, 2000), publishedAt, publicationConfirmed, publishedAt, now,
  ).run()
  return (await listMessages(db, campaignId)).find((item) => item.id === id)
}

export async function patchMessage(db, id, patch = {}, actor = {}) {
  await ensureCampaignCorrespondenceTables(db)
  const current = await db.prepare('SELECT * FROM campaign_messages WHERE id = ? LIMIT 1').bind(id).first()
  if (!current) throw new Error('message not found')
  if (!actor.isEditor && current.contributor_id !== actor.contributorId) throw authError('You can only change your own messages.', 403)
  const body = patch.body === undefined ? current.body : clean(patch.body, 12000)
  if (!body && !current.media_url) throw new Error('write a message or attach media')
  const visibility = patch.visibility === undefined ? current.visibility : (patch.visibility === 'public' && (actor.isEditor || (actor.permissions?.directPublish && actor.publicationConfirmed)) ? 'public' : 'private')
  const publicationConfirmed = visibility === 'public' && (actor.isEditor || actor.publicationConfirmed || current.publication_confirmed) ? 1 : 0
  const status = patch.status === 'withdrawn' ? 'withdrawn' : current.status
  const updatedAt = new Date().toISOString()
  await db.prepare('UPDATE campaign_messages SET body = ?, visibility = ?, publication_confirmed = ?, status = ?, updated_at = ? WHERE id = ?').bind(body, visibility, publicationConfirmed, status, updatedAt, id).run()
  return { ...messageRow(current), body, visibility, status, updatedAt }
}

export async function deleteMessage(db, id, actor = {}) {
  await ensureCampaignCorrespondenceTables(db)
  const current = await db.prepare('SELECT * FROM campaign_messages WHERE id = ? LIMIT 1').bind(id).first()
  if (!current) throw authError('message not found', 404)
  if (!actor.isEditor && current.contributor_id !== actor.contributorId) throw authError('You can only delete your own messages.', 403)
  await db.prepare('UPDATE campaign_questions SET message_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE message_id = ?').bind(id).run()
  await db.prepare('DELETE FROM campaign_messages WHERE id = ?').bind(id).run()
  return messageRow(current)
}

export async function createQuestion(db, campaignId, input = {}) {
  await ensureCampaignCorrespondenceTables(db)
  const question = clean(input.question, 2000)
  if (question.length < 8) throw new Error('Please write a complete question.')
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.prepare(`INSERT INTO campaign_questions (id, campaign_id, question, submitter_name, submitter_contact, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, campaignId, question, clean(input.name || 'Anonymous', 120), clean(input.contact, 240), now, now).run()
  return { id, campaignId, question, submitterName: clean(input.name || 'Anonymous', 120), status: 'new', createdAt: now }
}

export async function listQuestions(db, campaignId) {
  await ensureCampaignCorrespondenceTables(db)
  const result = await db.prepare('SELECT * FROM campaign_questions WHERE campaign_id = ? ORDER BY created_at DESC').bind(campaignId).all()
  return (result.results || []).map((row) => ({ id: row.id, campaignId: row.campaign_id, question: row.question, submitterName: row.submitter_name, submitterContact: row.submitter_contact, status: row.status, editorNote: row.editor_note, messageId: row.message_id, createdAt: row.created_at, updatedAt: row.updated_at }))
}

export async function patchQuestion(db, id, patch = {}) {
  const allowed = new Set(['new', 'shortlisted', 'sent', 'answered', 'ready', 'published', 'archived'])
  const status = allowed.has(patch.status) ? patch.status : 'new'
  await db.prepare('UPDATE campaign_questions SET status = ?, editor_note = ?, message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(status, clean(patch.editorNote, 2000), clean(patch.messageId, 80) || null, id).run()
  return { id, status }
}

function contributorRow(row) { let permissions = {}; try { permissions = JSON.parse(row.permissions_json || '{}') } catch {} return { id: row.id, campaignId: row.campaign_id, displayName: row.display_name, byline: row.byline, permissions, revokedAt: row.revoked_at, createdAt: row.created_at } }
function messageRow(row) { return { id: row.id, campaignId: row.campaign_id, contributorId: row.contributor_id, senderRole: row.sender_role, displayName: row.origin_source === 'instagram' ? 'Example Campaign' : (row.byline || row.display_name || (row.sender_role === 'editor' ? 'SabotPress' : 'Contributor')), body: row.body, mediaUrl: row.media_url, mediaType: row.media_type, visibility: row.visibility, status: row.status, replyToId: row.reply_to_id, reuseSocial: Boolean(row.reuse_social), reuseOriginal: Boolean(row.reuse_original), originSource: row.origin_source || '', originId: row.origin_id || '', originUrl: row.origin_url || '', originalPublishedAt: row.original_published_at || null, createdAt: row.created_at, updatedAt: row.updated_at } }
function clean(value, max = 500) { return String(value || '').trim().slice(0, max) }
function randomSecret(bytes) { const data = crypto.getRandomValues(new Uint8Array(bytes)); return base64url(data) }
function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') }
async function sha256(value) { const data = new TextEncoder().encode(value); return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', data))) }
async function hashPin(pin, salt) { return sha256(`${salt}:${pin}`) }
function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0 }
function authError(message, status = 401) { const error = new Error(message); error.status = status; return error }
async function allowAttempt(db, key) { await db.prepare(`CREATE TABLE IF NOT EXISTS campaign_rate_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, window_started_at TEXT NOT NULL)`).run(); const now = Date.now(); const row = await db.prepare('SELECT * FROM campaign_rate_limits WHERE key = ?').bind(key).first(); const started = Date.parse(row?.window_started_at || 0); if (!row || now - started > PIN_WINDOW_SECONDS * 1000) { await db.prepare('INSERT INTO campaign_rate_limits (key, attempts, window_started_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = 1, window_started_at = excluded.window_started_at').bind(key, new Date(now).toISOString()).run(); return true } if (Number(row.attempts) >= PIN_ATTEMPT_LIMIT) return false; await db.prepare('UPDATE campaign_rate_limits SET attempts = attempts + 1 WHERE key = ?').bind(key).run(); return true }
async function clearAttempts(db, key) { await db.prepare('DELETE FROM campaign_rate_limits WHERE key = ?').bind(key).run() }
