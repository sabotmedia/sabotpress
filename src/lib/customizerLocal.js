import { DEFAULT_MENU_ITEMS } from './wpAdminLocal'

export const CUSTOMIZER_KEY = 'sabot-wp-clone-customizer-v1'

export const DEFAULT_CUSTOMIZER_SETTINGS = {
  siteIdentity: {
    siteTitle: 'SabotPress',
    tagline: 'Radical media and publishing',
    logoUrl: '',
  },
  colors: {
    backgroundColor: '#ffffff',
    accentColor: '#3858e9',
    textColor: '#1d2327',
  },
  masthead: {
    mastheadSize: 'medium',
    navPosition: 'below',
    logoUrl: '',
  },
  navigation: {
    menuItems: DEFAULT_MENU_ITEMS.map((item) => ({
      id: item.id,
      label: item.label,
      path: item.to,
    })),
  },
  homepage: {
    homepageSource: 'latest',
    featuredLayout: 'grid',
    postsPerPage: 12,
  },
}

function normalizeMenuItems(items) {
  if (!Array.isArray(items)) return DEFAULT_CUSTOMIZER_SETTINGS.navigation.menuItems

  const normalized = items
    .map((item, index) => {
      const label = String(item?.label || '').trim()
      const path = String(item?.path || item?.to || '').trim()
      if (!label || !path) return null

      return {
        id: item?.id || `menu-${index + 1}`,
        label,
        path,
      }
    })
    .filter(Boolean)

  return normalized.length ? normalized : DEFAULT_CUSTOMIZER_SETTINGS.navigation.menuItems
}

export function loadCustomizerSettings() {
  try {
    const raw = window.localStorage.getItem(CUSTOMIZER_KEY)
    const parsed = raw ? JSON.parse(raw) : {}

    return {
      ...DEFAULT_CUSTOMIZER_SETTINGS,
      ...parsed,
      siteIdentity: {
        ...DEFAULT_CUSTOMIZER_SETTINGS.siteIdentity,
        ...(parsed?.siteIdentity || {}),
      },
      colors: {
        ...DEFAULT_CUSTOMIZER_SETTINGS.colors,
        ...(parsed?.colors || {}),
      },
      masthead: {
        ...DEFAULT_CUSTOMIZER_SETTINGS.masthead,
        ...(parsed?.masthead || {}),
      },
      navigation: {
        ...DEFAULT_CUSTOMIZER_SETTINGS.navigation,
        ...(parsed?.navigation || {}),
        menuItems: normalizeMenuItems(parsed?.navigation?.menuItems),
      },
      homepage: {
        ...DEFAULT_CUSTOMIZER_SETTINGS.homepage,
        ...(parsed?.homepage || {}),
      },
    }
  } catch {
    return DEFAULT_CUSTOMIZER_SETTINGS
  }
}

export function saveCustomizerSettings(settings) {
  const merged = {
    ...DEFAULT_CUSTOMIZER_SETTINGS,
    ...(settings || {}),
    navigation: {
      ...DEFAULT_CUSTOMIZER_SETTINGS.navigation,
      ...(settings?.navigation || {}),
      menuItems: normalizeMenuItems(settings?.navigation?.menuItems),
    },
  }

  try {
    window.localStorage.setItem(CUSTOMIZER_KEY, JSON.stringify(merged))
  } catch {
    // local scaffold only
  }

  return merged
}
