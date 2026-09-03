function toTime(value) {
  const t = new Date(value || 0).getTime()
  return Number.isFinite(t) ? t : 0
}

function isExplicitGlobalFeatured(piece) {
  return piece?.featured === true
}

function isExplicitProjectFeatured(piece, slug) {
  if (!piece) return false
  if ((piece.primaryProjectSlug || '') !== slug) return false
  if (piece.featuredProjects && Array.isArray(piece.featuredProjects)) {
    return piece.featuredProjects.includes(slug)
  }
  return piece.featured === true
}

export function getFeaturedPiece(pieces) {
  const explicit = (pieces || []).find((piece) => isExplicitGlobalFeatured(piece))
  if (explicit) {
    return {
      piece: explicit,
      source: 'explicit',
    }
  }

  const fallback = [...(pieces || [])].sort((a, b) => toTime(b.publishedAt) - toTime(a.publishedAt))[0] || null
  return {
    piece: fallback,
    source: fallback ? 'fallback' : 'none',
  }
}

export function getFeaturedPieceForProject(pieces, slug) {
  const lane = (pieces || []).filter((piece) => (piece.primaryProjectSlug || '') === slug)

  const explicit = lane.find((piece) => isExplicitProjectFeatured(piece, slug))
  if (explicit) {
    return {
      piece: explicit,
      source: 'explicit',
    }
  }

  const fallback = [...lane].sort((a, b) => toTime(b.publishedAt) - toTime(a.publishedAt))[0] || null
  return {
    piece: fallback,
    source: fallback ? 'fallback' : 'none',
  }
}

export function buildProjectFeaturedMap(pieces, projectMap) {
  const out = {}

  for (const project of projectMap || []) {
    out[project.slug] = getFeaturedPieceForProject(pieces, project.slug)
  }

  return out
}

export function countFeaturedSources(featuredMap) {
  let explicit = 0
  let fallback = 0

  for (const value of Object.values(featuredMap || {})) {
    if (value?.source === 'explicit') explicit += 1
    if (value?.source === 'fallback') fallback += 1
  }

  return { explicit, fallback }
}
