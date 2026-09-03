const WP_BASE = typeof window !== 'undefined' ? window.location.origin : ''
const API_BASE = `${WP_BASE}/wp-json/wp/v2`

const ENTITY_CACHE = {
  categories: null,
  tags: null,
  media: new Map(),
}

async function fetchJson(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { accept: 'application/json' },
  })

  if (!res.ok) {
    throw new Error(`WordPress fetch failed ${res.status}: ${path}`)
  }

  return res.json()
}

function decodeHtml(value = '') {
  const el = document.createElement('textarea')
  el.innerHTML = String(value || '')
  return el.value
}

function stripHtml(value = '') {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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

function getEmbeddedFeaturedImage(post) {
  const media = post?._embedded?.['wp:featuredmedia']?.[0]
  if (!media) return ''
  return (
    media.source_url ||
    media.media_details?.sizes?.large?.source_url ||
    media.media_details?.sizes?.medium_large?.source_url ||
    media.media_details?.sizes?.full?.source_url ||
    ''
  )
}

async function getMediaById(id) {
  if (!id) return null
  if (ENTITY_CACHE.media.has(id)) return ENTITY_CACHE.media.get(id)

  try {
    const media = await fetchJson(`/media/${id}`)
    ENTITY_CACHE.media.set(id, media)
    return media
  } catch {
    ENTITY_CACHE.media.set(id, null)
    return null
  }
}

async function getTerms(kind) {
  if (ENTITY_CACHE[kind]) return ENTITY_CACHE[kind]

  const endpoint = kind === 'tags' ? '/tags?per_page=100' : '/categories?per_page=100'
  const terms = await fetchJson(endpoint)
  ENTITY_CACHE[kind] = Array.isArray(terms) ? terms : []
  return ENTITY_CACHE[kind]
}

function mapTermNames(ids = [], terms = []) {
  const byId = new Map(terms.map((term) => [term.id, term]))
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((term) => ({
      id: term.id,
      name: decodeHtml(term.name || ''),
      slug: term.slug || slugify(term.name || ''),
    }))
}

function inferType(post, categories = [], tags = []) {
  const haystack = [
    post?.title?.rendered,
    post?.content?.rendered,
    ...categories.map((term) => term.name),
    ...tags.map((term) => term.name),
  ].join(' ').toLowerCase()

  if (/podcast|molotov|youtube|spotify|soundcloud|acast|peertube/.test(haystack)) return 'podcast'
  if (/zine|comic|print|booklet|pdf|distro|sabotuers|glaring examples/.test(haystack)) return 'print'
  if (/dispatch|communique|newsletter/.test(haystack)) return 'dispatch'
  return 'article'
}

async function mapPostToPiece(post, categoriesIndex, tagsIndex) {
  const categories = mapTermNames(post.categories || [], categoriesIndex)
  const tags = mapTermNames(post.tags || [], tagsIndex)
  const embeddedImage = getEmbeddedFeaturedImage(post)

  let featuredImage = embeddedImage
  if (!featuredImage && post.featured_media) {
    const media = await getMediaById(post.featured_media)
    featuredImage = media?.source_url || ''
  }

  const title = decodeHtml(post.title?.rendered || post.slug || 'Untitled')
  const bodyHtml = post.content?.rendered || ''
  const excerpt = stripHtml(post.excerpt?.rendered || '').slice(0, 260)
  const publishedAt = post.date_gmt ? `${post.date_gmt}Z` : post.date || ''

  const primaryProject = categories[0]?.name || 'General'
  const primaryProjectSlug = categories[0]?.slug || 'general'
  const type = inferType(post, categories, tags)

  return {
    id: `wp-${post.id}`,
    slug: post.slug,
    title,
    author: 'SabotPress',
    publishedAt,
    publishedDateLabel: formatDateLabel(publishedAt),
    type,
    projects: categories.map((term) => term.name),
    primaryProject,
    primaryProjectSlug,
    tags: tags.map((term) => term.name),
    excerpt,
    subtitle: '',
    bodyHtml,
    sourceUrl: post.link || `/${post.slug}/`,
    sourcePostType: 'wordpress',
    sourcePostId: String(post.id),
    featuredImage,
    heroImage: featuredImage,
    imageUrl: featuredImage,
    relatedPrintLinks: [],
    relatedAssets: featuredImage ? [{ kind: 'image', url: featuredImage, title }] : [],
    hasPrintAssets: type === 'print',
    sourceKind: 'wordpress',
    hidden: false,
    reviewFlags: [],
  }
}

export async function fetchWordPressPieces({ perPage = 100 } = {}) {
  const [posts, categories, tags] = await Promise.all([
    fetchJson(`/posts?per_page=${perPage}&_embed=1`),
    getTerms('categories'),
    getTerms('tags'),
  ])

  const mapped = await Promise.all(
    (Array.isArray(posts) ? posts : []).map((post) => mapPostToPiece(post, categories, tags))
  )

  return mapped.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
}

export async function fetchWordPressPages({ perPage = 100 } = {}) {
  return fetchJson(`/pages?per_page=${perPage}&_embed=1`)
}

export async function fetchWordPressMedia({ perPage = 100 } = {}) {
  return fetchJson(`/media?per_page=${perPage}`)
}

export async function fetchWordPressTaxonomy() {
  const [categories, tags] = await Promise.all([
    getTerms('categories'),
    getTerms('tags'),
  ])
  return { categories, tags }
}

export function mergeWordPressWithFallback(wordpressPieces = [], fallbackPieces = []) {
  if (!wordpressPieces.length) return fallbackPieces || []

  const seen = new Set()
  const merged = []

  for (const item of wordpressPieces) {
    const key = item.slug || item.id
    seen.add(key)
    merged.push(item)
  }

  for (const item of fallbackPieces || []) {
    const key = item.slug || item.id
    if (!seen.has(key)) merged.push(item)
  }

  return merged.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
}

export function buildWordPressPostEditLink(postId, sourceUrl = '') {
  const id = String(postId || '').trim()
  if (!id) return ''

  try {
    if (sourceUrl) {
      const base = new URL(sourceUrl)
      return `${base.origin}/wp-admin/post.php?post=${encodeURIComponent(id)}&action=edit`
    }
  } catch {
    // fall through to default base
  }

  return `/wp-admin/post.php?post=${encodeURIComponent(id)}&action=edit`
}
