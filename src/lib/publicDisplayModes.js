const DEFAULT_NATIVE_DISPLAY = {
  enableReadMode: true,
  enableExperienceMode: true,
  enablePrintMode: true,
  defaultMode: 'read',
  heroStyle: 'default',
}

function normalizeBoolean(value, fallback = true) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return fallback
}

export function normalizeNativeDisplaySettings(input = {}) {
  const enableReadMode = normalizeBoolean(input.enableReadMode, true)
  const enableExperienceMode = normalizeBoolean(input.enableExperienceMode, true)
  const enablePrintMode = normalizeBoolean(input.enablePrintMode, true)
  const requestedDefault = String(input.defaultMode || 'read')
  const defaultMode = ['read', 'experience', 'print'].includes(requestedDefault) ? requestedDefault : 'read'
  const heroStyle = String(input.heroStyle || 'default').trim() || 'default'

  const normalized = {
    enableReadMode,
    enableExperienceMode,
    enablePrintMode,
    defaultMode,
    heroStyle,
  }

  if (!normalized.enableReadMode && !normalized.enableExperienceMode && !normalized.enablePrintMode) {
    normalized.enableReadMode = true
  }

  if (normalized.defaultMode === 'print' && !normalized.enablePrintMode) {
    normalized.defaultMode = normalized.enableReadMode ? 'read' : normalized.enableExperienceMode ? 'experience' : 'read'
  }
  if (normalized.defaultMode === 'experience' && !normalized.enableExperienceMode) {
    normalized.defaultMode = normalized.enableReadMode ? 'read' : normalized.enablePrintMode ? 'print' : 'read'
  }
  if (normalized.defaultMode === 'read' && !normalized.enableReadMode) {
    normalized.defaultMode = normalized.enableExperienceMode ? 'experience' : normalized.enablePrintMode ? 'print' : 'read'
  }

  return normalized
}

export function getPieceDisplaySettings(piece) {
  const isNative = piece?.sourceKind === 'native' || piece?.sourcePostType === 'native'
  if (!isNative) return { ...DEFAULT_NATIVE_DISPLAY }
  return normalizeNativeDisplaySettings(piece || {})
}

export function resolveFirstReadableMode(settings) {
  if (settings.enableReadMode) return 'read'
  if (settings.enableExperienceMode) return 'experience'
  return 'read'
}

