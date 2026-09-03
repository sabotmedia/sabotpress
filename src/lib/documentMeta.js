const DEFAULT_TITLE = 'SabotPress'
const DEFAULT_DESCRIPTION = 'Independent reporting, essays, comics, podcasts, zines, and project-based archive work from SabotPress.'
const DEFAULT_IMAGE = '/sabot-logo.png'

export function setDocumentMeta({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  canonicalPath = '',
  image = DEFAULT_IMAGE,
  type = 'website',
} = {}) {
  const cleanTitle = String(title || DEFAULT_TITLE).trim() || DEFAULT_TITLE
  const cleanDescription = String(description || DEFAULT_DESCRIPTION).replace(/\s+/g, ' ').trim() || DEFAULT_DESCRIPTION
  const url = buildAbsoluteUrl(canonicalPath)
  const imageUrl = buildAbsoluteUrl(image)

  document.title = cleanTitle === DEFAULT_TITLE ? DEFAULT_TITLE : `${cleanTitle} | SabotPress`
  setMeta('name', 'description', cleanDescription)
  setMeta('property', 'og:title', cleanTitle)
  setMeta('property', 'og:description', cleanDescription)
  setMeta('property', 'og:type', type)
  setMeta('property', 'og:site_name', 'SabotPress')
  setMeta('property', 'og:url', url)
  setMeta('property', 'og:image', imageUrl)
  setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary')
  setMeta('name', 'twitter:title', cleanTitle)
  setMeta('name', 'twitter:description', cleanDescription)
  setMeta('name', 'twitter:image', imageUrl)
  setCanonical(url)
  document.documentElement.dataset.sabotMetaPath = new URL(url).pathname
  document.documentElement.dataset.sabotMetaTitle = cleanTitle
  document.dispatchEvent(new CustomEvent('sabot:meta-updated', { detail: { path: canonicalPath, title: cleanTitle } }))
}

export function stripHtmlForMeta(value, fallback = '') {
  return String(value || fallback || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildPostMeta(piece, { path = '' } = {}) {
  const title = stripHtmlForMeta(piece?.seoTitle || piece?.title || 'SabotPress')
  const description = stripHtmlForMeta(
    piece?.seoDescription || piece?.excerpt || piece?.subtitle || piece?.body || piece?.bodyHtml,
    DEFAULT_DESCRIPTION
  ).slice(0, 220)
  const image = String(piece?.featuredImage || piece?.heroImage || piece?.imageUrl || DEFAULT_IMAGE).trim()

  return {
    title,
    description,
    canonicalPath: path || `/post/${piece?.slug || ''}`,
    image,
    type: 'article',
  }
}

function setMeta(attribute, key, content) {
  if (!content) return
  let node = document.head.querySelector(`meta[${attribute}="${key}"]`)
  if (!node) {
    node = document.createElement('meta')
    node.setAttribute(attribute, key)
    document.head.appendChild(node)
  }
  node.setAttribute('content', content)
}

function setCanonical(href) {
  let node = document.head.querySelector('link[rel="canonical"]')
  if (!node) {
    node = document.createElement('link')
    node.setAttribute('rel', 'canonical')
    document.head.appendChild(node)
  }
  node.setAttribute('href', href)
}

function buildAbsoluteUrl(pathOrUrl) {
  const raw = String(pathOrUrl || '').trim()
  if (/^https?:\/\//i.test(raw)) return raw
  const path = raw.startsWith('/') ? raw : `/${raw.replace(/^\/+/, '')}`
  return `${window.location.origin}${path}`
}
