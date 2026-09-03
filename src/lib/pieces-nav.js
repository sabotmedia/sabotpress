export function getAdjacentPieces(pieces, currentSlug) {
  const ordered = [...pieces].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
  const index = ordered.findIndex((piece) => piece.slug === currentSlug)
  if (index === -1) return { previous: null, next: null }

  return {
    previous: ordered[index + 1] || null,
    next: ordered[index - 1] || null,
  }
}

export function getRelatedPieces(pieces, currentPiece, limit = 4) {
  return [...pieces]
    .filter((piece) => piece.slug !== currentPiece.slug)
    .map((piece) => {
      let score = 0
      if (piece.primaryProjectSlug === currentPiece.primaryProjectSlug) score += 3
      if (piece.type === currentPiece.type) score += 2
      const sharedTags = (piece.tags || []).filter((tag) => (currentPiece.tags || []).includes(tag)).length
      score += sharedTags
      return { piece, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.piece.publishedAt) - new Date(a.piece.publishedAt))
    .slice(0, limit)
    .map((entry) => entry.piece)
}
