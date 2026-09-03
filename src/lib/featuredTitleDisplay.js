export const FEATURED_TITLE_DISPLAY_VALUES = ['overlay', 'below', 'hidden']

export function normalizeFeaturedTitleDisplay(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return FEATURED_TITLE_DISPLAY_VALUES.includes(normalized) ? normalized : ''
}

export function getDefaultFeaturedTitleDisplayForContentType(value) {
  const type = String(value || '').trim().toLowerCase()
  if (['print', 'zine', 'comic', 'podcast', 'poster'].some((term) => type.includes(term))) return 'hidden'
  return 'below'
}

export function resolveFeaturedTitleDisplay(piece = {}) {
  const explicit = normalizeFeaturedTitleDisplay(piece.featuredTitleDisplay)
  if (explicit) return explicit

  const haystack = [
    piece.type,
    piece.contentType,
    piece.sourcePostType,
    piece.sourceKind,
    piece.sourceLabel,
    piece.primaryProject,
    piece.primaryProjectSlug,
    piece.target,
    piece.title,
    piece.slug,
    ...(Array.isArray(piece.projects) ? piece.projects : []),
    ...(Array.isArray(piece.categories) ? piece.categories : []),
    ...(Array.isArray(piece.tags) ? piece.tags : []),
  ]
    .map((item) => String(item || '').toLowerCase())
    .join(' ')

  if (/\b(zine|comic|podcast|poster|reader|manifesto)\b/.test(haystack)) return 'hidden'
  if (haystack.includes('grays harbor sos')) return 'hidden'
  if (haystack.includes('the saboteurs')) return 'hidden'
  if (haystack.includes('molotov now')) return 'hidden'
  if (haystack.includes('the communique') || haystack.includes('communique')) return 'hidden'

  return 'below'
}
