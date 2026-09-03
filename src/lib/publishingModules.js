const CACHE_KEY = 'sabotpress-publishing-setup-v1'
const CHANGE_EVENT = 'sabotpress:publishing-setup'

export const PUBLISHING_MODULES = [
  { id: 'articles', label: 'Articles', description: 'Posts, pages, collections, taxonomy and editorial review.' },
  { id: 'podcasts', label: 'Podcasts', description: 'Podcast shows, episodes and feeds.' },
  { id: 'campaigns', label: 'Campaigns', description: 'Campaign hubs, updates, resources and coverage.' },
  { id: 'publications', label: 'Publications', description: 'Zines, readers, editions and print collections.' },
  { id: 'translations', label: 'Translations', description: 'Translation workflow and language variants.' },
  { id: 'printlab', label: 'PrintLab', description: 'Printable layouts, posters and PDF-oriented work.' },
  { id: 'audiolab', label: 'AudioLab', description: 'Audio editing and production tools.' },
]

export const PUBLISHING_PRESETS = {
  simple: { label: 'Simple Blog', modules: ['articles'] },
  media: { label: 'Media Publication', modules: ['articles', 'podcasts', 'translations'] },
  everything: { label: 'Everything', modules: PUBLISHING_MODULES.map((item) => item.id) },
}

export const DEFAULT_PUBLISHING_SETUP = {
  firstRunComplete: false,
  preset: 'simple',
  modules: [...PUBLISHING_PRESETS.simple.modules],
  identity: { name: 'SabotPress', description: '', logoUrl: '', primaryEditor: '' },
}

function normalize(raw = {}) {
  const allowed = new Set(PUBLISHING_MODULES.map((item) => item.id))
  const requested = Array.isArray(raw.modules) ? raw.modules.filter((id) => allowed.has(id)) : DEFAULT_PUBLISHING_SETUP.modules
  return {
    firstRunComplete: Boolean(raw.firstRunComplete),
    preset: ['simple', 'media', 'everything', 'custom'].includes(raw.preset) ? raw.preset : 'custom',
    modules: requested.length ? [...new Set(requested)] : ['articles'],
    identity: {
      name: String(raw.identity?.name || 'SabotPress').trim() || 'SabotPress',
      description: String(raw.identity?.description || '').trim(),
      logoUrl: String(raw.identity?.logoUrl || '').trim(),
      primaryEditor: String(raw.identity?.primaryEditor || '').trim(),
    },
  }
}

function readCache() {
  try { return normalize(JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')) } catch { return normalize(DEFAULT_PUBLISHING_SETUP) }
}
function writeCache(value) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); return true } catch { return false } }
function announce(value) { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value })) }

export function publishingModulesChangeEvent() { return CHANGE_EVENT }
export function getPublishingSetup() { return readCache() }
export function getPublishingModulePrefs() { return getPublishingSetup() }
export function getPublicationIdentity() { return getPublishingSetup().identity }
export function isFirstRunComplete() { return getPublishingSetup().firstRunComplete }
export function isPublishingModuleEnabled(id, setup = getPublishingSetup()) { return !id || setup.modules.includes(id) }

export async function hydratePublishingSetup() {
  const response = await fetch('/api/publishing-setup', { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`Setup could not be loaded (${response.status})`)
  const data = await response.json()
  const setup = normalize(data.setup || {})
  writeCache(setup)
  announce(setup)
  return setup
}

export async function savePublishingSetup(input) {
  const setup = normalize(input)
  const response = await fetch('/api/publishing-setup', {
    method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ setup }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `Setup could not be saved (${response.status})`)
  }
  const data = await response.json()
  const saved = normalize(data.setup || setup)
  writeCache(saved)
  announce(saved)
  return saved
}

export function setupFromPreset(preset, current = getPublishingSetup()) {
  const selected = PUBLISHING_PRESETS[preset]
  if (!selected) return { ...current, preset: 'custom' }
  return { ...current, preset, modules: [...selected.modules] }
}
