export function getLatestPieces(pieces, limit = 9) {
  return [...pieces]
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, limit)
}

export function getFeaturedPiece(pieces) {
  const explicit = pieces.find((piece) => piece.featured === true)
  if (explicit) return explicit

  return getLatestPieces(pieces, 1)[0] || null
}

export function slugifyProject(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function deslugifyProject(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function isPublicProjectSlug(slug) {
  return slug && slug !== 'general'
}

export function buildProjectMap(pieces) {
  const counts = new Map()

  for (const piece of pieces) {
    const slug = piece.primaryProjectSlug || slugifyProject(piece.primaryProject || 'general')
    if (!isPublicProjectSlug(slug)) continue

    const name = piece.primaryProject || deslugifyProject(slug)
    const current = counts.get(slug) || { slug, name, count: 0 }
    current.count += 1
    counts.set(slug, current)
  }

  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function splitDisplayTitle(piece) {
  const rawTitle = String(piece?.title || '').trim()
  const existingSubtitle = String(piece?.subtitle || '').trim()

  if (existingSubtitle) {
    return { title: rawTitle, subtitle: existingSubtitle }
  }

  const parts = rawTitle.split(':').map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return {
      title: parts[0],
      subtitle: parts.slice(1).join(': '),
    }
  }

  return { title: rawTitle, subtitle: '' }
}

export function getProjectMeta(slug) {
  const key = String(slug || '').trim().toLowerCase()
  return { slug: key, name: deslugifyProject(key), kicker: 'project archive', description: 'Published entries grouped under this project.' }
}

export function buildTypeOptions(pieces) {
  return [...new Set(
    pieces
      .map((piece) => String(piece.type || '').trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b))
}
