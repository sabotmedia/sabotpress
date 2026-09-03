export const PUBLIC_CONFIG_SCHEMA_VERSION = 2

const FIELD_KEY_RE = /^[a-z0-9]+(\.[a-z0-9-]+)+$/

export function normalizePublicConfig(input) {
  const raw = input || {}

  const text = sanitizeTextMap(raw.text || {})
  const styles = sanitizeStyleMap(raw.styles || {})
  const blocks = sanitizeBlocks(raw.blocks || {})

  return {
    version: PUBLIC_CONFIG_SCHEMA_VERSION,
    text,
    styles,
    blocks,
  }
}

export function sanitizeTextMap(input) {
  const out = {}

  for (const [key, value] of Object.entries(input || {})) {
    if (!isValidFieldKey(key)) continue
    out[key] = typeof value === 'string' ? value : String(value ?? '')
  }

  return out
}

export function sanitizeStyleMap(input) {
  const out = {}

  for (const [field, styleObj] of Object.entries(input || {})) {
    if (!isValidFieldKey(field)) continue
    if (!styleObj || typeof styleObj !== 'object' || Array.isArray(styleObj)) continue

    const next = {}
    const fontSize = normalizeCssSize(styleObj.fontSize, 'rem')
    const lineHeight = normalizeNumberString(styleObj.lineHeight, 0.7, 3)
    const maxWidth = normalizeCssSize(styleObj.maxWidth, 'ch')
    const letterSpacing = normalizeCssSize(styleObj.letterSpacing, 'em')
    const textTransform = normalizeEnum(styleObj.textTransform, ['none', 'uppercase', 'lowercase', 'capitalize'])

    if (fontSize) next.fontSize = fontSize
    if (lineHeight) next.lineHeight = lineHeight
    if (maxWidth) next.maxWidth = maxWidth
    if (letterSpacing) next.letterSpacing = letterSpacing
    if (textTransform) next.textTransform = textTransform

    if (Object.keys(next).length) {
      out[field] = next
    }
  }

  return out
}

export function sanitizeBlocks(input) {
  return deepClonePlainObject(input || {})
}

export function mergePublicConfig(base, patch) {
  const normalizedBase = normalizePublicConfig(base)
  const normalizedPatch = normalizePublicConfig(patch)

  return {
    version: PUBLIC_CONFIG_SCHEMA_VERSION,
    text: {
      ...normalizedBase.text,
      ...normalizedPatch.text,
    },
    styles: {
      ...normalizedBase.styles,
      ...normalizedPatch.styles,
    },
    blocks: deepMergeObjects(normalizedBase.blocks, normalizedPatch.blocks),
  }
}

export function validatePublicConfig(input) {
  const errors = []
  const warnings = []

  const raw = input || {}

  if (raw.text && typeof raw.text !== 'object') {
    errors.push('text must be an object')
  }

  if (raw.styles && typeof raw.styles !== 'object') {
    errors.push('styles must be an object')
  }

  if (raw.blocks && typeof raw.blocks !== 'object') {
    errors.push('blocks must be an object')
  }

  for (const key of Object.keys(raw.text || {})) {
    if (!isValidFieldKey(key)) {
      warnings.push(`invalid text key skipped: ${key}`)
    }
  }

  for (const key of Object.keys(raw.styles || {})) {
    if (!isValidFieldKey(key)) {
      warnings.push(`invalid style key skipped: ${key}`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized: normalizePublicConfig(raw),
  }
}

export function isValidFieldKey(key) {
  return typeof key === 'string' && FIELD_KEY_RE.test(key)
}

function normalizeCssSize(value, unit) {
  if (value == null || value === '') return ''
  const str = String(value).trim()

  if (str.endsWith(unit)) {
    const n = Number(str.slice(0, -unit.length))
    if (Number.isFinite(n)) return `${n}${unit}`
    return ''
  }

  const n = Number(str)
  if (Number.isFinite(n)) return `${n}${unit}`

  return ''
}

function normalizeNumberString(value, min, max) {
  if (value == null || value === '') return ''
  const n = Number(String(value).trim())
  if (!Number.isFinite(n)) return ''
  if (n < min || n > max) return ''
  return String(n)
}

function normalizeEnum(value, allowed) {
  const str = String(value || '').trim().toLowerCase()
  return allowed.includes(str) ? str : ''
}

function deepClonePlainObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepClonePlainObject(v)
    } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v == null) {
      out[k] = v
    }
  }
  return out
}

function deepMergeObjects(base, patch) {
  const out = deepClonePlainObject(base)
  for (const [k, v] of Object.entries(deepClonePlainObject(patch))) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMergeObjects(out[k], v)
    } else {
      out[k] = v
    }
  }
  return out
}
