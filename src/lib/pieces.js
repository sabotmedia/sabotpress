import imported from '../content/pieces.imported.json'
import overrides from '../content/piece-overrides.json'

export function getPieces() {
  const items = imported.items || []
  return items
    .map((piece) => mergePiece(piece, overrides[piece.slug] || {}))
    .filter((piece) => piece.hidden !== true)
}

export function mergePiece(piece, override) {
  const merged = {
    ...piece,
    ...override,
    tags: override.tags || piece.tags || [],
    relatedPrintLinks: override.relatedPrintLinks || piece.relatedPrintLinks || [],
    relatedAssets: override.relatedAssets || piece.relatedAssets || [],
    audioSummary: override.audioSummary || piece.audioSummary || '',
    transcriptExcerpt: override.transcriptExcerpt || piece.transcriptExcerpt || '',
    sourceNotes: override.sourceNotes || piece.sourceNotes || '',
    heroImage: override.heroImage || piece.heroImage || '',
    featured: override.featured === true || piece.featured === true,
    hidden: override.hidden === true || piece.hidden === true,
  }

  return {
    ...merged,
    reviewFlags: getReviewFlags(merged),
  }
}

export function getReviewFlags(piece) {
  const flags = []

  if (!piece.excerpt || piece.excerpt.trim().length < 40) flags.push('weak excerpt')
  if (!piece.subtitle || piece.subtitle.trim().length < 8) flags.push('weak subtitle')
  if (!piece.primaryProjectSlug || piece.primaryProjectSlug === 'general') flags.push('unassigned project')
  if (piece.type === 'podcast' && !(piece.bodyHtml || '').match(/youtube|spotify|soundcloud|acast|peertube/i)) {
    flags.push('podcast without media source')
  }
  if (piece.type === 'podcast' && !piece.transcriptExcerpt && !piece.audioSummary) {
    flags.push('podcast needs transcript or summary')
  }
  if ((piece.type === 'comic' || piece.type === 'zine') && !piece.hasPrintAssets) {
    flags.push('print asset missing')
  }
  if (piece.hidden === true) {
    flags.push('hidden')
  }

  return flags
}

export function getReviewQueue(pieces) {
  return [...pieces]
    .filter((piece) => piece.reviewFlags?.length)
    .sort((a, b) => b.reviewFlags.length - a.reviewFlags.length || new Date(b.publishedAt) - new Date(a.publishedAt))
}
