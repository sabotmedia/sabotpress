export const PUBLIC_POST_ROUTE_PATTERN = '/post/:slug'

const SLUG_TOKEN = ':slug'

function normalizeSlug(rawSlug) {
  return String(rawSlug || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
}

export function buildPublicPostPath(rawSlug) {
  const slug = normalizeSlug(rawSlug)

  if (!slug) {
    return PUBLIC_POST_ROUTE_PATTERN.replace(`/${SLUG_TOKEN}`, '')
  }

  return PUBLIC_POST_ROUTE_PATTERN.replace(SLUG_TOKEN, encodeURIComponent(slug))
}

export function buildPublicPostUrl({ origin, slug }) {
  const safeOrigin = String(origin || '').trim() || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173')
  try {
    return new URL(buildPublicPostPath(slug), safeOrigin).toString()
  } catch {
    const fallbackOrigin = safeOrigin.replace(/\/+$/, '')
    return `${fallbackOrigin}${buildPublicPostPath(slug)}`
  }
}

export function isPreviewDirty(savedSlug, inputSlug) {
  return normalizeSlug(savedSlug) !== normalizeSlug(inputSlug)
}
