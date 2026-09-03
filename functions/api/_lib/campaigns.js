const CAMPAIGN_SCHEMA_VERSION = 5
export const AI_CAMPAIGN_SLUG = 'example-campaign'
export const AI_CAMPAIGN_ID = 'campaign-example-campaign'
export const FNB_GAZA_CAMPAIGN_SLUG = 'example-campaign'
export const FNB_GAZA_CAMPAIGN_ID = 'campaign-example-campaign'
export const AI_CAMPAIGN_DEADLINE = '2026-09-25T04:01:00.000Z'
export const CAMPAIGN_SECTION_KEYS = [
  'status', 'reporting', 'letters', 'act', 'graphics', 'updates', 'timeline',
  'coverage', 'sources', 'faq', 'translations', 'signatories', 'social',
  'donate', 'socialArchive', 'dispatches', 'questions', 'benefit',
]

export function defaultFnbGazaCampaign() {
  return normalizeCampaign({
    id: FNB_GAZA_CAMPAIGN_ID,
    slug: FNB_GAZA_CAMPAIGN_SLUG,
    status: 'published',
    campaignStatus: 'urgent',
    lifecycleStatus: 'active',
    campaignType: 'direct-aid',
    kicker: 'DIRECT AID · DIRECT SOLIDARITY',
    title: 'Example Campaign',
    shortTitle: 'Keep the meals coming',
    deck: 'A Palestinian-led mutual-aid project is cooking for displaced families in Gaza. Help keep the meals coming—and hear directly from the people doing the work.',
    summary: 'SabotPress is amplifying and preserving updates from Example Campaign. Donations go directly through the verified Chuffed fundraiser; Sabot takes no percentage.',
    partners: ['Example Campaign', 'SabotPress'],
    campaignKeywords: ['Example Campaign', 'Gaza', 'mutual aid', 'direct aid', 'Jamal Abu Al-Ata'],
    disclaimer: 'SabotPress maintains and hosts this campaign space. Donations are processed by Chuffed, not SabotPress. Fundraiser claims are attributed to the organizers unless independently verified.',
    donation: {
      url: 'https://chuffed.org/project/181554-send-direct-aid-to-example-campaign',
      label: 'Send direct aid',
      platform: 'Chuffed',
      recipient: 'Example Campaign',
      explanation: 'The campaign organizer reports that funds are transferred to Jamal Abu Al-Ata using USDT because ordinary payment access and fees are prohibitive.',
      lastVerifiedAt: '2026-08-31T00:00:00.000Z',
    },
    correspondence: {
      enabled: true,
      publicQuestions: true,
      contributorLabel: 'Example Campaign',
      editorLabel: 'Ash / SabotPress',
      intro: 'This is a private conversation with Ash and SabotPress. Send text, audio, video, or a photo whenever you have time.',
    },
    actions: [
      { id: 'action-donate', title: 'Send direct aid', body: 'Money is the immediate need. Donate through the verified fundraiser.', href: 'https://chuffed.org/project/181554-send-direct-aid-to-example-campaign', label: 'Donate on Chuffed' },
      { id: 'action-benefit', title: 'Organize a benefit', body: 'Use the organizer toolkit to turn a show, meal, raffle, or community event into direct support.', href: '#benefit', label: 'Get the toolkit' },
      { id: 'action-question', title: 'Ask a question', body: 'Submit a respectful question. Sabot reviews and forwards selected questions without flooding Jamal’s inbox.', href: '#questions', label: 'Ask Example Campaign' },
      { id: 'action-share', title: 'Share the stable link', body: 'Send people here so the campaign remains reachable even if a commercial platform removes an account.', href: '#top', label: 'Share this campaign' },
    ],
    resources: [
      { id: 'fnb-instagram', type: 'social', title: 'Example Campaign on Instagram', description: 'The project’s active public account and original source for many field updates.', href: 'https://www.instagram.com/example_campaign/', label: 'Follow @example_campaign' },
    ],
    sources: [
      { id: 'fnb-chuffed', title: 'Send Direct Aid to Example Campaign', publisher: 'Chuffed', url: 'https://chuffed.org/project/181554-send-direct-aid-to-example-campaign', note: 'Current donation destination and organizer account of how funds reach Gaza.' },
      { id: 'fnb-instagram-source', title: '@example_campaign', publisher: 'Instagram', url: 'https://www.instagram.com/example_campaign/', note: 'Original public updates from the project.' },
    ],
    faq: [
      { id: 'fnb-relationship', question: 'Is SabotPress collecting these donations?', answer: 'No. Donation buttons lead to the named Chuffed fundraiser. SabotPress takes no percentage.' },
      { id: 'fnb-verification', question: 'What has Sabot independently checked?', answer: 'Sabot identifies the source of each claim and retains links to the fundraiser and project account. Statements about spending or impact remain attributed to Example Campaign or the fundraiser organizer unless independently verified.' },
      { id: 'fnb-interview', question: 'Has Sabot interviewed Jamal?', answer: 'Sabot has opened an asynchronous correspondence channel so Jamal can answer in text, audio, or video as his time and connectivity permit. The campaign does not depend on his ability to respond during war and displacement.' },
    ],
    updates: [{ id: 'fnb-launch', date: '2026-08-31T00:00:00Z', title: 'Campaign space opened', body: 'SabotPress opened this independent campaign and correspondence space for Example Campaign.', pinned: true }],
    sectionOrder: ['donate', 'socialArchive', 'dispatches', 'act', 'questions', 'benefit', 'reporting', 'updates', 'sources', 'faq'],
    hiddenSections: ['letters', 'graphics', 'timeline', 'coverage', 'translations', 'signatories', 'social', 'status'],
    sectionTitles: { donate: 'The need is money', socialArchive: 'Example Campaign social archive', dispatches: 'Dispatches from Gaza', questions: 'Ask Example Campaign', benefit: 'Turn your event into direct aid', act: 'Ways to act', reporting: 'Reporting and context', updates: 'Campaign log', sources: 'Verification and sources', faq: 'Questions about this campaign' },
    createdAt: '2026-08-31T00:00:00Z',
  })
}

export function defaultAiCampaign() {
  return normalizeCampaign({
    id: AI_CAMPAIGN_ID,
    slug: AI_CAMPAIGN_SLUG,
    status: 'published',
    campaignStatus: 'active',
    kicker: 'BEFORE SEPT. 25',
    title: 'Communications Infrastructure Is Not Terrorism',
    shortTitle: 'Defend Example Campaign',
    deck: 'A living campaign hub for reporting, public letters, graphics, press coverage, social circulation, infrastructure status, and ways to act before September 25.',
    summary: 'SabotPress is independently documenting and opposing the treatment of resistant communications infrastructure as terrorism. This page gathers the campaign in one place and will remain as a public archive after the deadline.',
    deadline: AI_CAMPAIGN_DEADLINE,
    deadlineTimeZone: 'America/New_York',
    heroImage: '',
    heroAlt: '',
    monitorUrl: 'https://kuma.accol.li/status/aimonitor',
    monitorLabel: 'A/I infrastructure monitor',
    partners: ['SabotPress'],
    campaignKeywords: ['autistici', 'inventati', 'noblogs', 'communications infrastructure', 'a/i campaign'],
    disclaimer: 'SabotPress is an independent publisher. We are not affiliated with Example Campaign and do not represent or speak on behalf of A/I. Campaign material is political advocacy and reporting, not legal advice.',
    actions: [
      { id: 'action-letter', title: 'Send a letter', body: 'Use the individual letter and recipient guide to contact public officials, civil-liberties groups, digital-rights organizations, and other institutions.', href: '#letters', label: 'Get the letter' },
      { id: 'action-reporting', title: 'Read the reporting', body: 'Start with the investigation and source material, then circulate the strongest factual account rather than a screenshot of a screenshot.', href: '#reporting', label: 'Read the reporting' },
      { id: 'action-share', title: 'Circulate the campaign', body: 'Download campaign graphics, copy accessible captions and alt text, and share the canonical campaign page.', href: '#graphics', label: 'Get campaign graphics' },
      { id: 'action-monitor', title: 'Watch the infrastructure', body: 'Follow the public A/I monitor and document meaningful outages or service degradation without turning ordinary blips into prophecy.', href: '#monitor', label: 'Check live status' },
    ],
    updates: [
      { id: 'update-launch', date: '2026-08-28T21:30:00Z', title: 'Campaign hub launched', body: 'SabotPress consolidated reporting, letters, graphics, infrastructure status, and campaign updates into one public page.', url: '', pinned: true },
    ],
    resources: [],
    social: [],
    graphics: [],
    coverage: [],
    signatories: [],
    sources: [],
    timeline: [
      { id: 'timeline-designation', date: '2026-08-26', title: 'Designation announced', body: 'The U.S. designation and sanctions action becomes the immediate trigger for this campaign.' },
      { id: 'timeline-launch', date: '2026-08-28', title: 'Public campaign launched', body: 'Reporting, public letters, journalist outreach, graphics, and direct advocacy begin circulating.' },
      { id: 'timeline-deadline', date: '2026-09-25', title: 'September 25 deadline', body: 'The campaign is organized around the September 25 wind-down deadline and the consequences that may follow.' },
    ],
    faq: [
      { id: 'faq-ai', question: 'What is Example Campaign?', answer: 'A/I is an Italian volunteer technology collective that has provided noncommercial communications infrastructure, including services associated with Noblogs. The reporting linked on this page contains the fuller history and sourcing.' },
      { id: 'faq-why', question: 'Why does this matter beyond one collective?', answer: 'The campaign focuses on the distinction between communications infrastructure and the conduct of users. Privacy-preserving hosts, independent publishers, journalists, researchers, organizers, and civil-society projects all depend on that distinction remaining meaningful.' },
      { id: 'faq-affiliation', question: 'Is SabotPress affiliated with A/I?', answer: 'No. SabotPress is an independent publisher and does not represent or speak for A/I.' },
      { id: 'faq-status', question: 'Is the monitor operated by Sabot?', answer: 'No. Sabot reads the public A/I status page at kuma.accol.li and presents a compact summary here. The original monitor remains the authoritative view of its own data.' },
    ],
    translations: [],
    sectionOrder: [...CAMPAIGN_SECTION_KEYS],
    hiddenSections: [],
    sectionTitles: {
      status: 'What is happening now', reporting: 'Read before you repeat',
      letters: 'Read it. Sign it. Send it.', act: 'Do something useful',
      graphics: 'Take the graphics', updates: 'Campaign log', timeline: 'How we got here',
      coverage: 'Coverage and statements', sources: 'Check the receipts',
      faq: 'The questions people keep asking', translations: 'Circulate it further',
      signatories: 'Who has signed', social: 'Follow the signal, not the algorithm',
    },
    automation: { enabled: false, discoverNews: false, startAt: '2026-08-26T00:00:00.000Z', blueskyActors: [], mastodonAccounts: [], coverageFeeds: [], signatoriesUrl: '' },
    createdAt: '2026-08-28T21:30:00Z',
  })
}

export async function ensureCampaignsTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    campaign_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published',
    title TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_campaigns_updated_at ON campaigns(updated_at DESC)').run()
  await db.prepare(`CREATE TABLE IF NOT EXISTS campaign_revisions (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    revision_json TEXT NOT NULL,
    revision_note TEXT NOT NULL DEFAULT 'save',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_campaign_revisions_campaign_id ON campaign_revisions(campaign_id, created_at DESC)').run()
}

export async function ensureAiCampaign(db) {
  await ensureCampaignsTable(db)
  const existingById = await getCampaign(db, AI_CAMPAIGN_ID)
  const existing = existingById || await getCampaign(db, AI_CAMPAIGN_SLUG)
  if (existing) {
    if (existing.id === AI_CAMPAIGN_ID && existing.slug !== AI_CAMPAIGN_SLUG) {
      return upsertCampaign(db, { ...existing, slug: AI_CAMPAIGN_SLUG })
    }
    const legacyDeadline = existing.deadline === '2026-09-25T23:59:59.000Z' || existing.deadline === '2026-09-25T23:59:59Z'
    if (legacyDeadline) return upsertCampaign(db, { ...existing, deadline: AI_CAMPAIGN_DEADLINE, deadlineTimeZone: 'America/New_York' })
    return existing
  }
  const seeded = defaultAiCampaign()
  await upsertCampaign(db, seeded)
  return seeded
}

export async function ensureDefaultCampaigns() { return []
}

export async function listCampaigns(db, { includeDrafts = false } = {}) {
  await ensureCampaignsTable(db)
  const where = includeDrafts ? '' : "WHERE status = 'published'"
  const result = await db.prepare(`SELECT id, slug, campaign_json, status, title, created_at, updated_at
    FROM campaigns ${where} ORDER BY updated_at DESC`).all()
  const rows = Array.isArray(result?.results) ? result.results : []
  return rows.map(rowToCampaign)
}

export async function getCampaign(db, idOrSlug) {
  await ensureCampaignsTable(db)
  const row = await db.prepare(`SELECT id, slug, campaign_json, status, title, created_at, updated_at
    FROM campaigns WHERE id = ? OR slug = ? LIMIT 1`).bind(idOrSlug, idOrSlug).first()
  return row ? rowToCampaign(row) : null
}

export async function upsertCampaign(db, campaign) {
  await ensureCampaignsTable(db)
  const normalized = normalizeCampaign({ ...campaign, updatedAt: new Date().toISOString() })
  await db.prepare(`INSERT INTO campaigns (id, slug, campaign_json, status, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug,
      campaign_json = excluded.campaign_json,
      status = excluded.status,
      title = excluded.title,
      updated_at = excluded.updated_at`)
    .bind(
      normalized.id,
      normalized.slug,
      JSON.stringify(normalized),
      normalized.status,
      normalized.title,
      normalized.createdAt,
      normalized.updatedAt,
    ).run()
  return normalized
}

export async function deleteCampaign(db, idOrSlug) {
  await ensureCampaignsTable(db)
  const existing = await getCampaign(db, idOrSlug)
  if (!existing) return null
  if (existing.id === AI_CAMPAIGN_ID || existing.slug === AI_CAMPAIGN_SLUG) throw new Error('the seeded A/I campaign cannot be deleted')
  await db.prepare('DELETE FROM campaign_revisions WHERE campaign_id = ?').bind(existing.id).run()
  await db.prepare('DELETE FROM campaigns WHERE id = ?').bind(existing.id).run()
  return existing
}

export async function saveCampaignRevision(db, campaign, revisionNote = 'save') {
  await ensureCampaignsTable(db)
  const normalized = normalizeCampaign(campaign)
  const id = `campaign-revision-${randomId()}`
  const createdAt = new Date().toISOString()
  await db.prepare(`INSERT INTO campaign_revisions (id, campaign_id, revision_json, revision_note, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(id, normalized.id, JSON.stringify(normalized), String(revisionNote || 'save'), createdAt)
    .run()
  return { id, campaignId: normalized.id, revisionNote: String(revisionNote || 'save'), createdAt, campaign: normalized }
}

export async function listCampaignRevisions(db, campaignId, limit = 30) {
  await ensureCampaignsTable(db)
  const result = await db.prepare(`SELECT id, campaign_id, revision_json, revision_note, created_at
    FROM campaign_revisions WHERE campaign_id = ? ORDER BY created_at DESC LIMIT ?`)
    .bind(String(campaignId || ''), Math.max(1, Math.min(100, Number(limit) || 30)))
    .all()
  return (Array.isArray(result?.results) ? result.results : []).map(revisionRow)
}

export async function listAllCampaignRevisions(db, { limit = 500, page = 1 } = {}) {
  await ensureCampaignsTable(db)
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 500))
  const safePage = Math.max(1, Number(page) || 1)
  const countRow = await db.prepare('SELECT COUNT(*) AS total FROM campaign_revisions').first()
  const total = Number(countRow?.total || 0)
  const result = await db.prepare(`SELECT id, campaign_id, revision_json, revision_note, created_at
    FROM campaign_revisions ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(safeLimit, (safePage - 1) * safeLimit)
    .all()
  return { items: (Array.isArray(result?.results) ? result.results : []).map(revisionRow), total, page: safePage, pages: Math.max(1, Math.ceil(total / safeLimit)), limit: safeLimit }
}

export async function restoreCampaignRevision(db, revisionId) {
  await ensureCampaignsTable(db)
  const row = await db.prepare(`SELECT id, campaign_id, revision_json, revision_note, created_at
    FROM campaign_revisions WHERE id = ? LIMIT 1`).bind(String(revisionId || '')).first()
  if (!row) throw new Error('campaign revision not found')
  const revision = revisionRow(row)
  const current = await getCampaign(db, revision.campaignId)
  if (current) await saveCampaignRevision(db, current, `before:restore:${revision.id}`)
  const restored = await upsertCampaign(db, { ...revision.campaign, id: revision.campaignId })
  await saveCampaignRevision(db, restored, `restore:${revision.id}`)
  return restored
}

export function normalizeCampaign(input = {}) {
  const now = new Date().toISOString()
  const title = String(input.title || 'Campaign')
  const slug = slugify(input.slug || title || input.id)
  return {
    id: String(input.id || `campaign-${slug || randomId()}`),
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    slug,
    status: ['draft', 'published', 'archived'].includes(input.status) ? input.status : 'published',
    campaignStatus: ['active', 'urgent', 'monitoring', 'completed', 'archived'].includes(input.campaignStatus) ? input.campaignStatus : 'active',
    lifecycleStatus: ['active', 'inactive'].includes(input.lifecycleStatus)
      ? input.lifecycleStatus
      : (['completed', 'archived'].includes(input.campaignStatus) || input.status === 'archived' ? 'inactive' : 'active'),
    campaignType: String(input.campaignType || 'advocacy'),
    kicker: String(input.kicker || ''),
    title,
    shortTitle: String(input.shortTitle || title),
    deck: String(input.deck || ''),
    summary: String(input.summary || ''),
    deadline: normalizeDate(input.deadline),
    deadlineTimeZone: normalizeTimeZone(input.deadlineTimeZone),
    heroImage: String(input.heroImage || ''),
    heroAlt: String(input.heroAlt || ''),
    monitorUrl: String(input.monitorUrl || ''),
    monitorLabel: String(input.monitorLabel || 'Infrastructure monitor'),
    partners: normalizeStrings(input.partners),
    campaignKeywords: normalizeStrings(input.campaignKeywords),
    disclaimer: String(input.disclaimer || ''),
    donation: normalizeDonation(input.donation),
    correspondence: normalizeCorrespondence(input.correspondence),
    actions: normalizeRows(input.actions, ['title', 'body', 'href', 'label']),
    updates: normalizeRows(input.updates, ['date', 'title', 'body', 'url'], { booleanFields: ['pinned'] }),
    resources: normalizeRows(input.resources, ['type', 'title', 'description', 'href', 'label', 'imageUrl']),
    social: normalizeRows(input.social, ['platform', 'date', 'account', 'excerpt', 'url', 'imageUrl', 'language', 'languageCode']),
    graphics: normalizeRows(input.graphics, ['title', 'imageUrl', 'alt', 'caption', 'downloadUrl']),
    coverage: normalizeRows(input.coverage, ['date', 'outlet', 'title', 'translatedTitle', 'language', 'languageCode', 'url', 'summary']),
    signatories: normalizeRows(input.signatories, ['name', 'location', 'statement', 'url']),
    sources: normalizeRows(input.sources, ['title', 'publisher', 'url', 'note']),
    timeline: normalizeRows(input.timeline, ['date', 'title', 'body']),
    faq: normalizeRows(input.faq, ['question', 'answer']),
    translations: normalizeRows(input.translations, ['language', 'title', 'url']),
    sectionOrder: normalizeSectionOrder(input.sectionOrder),
    hiddenSections: normalizeSectionKeys(input.hiddenSections),
    sectionTitles: normalizeSectionTitles(input.sectionTitles),
    automation: normalizeAutomation(input.automation),
    createdAt: String(input.createdAt || now),
    updatedAt: String(input.updatedAt || now),
  }
}

function normalizeDonation(value) {
  const input = value && typeof value === 'object' ? value : {}
  return { url: String(input.url || ''), label: String(input.label || 'Donate'), platform: String(input.platform || ''), recipient: String(input.recipient || ''), explanation: String(input.explanation || ''), lastVerifiedAt: normalizeDate(input.lastVerifiedAt) }
}

function normalizeCorrespondence(value) {
  const input = value && typeof value === 'object' ? value : {}
  return { enabled: Boolean(input.enabled), publicQuestions: Boolean(input.publicQuestions), contributorLabel: String(input.contributorLabel || 'Field contributor'), editorLabel: String(input.editorLabel || 'SabotPress'), intro: String(input.intro || '') }
}

function normalizeAutomation(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    enabled: Boolean(input.enabled),
    discoverNews: Boolean(input.discoverNews),
    startAt: normalizeDate(input.startAt),
    blueskyActors: normalizeStrings(input.blueskyActors).slice(0, 12),
    mastodonAccounts: normalizeStrings(input.mastodonAccounts).slice(0, 12),
    coverageFeeds: normalizeStrings(input.coverageFeeds).slice(0, 20),
    signatoriesUrl: String(input.signatoriesUrl || '').trim(),
  }
}

function revisionRow(row) {
  let parsed = {}
  try { parsed = JSON.parse(row.revision_json || '{}') } catch { parsed = {} }
  return {
    id: String(row.id || ''),
    campaignId: String(row.campaign_id || ''),
    revisionNote: String(row.revision_note || 'save'),
    createdAt: String(row.created_at || ''),
    campaign: normalizeCampaign({ ...parsed, id: row.campaign_id }),
  }
}

function normalizeSectionOrder(value) {
  const requested = normalizeSectionKeys(value)
  return [...requested, ...CAMPAIGN_SECTION_KEYS.filter((key) => !requested.includes(key))]
}

function normalizeSectionKeys(value) {
  const values = Array.isArray(value) ? value : []
  return [...new Set(values.map((item) => String(item || '').trim()).filter((item) => CAMPAIGN_SECTION_KEYS.includes(item)))]
}

function normalizeSectionTitles(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return Object.fromEntries(CAMPAIGN_SECTION_KEYS.map((key) => [key, String(input[key] || '')]).filter(([, title]) => title))
}

export function buildCampaignRssXml({ campaign, requestUrl, dispatches = [] }) {
  const origin = new URL(requestUrl).origin
  const pageUrl = `${origin}/campaigns/${encodeURIComponent(campaign.slug)}`
  const selfUrl = `${origin}/feeds/campaigns/${encodeURIComponent(campaign.slug)}.xml`
  const items = [...(campaign.updates || []), ...dispatches.map((item) => ({ id: `dispatch-${item.id}`, date: item.createdAt, title: item.displayName ? `Dispatch from ${item.displayName}` : 'Field dispatch', body: item.body || (item.mediaType ? `${item.mediaType} dispatch` : ''), url: `${pageUrl}#dispatches`, mediaUrl: item.mediaUrl, mediaType: item.mediaType }))]
    .filter((item) => item.title || item.body)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))

  const xmlItems = items.map((item) => {
    const link = item.url ? absoluteUrl(item.url, origin) : `${pageUrl}#updates`
    const guid = `${campaign.slug}:${item.id}`
    const pubDate = validRssDate(item.date || campaign.updatedAt)
    const enclosure = item.mediaUrl && ['audio', 'video'].includes(item.mediaType) ? `\n      <enclosure url="${xml(item.mediaUrl)}" type="${item.mediaType === 'audio' ? 'audio/webm' : 'video/webm'}" />` : ''
    return `    <item>\n      <title>${xml(item.title || 'Campaign update')}</title>\n      <link>${xml(link)}</link>\n      <guid isPermaLink="false">${xml(guid)}</guid>\n      <pubDate>${xml(pubDate)}</pubDate>\n      <description>${xml(item.body || '')}</description>${enclosure}\n    </item>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>${xml(`${campaign.shortTitle || campaign.title} — Campaign Updates`)}</title>\n    <link>${xml(pageUrl)}</link>\n    <description>${xml(campaign.deck || campaign.summary || campaign.title)}</description>\n    <language>en</language>\n    <atom:link href="${xml(selfUrl)}" rel="self" type="application/rss+xml" />\n    <lastBuildDate>${xml(validRssDate(campaign.updatedAt))}</lastBuildDate>\n${xmlItems}\n  </channel>\n</rss>`
}

function rowToCampaign(row) {
  let parsed = {}
  try { parsed = JSON.parse(row.campaign_json || '{}') } catch { parsed = {} }
  return normalizeCampaign({
    ...parsed,
    id: row.id,
    slug: row.slug,
    status: row.status,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function normalizeRows(value, fields, options = {}) {
  const rows = Array.isArray(value) ? value : []
  const booleanFields = options.booleanFields || []
  return rows.map((row = {}) => {
    const next = { id: String(row.id || `row-${randomId()}`) }
    for (const field of fields) next[field] = String(row[field] || '')
    for (const field of booleanFields) next[field] = Boolean(row[field])
    return next
  })
}

function normalizeStrings(value) {
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
}

function normalizeDate(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const time = new Date(raw).getTime()
  return Number.isFinite(time) ? new Date(time).toISOString() : raw
}

function normalizeTimeZone(value) {
  const zone = String(value || 'UTC').trim()
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format()
    return zone
  } catch {
    return 'UTC'
  }
}

function validRssDate(value) {
  const date = new Date(value || Date.now())
  return Number.isFinite(date.getTime()) ? date.toUTCString() : new Date().toUTCString()
}

function absoluteUrl(value, origin) {
  try { return new URL(String(value || ''), origin).toString() } catch { return origin }
}

function xml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function randomId() {
  return crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10)
}
