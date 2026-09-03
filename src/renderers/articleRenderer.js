import { PublicationAssetTypes } from '../models/publication'
import { getFirstAsset } from '../assets/assetSystem'

export function renderArticle(post, options = {}) {
  const heroAsset = getFirstAsset(post, [PublicationAssetTypes.HERO, PublicationAssetTypes.FEATURED_IMAGE])
  const metadata = [
    { label: 'Author', value: post.author },
    { label: 'Published', value: post.publishedDateLabel || post.publishedAt },
    { label: 'Project', value: post.project?.title },
    { label: 'Type', value: post.kind },
  ].filter((item) => String(item.value || '').trim())

  return {
    renderer: 'article',
    postId: post.id,
    slug: post.slug,
    title: post.title,
    subtitle: post.subtitle,
    excerpt: post.excerpt,
    eyebrow: post.project?.title || post.kind || 'publication',
    bodyHtml: post.rendering?.bodyHtml || '',
    hero: heroAsset,
    metadata,
    assets: post.assets || [],
    options: {
      mode: options.mode || 'read',
      showHero: options.showHero !== false,
      showMetadata: options.showMetadata !== false,
      showExcerpt: options.showExcerpt !== false,
    },
  }
}
