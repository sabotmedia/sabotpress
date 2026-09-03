import { CAMPAIGN_SECTION_KEYS, CAMPAIGN_SECTION_LABELS } from './campaignSections.js'

export { CAMPAIGN_SECTION_KEYS, CAMPAIGN_SECTION_LABELS }

export const CAMPAIGN_TIME_ZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/Rome', label: 'Italy time' },
  { value: 'Asia/Gaza', label: 'Gaza time' },
  { value: 'UTC', label: 'UTC' },
]

export function deadlineInputValue(value, timeZone = 'UTC') {
  const date = new Date(value || '')
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: validTimeZone(timeZone),
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

export function deadlineIsoValue(value, timeZone = 'UTC') {
  return validateDeadlineWallTime(value, timeZone).iso
}

export function validateDeadlineWallTime(value, timeZone = 'UTC') {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return { iso: '', error: value ? 'Enter a complete date and time.' : '' }
  const target = match.slice(1).map(Number)
  const targetAsUtc = Date.UTC(target[0], target[1] - 1, target[2], target[3], target[4])
  let instant = targetAsUtc
  const zone = validTimeZone(timeZone)

  for (let pass = 0; pass < 2; pass += 1) {
    const parts = zonedParts(new Date(instant), zone)
    const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
    instant += targetAsUtc - representedAsUtc
  }
  const iso = new Date(instant).toISOString()
  if (deadlineInputValue(iso, zone) !== String(value)) {
    return { iso: '', error: 'That local time does not exist in the selected timezone because of a daylight-saving change.' }
  }
  return { iso, error: '' }
}

export function campaignSlug(value) {
  return String(value || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function blankCampaign() {
  const token = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 12)
  return {
    id: `campaign-${token}`,
    slug: '',
    status: 'draft',
    campaignStatus: 'active',
    lifecycleStatus: 'active',
    campaignType: 'advocacy',
    kicker: '', title: '', shortTitle: '', deck: '', summary: '',
    deadline: '', deadlineTimeZone: 'America/New_York',
    heroImage: '', heroAlt: '', monitorUrl: '', monitorLabel: 'Infrastructure monitor',
    partners: [], campaignKeywords: [], disclaimer: '',
    donation: { url: '', label: 'Donate', platform: '', recipient: '', explanation: '', lastVerifiedAt: '' },
    correspondence: { enabled: false, publicQuestions: false, contributorLabel: 'Field contributor', editorLabel: 'SabotPress', intro: '' },
    actions: [], updates: [], resources: [], social: [], graphics: [], coverage: [],
    signatories: [], sources: [], timeline: [], faq: [], translations: [],
    sectionOrder: [...CAMPAIGN_SECTION_KEYS],
    hiddenSections: [...CAMPAIGN_SECTION_KEYS],
    sectionTitles: {},
    automation: { enabled: false, discoverNews: false, startAt: '', blueskyActors: [], mastodonAccounts: [], coverageFeeds: [], signatoriesUrl: '' },
  }
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const number = (type) => Number(parts.find((item) => item.type === type)?.value || 0)
  return { year: number('year'), month: number('month'), day: number('day'), hour: number('hour'), minute: number('minute') }
}

function validTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format()
    return value
  } catch {
    return 'UTC'
  }
}
