export function getImportedImage(piece) {
  if (piece?.featuredImage) return piece.featuredImage
  if (piece?.featured_image) return piece.featured_image
  if (piece?.heroImage) return piece.heroImage
  if (piece?.imageUrl) return piece.imageUrl
  if (piece?.image) return piece.image

  const assets = Array.isArray(piece?.relatedAssets) ? piece.relatedAssets : []

  const imgAsset = assets.find((a) => {
    const kind = String(a?.kind || a?.type || '').toLowerCase()
    return kind.includes('image')
  })

  if (imgAsset?.url) return imgAsset.url
  if (imgAsset?.src) return imgAsset.src

  const html = String(piece?.bodyHtml || '')
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (match) return match[1]

  return null
}
