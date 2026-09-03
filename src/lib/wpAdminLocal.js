const MENUS_KEY = 'sabot-wp-clone-menu-v1'
const SETTINGS_KEY = 'sabot-wp-clone-settings-v1'
const QUICK_DRAFTS_KEY = 'sabot-wp-clone-quick-drafts-v1'
const USER_ROLES_KEY = 'sabot-wp-clone-user-roles-v1'

export const DEFAULT_MENU_ITEMS = [
  { id: 'archive', label: 'Archive', to: '/archive' },
  { id: 'press', label: 'Press', to: '/press' },
]

export const DEFAULT_SETTINGS = {
  siteTitle: 'SabotPress',
  tagline: 'Internal WordPress-classic admin clone',
  homepageSource: 'updates',
  postsPerPage: 10,
  defaultPostType: 'dispatch',
  mediaMode: 'local-only',
}

export const WP_ROLE_OPTIONS = [
  'Administrator',
  'Editor',
  'Author',
  'Contributor',
  'Subscriber',
]

export const DEFAULT_LOCAL_USERS = [
  {
    id: 'local-editor',
    username: 'local-editor',
    displayName: 'Local Editor',
    email: 'local-editor@sabot.local',
    role: 'Editor',
    source: 'local placeholder',
  },
]

function readLocalJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export function loadMenuDraft() {
  const loaded = readLocalJson(MENUS_KEY, DEFAULT_MENU_ITEMS)
  return Array.isArray(loaded) ? loaded : DEFAULT_MENU_ITEMS
}

export function saveMenuDraft(items) {
  const normalized = Array.isArray(items) ? items : DEFAULT_MENU_ITEMS
  try {
    window.localStorage.setItem(MENUS_KEY, JSON.stringify(normalized))
  } catch {
    // ignore local storage failures
  }
  return normalized
}

export function loadWpSettings() {
  const loaded = readLocalJson(SETTINGS_KEY, DEFAULT_SETTINGS)
  return { ...DEFAULT_SETTINGS, ...(loaded || {}) }
}

export function saveWpSettings(settings) {
  const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) }
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged))
  } catch {
    // ignore local storage failures
  }
  return merged
}

export function loadQuickDrafts() {
  const loaded = readLocalJson(QUICK_DRAFTS_KEY, [])
  return Array.isArray(loaded) ? loaded : []
}

export function saveQuickDraft(entry) {
  const next = [
    {
      id: `quick-${Math.random().toString(36).slice(2, 8)}`,
      title: String(entry?.title || '').trim() || 'Untitled quick draft',
      content: String(entry?.content || ''),
      createdAt: new Date().toISOString(),
    },
    ...loadQuickDrafts(),
  ].slice(0, 12)

  try {
    window.localStorage.setItem(QUICK_DRAFTS_KEY, JSON.stringify(next))
  } catch {
    // ignore local storage failures
  }

  return next
}

export function loadUserRoleSettings() {
  const loaded = readLocalJson(USER_ROLES_KEY, DEFAULT_LOCAL_USERS)
  if (!Array.isArray(loaded)) return DEFAULT_LOCAL_USERS

  const normalized = loaded
    .filter((entry) => entry && entry.id)
    .map((entry) => ({
      id: String(entry.id),
      username: String(entry.username || entry.id),
      displayName: String(entry.displayName || entry.username || entry.id),
      email: String(entry.email || `${entry.username || entry.id}@sabot.local`),
      role: WP_ROLE_OPTIONS.includes(entry.role) ? entry.role : 'Editor',
      source: String(entry.source || 'local placeholder'),
    }))

  if (!normalized.length) return DEFAULT_LOCAL_USERS
  return normalized
}

export function saveUserRoleSettings(items) {
  const normalized = Array.isArray(items) ? items : DEFAULT_LOCAL_USERS
  try {
    window.localStorage.setItem(USER_ROLES_KEY, JSON.stringify(normalized))
  } catch {
    // ignore local storage failures
  }
  return normalized
}
