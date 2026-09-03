import { PublicationAssetTypes, createAsset } from '../models/publication'

function uniqueAssets(assets = []) {
  const seen = new Set()
  return assets.filter((asset) => {
    const key = `${asset.type}:${asset.url || asset.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function discoverPostAssets(post) {
  if (!post) return []
  const legacy = post.legacy || {}
  const assets = []
  const hero = post.rendering?.heroImage || legacy.heroImage || legacy.featuredImage || legacy.imageUrl || ''

  if (hero) {
    assets.push(createAsset({ type: PublicationAssetTypes.HERO, role: 'hero', url: hero, title: post.title, source: 'post' }))
    assets.push(createAsset({ type: PublicationAssetTypes.FEATURED_IMAGE, role: 'featuredImage', url: hero, title: post.title, source: 'post' }))
    assets.push(createAsset({ type: PublicationAssetTypes.THUMBNAIL, role: 'thumbnail', url: hero, title: post.title, source: 'post' }))
  }

  if (post.rendering?.bodyHtml) {
    assets.push(createAsset({
      id: `readerHtml:${post.id}`,
      type: PublicationAssetTypes.READER_HTML,
      role: 'reader',
      title: post.title,
      source: 'renderer',
      metadata: { html: post.rendering.bodyHtml },
    }))
  }

  for (const link of legacy.relatedPrintLinks || []) {
    const url = typeof link === 'string' ? link : link?.url
    if (!url) continue
    assets.push(createAsset({
      type: PublicationAssetTypes.PRINT_PDF,
      role: 'print',
      title: typeof link === 'string' ? post.title : link.title || post.title,
      url,
      source: 'legacy',
    }))
  }

  for (const item of legacy.relatedAssets || legacy.assets || []) {
    if (!item) continue
    assets.push(createAsset({
      id: item.id,
      type: item.assetType || item.type || PublicationAssetTypes.DOWNLOAD,
      role: item.role || item.assetType || item.type || PublicationAssetTypes.DOWNLOAD,
      title: item.title || item.name || post.title,
      url: item.url || item.href || '',
      mimeType: item.mimeType || item.contentType || '',
      alt: item.alt || item.altText || '',
      caption: item.caption || '',
      source: item.source || 'legacy',
      metadata: item,
    }))
  }

  return uniqueAssets(assets)
}

export function attachPostAssets(post) {
  if (!post) return null
  return {
    ...post,
    assets: discoverPostAssets(post),
  }
}

export function getAssetsByType(item, type) {
  return (item?.assets || []).filter((asset) => asset.type === type || asset.role === type)
}

export function getFirstAsset(item, preferredTypes = []) {
  const assets = item?.assets || []
  for (const type of preferredTypes) {
    const found = assets.find((asset) => asset.type === type || asset.role === type)
    if (found) return found
  }
  return assets[0] || null
}
