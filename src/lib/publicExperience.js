import { getCollectionPieces } from './collections'

export function estimateReadingTimeFromHtml(html = '', fallbackText = '') {
  const words = getPlainText(html || fallbackText).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 225))
}

export function extractArticleEnhancements(html = '') {
  if (typeof DOMParser === 'undefined') {
    return { headings: [], footnotes: [], sources: [], downloads: [], timeline: [], locations: [] }
  }

  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
  const headings = Array.from(doc.body.querySelectorAll('h2, h3'))
    .map((node, index) => ({
      id: node.id || slugifyHeading(node.textContent || `section-${index + 1}`),
      text: cleanText(node.textContent),
      level: node.tagName.toLowerCase(),
    }))
    .filter((item) => item.text)

  const footnotes = Array.from(doc.body.querySelectorAll('[id^="fn"], .footnote, .footnotes li, aside[role="note"]'))
    .map((node, index) => ({
      id: node.id || `footnote-${index + 1}`,
      label: String(index + 1),
      text: cleanText(node.textContent),
    }))
    .filter((item) => item.text)

  const sources = Array.from(doc.body.querySelectorAll('blockquote[cite], .source, .source-block, cite'))
    .map((node, index) => ({
      id: node.id || `source-${index + 1}`,
      title: cleanText(node.getAttribute?.('data-title') || node.querySelector?.('strong')?.textContent || `Source ${index + 1}`),
      text: cleanText(node.textContent),
      url: node.getAttribute?.('cite') || node.querySelector?.('a[href]')?.getAttribute('href') || '',
    }))
    .filter((item) => item.text || item.url)

  const downloads = Array.from(doc.body.querySelectorAll('a[href]'))
    .filter((node) => isDownloadUrl(node.getAttribute('href') || '') || node.closest('.download, .downloads, [data-download]'))
    .map((node, index) => ({
      id: `download-${index + 1}`,
      title: cleanText(node.textContent) || filenameFromUrl(node.getAttribute('href') || ''),
      url: node.getAttribute('href') || '',
      type: inferDownloadType(node.getAttribute('href') || ''),
    }))

  const timeline = Array.from(doc.body.querySelectorAll('.timeline li, .timeline-item, [data-timeline]'))
    .map((node, index) => ({
      id: node.id || `timeline-${index + 1}`,
      date: cleanText(node.getAttribute?.('data-date') || node.querySelector?.('time')?.textContent || ''),
      title: cleanText(node.querySelector?.('strong, h3, h4')?.textContent || ''),
      text: cleanText(node.textContent),
    }))
    .filter((item) => item.text)

  const locations = Array.from(doc.body.querySelectorAll('[data-location], [data-lat][data-lng], .location-block'))
    .map((node, index) => ({
      id: node.id || `location-${index + 1}`,
      title: cleanText(node.getAttribute?.('data-title') || node.querySelector?.('strong, h3, h4')?.textContent || `Location ${index + 1}`),
      location: cleanText(node.getAttribute?.('data-location') || node.textContent),
      lat: node.getAttribute?.('data-lat') || '',
      lng: node.getAttribute?.('data-lng') || '',
    }))
    .filter((item) => item.location)

  return { headings, footnotes, sources, downloads: dedupeByUrl(downloads), timeline, locations }
}

export function getRelatedArticles(piece = {}, pieces = [], limit = 4) {
  const currentSlug = String(piece?.slug || '').trim()
  const projectTerms = new Set([...(piece?.projects || []), ...(piece?.categories || []), piece?.primaryProject].filter(Boolean).map(normalizeTerm))
  const tags = new Set((piece?.tags || []).map(normalizeTerm))
  const collections = new Set((piece?.collections || []).map(normalizeTerm))

  return (pieces || [])
    .filter((item) => item?.slug && item.slug !== currentSlug)
    .map((item) => {
      const score =
        countOverlap(projectTerms, [item.primaryProject, ...(item.projects || []), ...(item.categories || [])]) * 4 +
        countOverlap(tags, item.tags || []) * 3 +
        countOverlap(collections, item.collections || []) * 5 +
        (item.type === piece.type ? 1 : 0)
      return { item, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.item.publishedAt || 0) - new Date(a.item.publishedAt || 0))
    .slice(0, limit)
    .map(({ item }) => item)
}

export function getRelatedCollections(piece = {}, collections = [], pieces = [], limit = 3) {
  const pieceSlug = String(piece?.slug || '').trim()
  const pieceTerms = new Set((piece?.collections || []).map(normalizeTerm))
  return (collections || [])
    .map((collection) => {
      const collectionPieces = getCollectionPieces(collection, pieces)
      const direct = collectionPieces.some((item) => item.slug === pieceSlug)
      const named = pieceTerms.has(normalizeTerm(collection.title)) || pieceTerms.has(normalizeTerm(collection.slug))
      return { collection, score: direct ? 10 : named ? 8 : 0 }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ collection }) => collection)
}

export function getRelatedPublications(piece = {}, publications = [], limit = 3) {
  const slug = String(piece?.slug || '').trim()
  if (!slug) return []
  return (publications || [])
    .filter((publication) => (publication.pieceSlugs || []).includes(slug))
    .slice(0, limit)
}

export function setStructuredArticleData(piece = {}, { url = '', image = '' } = {}) {
  if (typeof document === 'undefined') return
  const id = 'structured-data-article'
  let node = document.getElementById(id)
  if (!node) {
    node = document.createElement('script')
    node.id = id
    node.type = 'application/ld+json'
    document.head.appendChild(node)
  }
  node.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': String(piece.type || piece.contentType || '').toLowerCase().includes('podcast') ? 'PodcastEpisode' : 'Article',
    headline: piece.title,
    description: piece.seoDescription || piece.excerpt || piece.subtitle || '',
    image: image || piece.featuredImage || piece.heroImage || undefined,
    datePublished: piece.publishedAt || undefined,
    dateModified: piece.updatedAt || piece.publishedAt || undefined,
    author: { '@type': 'Organization', name: piece.author || 'SabotPress' },
    publisher: { '@type': 'Organization', name: 'SabotPress' },
    mainEntityOfPage: url || `/post/${piece.slug || ''}`,
  })
}

export function getPodcastAudioUrl(piece = {}) {
  const delivery = getPodcastDeliveryAsset(piece)
  const deliveryUrl = delivery?.url || delivery?.publicUrl || delivery?.rssEnclosure?.url || piece.podcastDeliveryAudioUrl || ''
  if (isPublicPodcastAudioUrl(deliveryUrl)) return String(deliveryUrl).trim()

  const direct = String(piece.podcastAudioUrl || piece.podcastRssEnclosureUrl || piece.audioSourceUrl || piece.enclosureUrl || '').trim()
  if (isPublicPodcastAudioUrl(direct)) return direct

  const asset = getPodcastAudioAsset(piece)
  const assetUrl = asset?.url || asset?.publicUrl || asset?.rssEnclosure?.url || ''
  return isPublicPodcastAudioUrl(assetUrl) ? String(assetUrl).trim() : ''
}

export function getPodcastDeliveryAsset(piece = {}) {
  return (Array.isArray(piece.relatedAssets) ? piece.relatedAssets : []).find((asset) => {
    const haystack = `${asset?.type || ''} ${asset?.role || ''} ${asset?.source || ''} ${asset?.mimeType || ''}`
    const url = asset?.url || asset?.publicUrl || asset?.rssEnclosure?.url || ''
    return /delivery|compressed|opus|mp3|m4a|webm/i.test(haystack) && isPublicPodcastAudioUrl(url)
  }) || null
}

export function getPodcastAudioAsset(piece = {}) {
  return (Array.isArray(piece.relatedAssets) ? piece.relatedAssets : []).find((asset) => {
    const haystack = `${asset?.type || ''} ${asset?.source || ''} ${asset?.mimeType || ''}`
    const url = asset?.url || asset?.publicUrl || asset?.rssEnclosure?.url || ''
    return /audiolab|audio/i.test(haystack) && isPublicPodcastAudioUrl(url)
  }) || null
}

export function isPublicPodcastAudioUrl(value = '') {
  const raw = String(value || '').trim()
  if (!raw || raw.startsWith('audiolab-local://')) return false
  return /^https?:\/\//i.test(raw) || raw.startsWith('/api/audiolab/media')
}

export function getPlainText(html = '') {
  if (typeof DOMParser !== 'undefined' && /<[^>]+>/.test(String(html || ''))) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
    return cleanText(doc.body.textContent)
  }
  return cleanText(html)
}

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeTerm(value = '') {
  return String(value || '').trim().toLowerCase()
}

function countOverlap(set, values = []) {
  return (Array.isArray(values) ? values : [values]).reduce((count, value) => count + (set.has(normalizeTerm(value)) ? 1 : 0), 0)
}

function isDownloadUrl(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return false
  const decoded = safeDecode(raw)
  const pathOnly = decoded.split('#')[0]
  if (/\.(pdf|zip|epub|mp3|wav|m4a|webm|docx?|odt|rtf|txt|md|csv|png|jpe?g)(?:[?#]|$)/i.test(pathOnly)) return true
  if (/\/api\/media\/files\b/i.test(decoded)) return true
  if (/\b(file|key|filename|name)=.*\.(pdf|zip|epub|docx?|odt|rtf|txt|md|csv|png|jpe?g)\b/i.test(decoded)) return true
  return false
}

function inferDownloadType(value = '') {
  const decoded = safeDecode(value)
  const match = decoded.match(/\.([a-z0-9]+)(?:[?#&]|$)/i)
  return match ? match[1].toUpperCase() : 'Download'
}

function filenameFromUrl(value = '') {
  try {
    const url = new URL(value, window.location.origin)
    const key = url.searchParams.get('key') || url.searchParams.get('file') || url.searchParams.get('filename') || ''
    if (key) return decodeURIComponent(key.split('/').filter(Boolean).pop() || key)
    return decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || 'Download')
  } catch {
    return 'Download'
  }
}

function dedupeByUrl(items = []) {
  const seen = new Set()
  return items.filter((item) => {
    if (!item.url || seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
}

function slugifyHeading(value = '') {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'section'
}

function safeDecode(value = '') {
  try {
    return decodeURIComponent(String(value || ''))
  } catch {
    return String(value || '')
  }
}
