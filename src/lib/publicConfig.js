import { publicSiteDefaults } from '../content/publicSiteDefaults'
import { mergePublicConfig as mergeSchemaConfigs, normalizePublicConfig } from './publicConfigSchema'

const STORAGE_KEY = 'sabot-public-site-config-v1'

// Legacy browser cache helpers are retained only so old editor cleanup/import code
// can remove or inspect the cache. Published public rendering must never resolve
// from this storage because it makes site content differ by device.
export function getStoredPublicConfig() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? normalizePublicConfig(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function setStoredPublicConfig(config) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizePublicConfig(config)))
  } catch {
    // Legacy editor cache only. D1 remains authoritative.
  }
}

export function clearStoredPublicConfig() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function mergePublicConfig(base, patch) {
  return mergeSchemaConfigs(base, patch)
}

export function resolvePublicConfig(runtimeConfig = {}) {
  return mergeSchemaConfigs(publicSiteDefaults, runtimeConfig || {})
}

export function getConfiguredText(config, field, fallback = '') {
  return config?.text?.[field] ?? fallback
}

export function getConfiguredStyle(config, field) {
  return config?.styles?.[field] || {}
}

export function getConfiguredBlock(config, path) {
  const parts = String(path || '').split('.').filter(Boolean)
  let cur = config?.blocks || {}
  for (const part of parts) {
    cur = cur?.[part]
    if (!cur) return null
  }
  return cur
}
