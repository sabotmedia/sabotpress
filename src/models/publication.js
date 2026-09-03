import { getImportedImage } from '../lib/getImportedImage'
import { splitDisplayTitle, slugifyProject } from '../lib/content'

export const PUBLICATION_MODEL_VERSION = '1.0.0'

export const ContentKinds = Object.freeze({
  ARTICLE: 'article',
  COMIC: 'comic',
  PODCAST: 'podcast',
  NEWSLETTER: 'newsletter',
  ZINE: 'zine',
  POSTER: 'poster',
  TILE_SHEET: 'tileSheet',
  PRINT_LAYOUT: 'printLayout',
  CANVAS: 'canvas',
})

export const PublicationAssetTypes = Object.freeze({
  READER_HTML: 'readerHtml',
  READER_PDF: 'readerPdf',
  PRINT_PDF: 'printPdf',
  BOOKLET_PDF: 'bookletPdf',
  COVER_IMAGE: 'coverImage',
  THUMBNAIL: 'thumbnail',
  HERO: 'hero',
  FEATURED_IMAGE: 'featuredImage',
  AUDIO: 'audio',
  VIDEO: 'video',
  DOWNLOAD: 'download',
})

export function createPublication(overrides = {}) {
  return {
    id: overrides.id || 'sabot-media',
    slug: overrides.slug || 'sabot-media',
    title: overrides.title || 'SabotPress',
    description: overrides.description || '',
    modelVersion: PUBLICATION_MODEL_VERSION,
    issues: Array.isArray(overrides.issues) ? overrides.issues : [],
    posts: Array.isArray(overrides.posts) ? overrides.posts : [],
    pages: Array.isArray(overrides.pages) ? overrides.pages : [],
    projects: Array.isArray(overrides.projects) ? overrides.projects : [],
    collections: Array.isArray(overrides.collections) ? overrides.collections : [],
    media: Array.isArray(overrides.media) ? overrides.media : [],
    taxonomies: Array.isArray(overrides.taxonomies) ? overrides.taxonomies : [],
    printAssets: Array.isArray(overrides.printAssets) ? overrides.printAssets : [],
  }
}

export function createIssue(overrides = {}) {
  return {
    id: overrides.id || overrides.slug || '',
    slug: overrides.slug || overrides.id || '',
    title: overrides.title || 'Untitled Issue',
    status: overrides.status || 'draft',
    publishedAt: overrides.publishedAt || '',
    posts: Array.isArray(overrides.posts) ? overrides.posts : [],
    assets: Array.isArray(overrides.assets) ? overrides.assets : [],
  }
}

export function createAsset(overrides = {}) {
  return {
    id: overrides.id || `${overrides.type || 'asset'}:${overrides.url || overrides.href || ''}`,
    type: overrides.type || PublicationAssetTypes.DOWNLOAD,
    role: overrides.role || overrides.type || PublicationAssetTypes.DOWNLOAD,
    title: overrides.title || '',
    url: overrides.url || overrides.href || '',
    mimeType: overrides.mimeType || '',
    alt: overrides.alt || overrides.altText || '',
    caption: overrides.caption || '',
    source: overrides.source || 'publication',
    metadata: overrides.metadata && typeof overrides.metadata === 'object' ? overrides.metadata : {},
  }
}

export function createMedia(overrides = {}) {
  return {
    id: overrides.id || '',
    title: overrides.title || '',
    type: overrides.type || 'media',
    url: overrides.url || '',
    assets: Array.isArray(overrides.assets) ? overrides.assets : [],
    metadata: overrides.metadata && typeof overrides.metadata === 'object' ? overrides.metadata : {},
  }
}

export function createCollection(overrides = {}) {
  return {
    id: overrides.id || overrides.slug || '',
    slug: overrides.slug || overrides.id || '',
    title: overrides.title || 'Untitled Collection',
    description: overrides.description || '',
    items: Array.isArray(overrides.items) ? overrides.items : [],
    taxonomy: overrides.taxonomy || '',
  }
}

export function createProject(overrides = {}) {
  const slug = overrides.slug || slugifyProject(overrides.title || overrides.name || 'general')
  return {
    id: overrides.id || slug,
    slug,
    title: overrides.title || overrides.name || 'General',
    description: overrides.description || '',
    posts: Array.isArray(overrides.posts) ? overrides.posts : [],
    assets: Array.isArray(overrides.assets) ? overrides.assets : [],
  }
}

export function createTaxonomy(overrides = {}) {
  return {
    id: overrides.id || overrides.slug || '',
    slug: overrides.slug || overrides.id || '',
    label: overrides.label || overrides.name || 'Taxonomy',
    type: overrides.type || 'tag',
    terms: Array.isArray(overrides.terms) ? overrides.terms : [],
  }
}

export function createPrintAsset(overrides = {}) {
  return {
    id: overrides.id || `${overrides.layout || 'print'}:${overrides.slug || overrides.url || ''}`,
    slug: overrides.slug || '',
    layout: overrides.layout || 'article',
    sourcePostId: overrides.sourcePostId || '',
    assetType: overrides.assetType || PublicationAssetTypes.PRINT_PDF,
    url: overrides.url || '',
    options: overrides.options && typeof overrides.options === 'object' ? overrides.options : {},
  }
}

export function normalizeContentKind(piece = {}) {
  const raw = String(piece.contentType || piece.type || piece.sourcePostType || '').toLowerCase()
  if (raw.includes('comic')) return ContentKinds.COMIC
  if (raw.includes('podcast') || raw.includes('audio')) return ContentKinds.PODCAST
  if (raw.includes('newsletter') || raw.includes('communique')) return ContentKinds.NEWSLETTER
  if (raw.includes('zine')) return ContentKinds.ZINE
  if (raw.includes('poster')) return ContentKinds.POSTER
  if (raw.includes('tile')) return ContentKinds.TILE_SHEET
  if (raw.includes('canvas')) return ContentKinds.CANVAS
  if (raw.includes('print')) return ContentKinds.PRINT_LAYOUT
  return ContentKinds.ARTICLE
}

export function normalizePost(piece = {}) {
  const display = splitDisplayTitle(piece)
  const heroImage = piece.heroImage || piece.featuredImage || piece.imageUrl || piece.image || getImportedImage(piece) || ''
  const publishedAt = piece.publishedAt || piece.date || piece.createdAt || piece.updatedAt || ''
  const slug = piece.slug || piece.id || ''
  const projectSlug = piece.primaryProjectSlug || slugifyProject(piece.primaryProject || piece.target || 'general')

  return {
    id: String(piece.id || piece.sourcePostId || slug || piece.title || ''),
    slug,
    title: display.title || piece.title || slug || 'Untitled',
    subtitle: display.subtitle || piece.subtitle || '',
    excerpt: piece.excerpt || piece.dek || '',
    status: piece.status || (publishedAt ? 'published' : 'draft'),
    kind: normalizeContentKind(piece),
    author: piece.author || piece.byline || 'SabotPress',
    publishedAt,
    publishedDateLabel: piece.publishedDateLabel || '',
    source: {
      kind: piece.sourceKind || (piece.sourcePostType ? 'imported' : 'native'),
      postType: piece.sourcePostType || piece.type || '',
      postId: piece.sourcePostId || piece.id || '',
      title: piece.sourceTitle || '',
      url: piece.sourceUrl || '',
      raw: piece,
    },
    project: createProject({
      slug: projectSlug,
      title: piece.primaryProject || piece.target || 'General',
    }),
    taxonomy: {
      tags: Array.isArray(piece.tags) ? piece.tags : [],
      categories: Array.isArray(piece.categories) ? piece.categories : [],
    },
    editing: {
      richBody: Array.isArray(piece.richBody) ? piece.richBody : [],
      overrides: piece.overrides && typeof piece.overrides === 'object' ? piece.overrides : {},
    },
    rendering: {
      bodyHtml: piece.bodyHtml || piece.contentHtml || piece.content || piece.body || piece.html || '',
      heroImage,
      featuredTitleDisplay: piece.featuredTitleDisplay || '',
      displayMode: piece.displayMode || '',
      displaySettings: piece.displaySettings || null,
    },
    assets: [],
    printAssets: Array.isArray(piece.relatedPrintLinks) ? piece.relatedPrintLinks : [],
    legacy: piece,
  }
}

export function normalizePage(page = {}) {
  return {
    id: page.id || page.slug || '',
    slug: page.slug || page.id || '',
    title: page.title || 'Untitled Page',
    status: page.status || 'draft',
    bodyHtml: page.bodyHtml || page.content || '',
    assets: Array.isArray(page.assets) ? page.assets : [],
    editing: page.editing && typeof page.editing === 'object' ? page.editing : {},
    rendering: page.rendering && typeof page.rendering === 'object' ? page.rendering : {},
  }
}
