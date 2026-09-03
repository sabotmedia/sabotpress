import { getImportedImage } from './getImportedImage'
import { loadNativeCollection, slugify } from './nativePublicContent'
import { classicEditorBodyToHtml } from './classicEditorBody'

const PREVIEW_STORAGE_PREFIX = 'sabot-native-preview-v1:'

export function isPublishedNativeEntry(item) {
  if (!item) return false
  const status = String(item.status || '')
  if (!['published', 'scheduled'].includes(status)) return false
  if (item.scheduledFor) {
    const ms = new Date(item.scheduledFor).getTime()
    if (Number.isFinite(ms) && ms > Date.now()) return false
  }
  return true
}

export function normalizeNativePublicPiece(item) {
  const publishedAt = item.publishedAt || item.updatedAt || new Date().toISOString()
  const primaryProject =
    item.primaryProject ||
    (Array.isArray(item.projects) && item.projects[0]) ||
    (Array.isArray(item.categories) && item.categories[0]) ||
    (item.target && item.target !== 'projects' ? item.target : '') ||
    'General'
  const primaryProjectSlug = item.primaryProjectSlug || slugify(primaryProject) || 'general'
  const type =
    item.contentType === 'podcast'
      ? 'podcast'
      : item.contentType === 'print'
        ? 'print'
        : item.contentType === 'publicBlock'
          ? 'publicBlock'
          : 'article'

  const image =
    item.featuredImage ||
    item.heroImage ||
    item.imageUrl ||
    item.image ||
    getImportedImage(item) ||
    ''

  return {
    ...item,
    id: item.id || item.slug,
    slug: item.slug || item.id,
    title: item.title || item.slug || 'Untitled',
    excerpt: item.excerpt || item.body || '',
    subtitle: '',
    author: item.author || 'SabotPress',
    publishedAt,
    publishedDateLabel: formatDateLabel(publishedAt),
    type,
    contentType: type,
    target: item.target || 'general',
    primaryProject,
    primaryProjectSlug,
    collections: Array.isArray(item.collections) ? item.collections : [],
    tags: Array.isArray(item.tags) ? item.tags : [],
    bodyHtml: resolveNativeBodyHtml(item),
    richBody: Array.isArray(item.richBody) ? item.richBody : [],
    sourceKind: 'native',
    sourcePostType: 'native',
    sourcePostId: item.id,
    featuredImage: image,
    featuredTitleDisplay: item.featuredTitleDisplay || '',
    heroImage: image,
    imageUrl: image,
    href: `/post/${item.slug || item.id}`,
    relatedAssets: Array.isArray(item.relatedAssets) ? item.relatedAssets : [],
    relatedPrintLinks: Array.isArray(item.relatedPrintLinks) ? item.relatedPrintLinks : [],
    hasPrintAssets: Boolean(item.hasPrintAssets || type === 'print'),
    hidden: false,
    reviewFlags: [],
  }
}

export async function loadPublishedNativePieces() {
  const items = await loadNativeCollection({ includeFuture: 1 })
  const previewPiece = loadPreviewSnapshotForCurrentRoute()
  const publishedPieces = items
    .filter(isPublishedNativeEntry)
    .map(normalizeNativePublicPiece)
  const visiblePieces = previewPiece
    ? [
        previewPiece,
        ...publishedPieces.filter((item) => getPublicPieceMergeKey(item) !== getPublicPieceMergeKey(previewPiece)),
      ]
    : publishedPieces

  return visiblePieces.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
}

export function mergeNativeAndImportedPieces(importedPieces = [], nativePieces = []) {
  const byKey = new Map()

  for (const item of importedPieces || []) {
    byKey.set(getPublicPieceMergeKey(item), item)
  }

  for (const item of nativePieces || []) {
    byKey.set(getPublicPieceMergeKey(item), item)
  }

  return [...byKey.values()]
    .filter((item) => item?.hidden !== true)
    .sort((a, b) => new Date(b.publishedAt || b.updatedAt || 0) - new Date(a.publishedAt || a.updatedAt || 0))
}

function getPublicPieceMergeKey(item) {
  return String(item?.slug || item?.sourcePostId || item?.id || '').trim().toLowerCase()
}

function loadPreviewSnapshotForCurrentRoute() {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search || '')
  const previewId = params.get('preview')
  if (!previewId) return null

  try {
    const raw = window.localStorage.getItem(`${PREVIEW_STORAGE_PREFIX}${previewId}`)
    const parsed = JSON.parse(raw || 'null')
    if (!parsed || typeof parsed !== 'object') return null
    const routeSlug = decodeURIComponent(window.location.pathname.replace(/^\/post\//, '').replace(/\/+$/, ''))
    const snapshotSlug = slugify(parsed.slug || parsed.title || previewId) || previewId
    const next = {
      ...parsed,
      id: String(parsed.id || previewId),
      slug: routeSlug || snapshotSlug,
      title: String(parsed.title || 'Untitled draft'),
      status: 'published',
      workflowState: 'published',
      hidden: false,
      body: String(parsed.body || parsed.bodyHtml || ''),
      bodyHtml: String(parsed.bodyHtml || parsed.body || ''),
      contentType: String(parsed.contentType || 'dispatch'),
      updatedAt: String(parsed.updatedAt || new Date().toISOString()),
      publishedAt: String(parsed.publishedAt || parsed.updatedAt || new Date().toISOString()),
      isPreviewSnapshot: true,
    }
    return normalizeNativePublicPiece(next)
  } catch {
    return null
  }
}

export function resolveNativeBodyHtml(item) {
  if (item?.bodyHtml) return String(item.bodyHtml || '')

  const blocks = Array.isArray(item.richBody) ? item.richBody : []
  if (!blocks.length) {
    return classicEditorBodyToHtml(item?.body || '')
  }

  const composed = blocks
    .map((block) => {
      const text = String(block?.text || '')

      if (block?.type === 'heading') return `## ${text}`
      if (block?.type === 'quote') return text.split(/\r?\n/g).map((line) => `> ${line}`).join('\n')

      if (block?.type === 'image') {
        const url = escapeAttr(block?.url || '')
        const alt = escapeAttr(block?.alt || '')
        const caption = escapeHtml(block?.caption || '')
        if (!url) return ''
        return `<figure><img src="${url}" alt="${alt}" />${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`
      }

      if (block?.type === 'embed') {
        const url = String(block?.url || '').trim()
        if (!url) return ''
        const caption = String(block?.caption || block?.url || '').trim()
        return `[${caption}](${url})`
      }

      return text
    })
    .filter(Boolean)
    .join('\n\n')

  return classicEditorBodyToHtml(composed)
}

function formatDateLabel(value) {
  const d = new Date(value || '')
  if (!Number.isFinite(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d)
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;')
}
