const STORAGE_KEY = 'sabot.publications.v2'

export const PUBLICATION_TYPES = ['Book', 'Magazine', 'Zine', 'Reader', 'Pamphlet', 'Poster Pack', 'Campaign Kit', 'Booklet']
export const PUBLICATION_VISIBILITY = ['draft', 'private', 'unlisted', 'public', 'archived']
export const PAGE_SIZES = {
  portrait: { width: 816, height: 1056, label: 'Portrait' },
  landscape: { width: 1056, height: 816, label: 'Landscape' },
}
export const PAGE_KINDS = [
  { value: 'cover', label: 'Cover page' },
  { value: 'inside', label: 'Inside page' },
  { value: 'spread', label: 'Center spread' },
  { value: 'back-cover', label: 'Back cover' },
]

function nowIso() { return new Date().toISOString() }
function makeId(prefix = 'id') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` }

export function slugifyPublication(value = '') {
  return String(value || 'publication').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'publication'
}

export function createTextBlock(overrides = {}) {
  return { id: makeId('block'), type: 'text', x: 80, y: 90, width: 420, height: 120, text: 'New text block', fontSize: 28, ...overrides }
}

export function createPage(kind = 'inside', order = 0, overrides = {}) {
  const titleByKind = { cover: 'Cover', inside: `Page ${order + 1}`, spread: 'Center Spread', 'back-cover': 'Back Cover' }
  return {
    id: makeId('page'), issueId: '', sectionId: '', title: titleByKind[kind] || `Page ${order + 1}`, kind,
    orientation: kind === 'spread' ? 'landscape' : 'portrait', order,
    blocks: [createTextBlock({ text: titleByKind[kind] || 'New page' })], previewImage: '', thumbnail: '', updatedAt: nowIso(), ...overrides,
  }
}

export function createPublication(overrides = {}) {
  const createdAt = nowIso()
  const title = overrides.title || 'Untitled Zine'
  const issueId = makeId('issue')
  const sectionId = makeId('section')
  const pages = [
    createPage('cover', 0, { issueId, sectionId }), createPage('inside', 1, { issueId, sectionId }),
    createPage('spread', 2, { issueId, sectionId }), createPage('back-cover', 3, { issueId, sectionId }),
  ]
  return {
    id: makeId('pub'), type: overrides.type || 'Zine', publicationType: overrides.publicationType || overrides.type || 'Zine',
    title, slug: slugifyPublication(title), status: 'draft', visibility: 'draft', subtitle: '', description: '', issueNumber: '',
    edition: 'Reader edition', coverImage: '', coverAlt: '', backCover: '', frontMatter: '', credits: 'SabotPress', colophon: '',
    tableOfContents: [], pieceSlugs: [], printlabProjectId: '', printlabProjectUrl: '/wp-admin/printlab', archiveEntrySlug: '',
    downloadPageSlug: '', downloadAssets: [], versions: [], createdAt, updatedAt: createdAt, generatedAt: '', canvaLink: '',
    previewImages: [], thumbnails: [], issues: [{ id: issueId, title: 'Issue 1', order: 0 }],
    sections: [{ id: sectionId, issueId, title: 'Main', order: 0 }], pages,
    printEditions: [{ id: makeId('print'), title: 'Print Edition', status: 'draft', readerOrder: pages.map((page) => page.id),
      printerOrder: buildPrinterOrder(pages), imposedBooklet: [], singlePages: [], printPdf: '', imposedPdf: '', updatedAt: createdAt }],
    digitalEditions: [{ id: makeId('digital'), title: 'Digital Edition', status: 'draft', readerPdf: '', readerAssets: [], updatedAt: createdAt }],
    assets: { readerPdf: '', printPdf: '', imposedPdf: '', canvaLink: '', previewImages: [], thumbnails: [] }, ...overrides,
  }
}

export function buildPrinterOrder(pages = []) {
  const ids = [...pages].sort((a, b) => a.order - b.order).map((page) => page.id)
  const sheets = []
  for (let left = 0, right = ids.length - 1; left <= right; left += 1, right -= 1) sheets.push(left === right ? [ids[left]] : [ids[right], ids[left]])
  return sheets.flat()
}

export function normalizePublication(publication) {
  const base = createPublication({ title: publication?.title || 'Untitled Zine' })
  const merged = { ...base, ...(publication || {}) }
  merged.publicationType = PUBLICATION_TYPES.includes(merged.publicationType || merged.type) ? (merged.publicationType || merged.type) : 'Zine'
  merged.type = merged.publicationType
  merged.visibility = PUBLICATION_VISIBILITY.includes(merged.visibility) ? merged.visibility : normalizeVisibilityFromStatus(merged.status)
  merged.status = merged.status || (merged.visibility === 'public' ? 'published' : 'draft')
  merged.subtitle = String(merged.subtitle || '')
  merged.description = String(merged.description || '')
  merged.issueNumber = String(merged.issueNumber || '')
  merged.edition = String(merged.edition || 'Reader edition')
  merged.coverImage = String(merged.coverImage || '')
  merged.coverAlt = String(merged.coverAlt || '')
  merged.backCover = String(merged.backCover || '')
  merged.frontMatter = String(merged.frontMatter || '')
  merged.credits = String(merged.credits || '')
  merged.colophon = String(merged.colophon || '')
  merged.pieceSlugs = normalizeList(merged.pieceSlugs)
  merged.tableOfContents = Array.isArray(merged.tableOfContents) ? merged.tableOfContents : []
  merged.downloadAssets = normalizeDownloadAssets(merged.downloadAssets)
  merged.versions = normalizeVersions(merged.versions)
  merged.printlabProjectId = String(merged.printlabProjectId || '')
  merged.printlabProjectUrl = String(merged.printlabProjectUrl || '/wp-admin/printlab')
  merged.archiveEntrySlug = String(merged.archiveEntrySlug || '')
  merged.downloadPageSlug = String(merged.downloadPageSlug || merged.slug || '')
  merged.generatedAt = String(merged.generatedAt || '')
  merged.pages = (Array.isArray(merged.pages) ? merged.pages : [])
    .map((page, index) => ({ ...createPage(page?.kind || 'inside', index), ...page, order: Number.isFinite(page?.order) ? page.order : index, blocks: Array.isArray(page?.blocks) ? page.blocks : [] }))
    .sort((a, b) => a.order - b.order).map((page, order) => ({ ...page, order }))
  merged.printEditions = Array.isArray(merged.printEditions) ? merged.printEditions : []
  merged.digitalEditions = Array.isArray(merged.digitalEditions) ? merged.digitalEditions : []
  merged.assets = { ...base.assets, ...(merged.assets || {}) }
  return merged
}

// Legacy browser copies remain available only for explicit recovery/migration.
export function loadPublications() {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.map(normalizePublication) : []
  } catch { return [] }
}

export function savePublications(publications = []) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(publications.map(normalizePublication)))
}

export function savePublication(publication) {
  const normalized = normalizePublication({ ...publication, updatedAt: nowIso() })
  const current = loadPublications()
  const next = current.some((item) => item.id === normalized.id) ? current.map((item) => item.id === normalized.id ? normalized : item) : [normalized, ...current]
  savePublications(next)
  return normalized
}

export function findPublication(idOrSlug) {
  return loadPublications().find((item) => item.id === idOrSlug || item.slug === idOrSlug) || null
}

export async function loadPublicationsAsync(params = {}) {
  if (typeof window === 'undefined') return []
  const url = new URL('/api/publications', window.location.origin)
  for (const [key, value] of Object.entries(params)) if (value != null && value !== '') url.searchParams.set(key, String(value))
  const res = await fetch(url.pathname + url.search, { credentials: 'same-origin', headers: { accept: 'application/json' } })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok || !Array.isArray(data.items) || data.mode !== 'd1') {
    throw new Error(data?.error || `publication load failed: ${res.status}`)
  }
  return data.items.map(normalizePublication)
}

export async function savePublicationAsync(publication) {
  const normalized = normalizePublication({ ...publication, updatedAt: nowIso() })
  if (typeof window === 'undefined') throw new Error('publication save failed: browser session unavailable')
  const res = await fetch('/api/publications', {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ publication: normalized }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok || !data.item || data.mode !== 'd1') throw new Error(data?.error || `publication save failed: ${res.status}`)
  return normalizePublication(data.item)
}

export function generatePublicationFromPieces(publication, pieces = []) {
  const source = normalizePublication(publication)
  const bySlug = new Map((pieces || []).map((piece) => [String(piece?.slug || piece?.id || '').trim(), piece]))
  const selectedPieces = source.pieceSlugs.map((slug) => bySlug.get(slug)).filter(Boolean)
  const generatedAt = nowIso()
  const issueLabel = source.issueNumber ? `Issue ${source.issueNumber}` : source.publicationType
  const pages = []

  pages.push(createPage('cover', pages.length, { title: 'Cover', blocks: [
    createTextBlock({ x: 70, y: 90, width: 620, height: 90, text: source.title, fontSize: 48 }),
    createTextBlock({ x: 74, y: 180, width: 560, height: 80, text: [source.subtitle, issueLabel].filter(Boolean).join('\n'), fontSize: 22 }),
  ], previewImage: source.coverImage }))

  if (source.frontMatter) pages.push(createPage('inside', pages.length, { title: 'Front Matter', blocks: [createTextBlock({ x: 80, y: 90, width: 620, height: 720, text: source.frontMatter, fontSize: 22 })] }))

  const toc = selectedPieces.map((piece, index) => ({ title: piece.title || `Piece ${index + 1}`, slug: piece.slug || piece.id || '', page: pages.length + index + 1 }))
  pages.push(createPage('inside', pages.length, { title: 'Table of Contents', blocks: [createTextBlock({ x: 80, y: 90, width: 620, height: 720, text: ['Table of Contents', ...toc.map((item, index) => `${index + 1}. ${item.title}`)].join('\n\n'), fontSize: 24 })] }))

  for (const piece of selectedPieces) {
    const body = stripHtml(piece.bodyHtml || piece.body || piece.excerpt || '')
    pages.push(createPage('inside', pages.length, { title: piece.title || 'Untitled', blocks: [
      createTextBlock({ x: 70, y: 70, width: 640, height: 110, text: piece.title || 'Untitled', fontSize: 36 }),
      createTextBlock({ x: 72, y: 190, width: 640, height: 720, text: body.slice(0, 2600), fontSize: 18 }),
    ] }))
  }

  pages.push(createPage('inside', pages.length, { title: 'Credits and Colophon', blocks: [createTextBlock({ x: 80, y: 90, width: 620, height: 720, text: ['Credits', source.credits, '', 'Colophon', source.colophon].filter((line) => line != null).join('\n'), fontSize: 22 })] }))
  pages.push(createPage('back-cover', pages.length, { title: 'Back Cover', blocks: [createTextBlock({ x: 80, y: 120, width: 620, height: 540, text: source.backCover || source.description || 'SabotPress', fontSize: 28 })] }))

  const version = { id: makeId('version'), label: `Generated ${new Date(generatedAt).toLocaleString()}`, createdAt: generatedAt, summary: `Generated ${pages.length} pages from ${selectedPieces.length} pieces.`, pageCount: pages.length }
  return updatePublicationPages({ ...source, status: source.visibility === 'public' ? 'published' : source.status, tableOfContents: toc, pages, generatedAt, archiveEntrySlug: source.archiveEntrySlug || source.slug, downloadPageSlug: source.downloadPageSlug || source.slug, versions: [version, ...(source.versions || [])].slice(0, 30) }, pages)
}

export function duplicatePage(page, order) {
  return { ...page, id: makeId('page'), title: `${page.title || 'Page'} Copy`, order, blocks: (page.blocks || []).map((block) => ({ ...block, id: makeId('block') })), updatedAt: nowIso() }
}

export function updatePublicationPages(publication, pages) {
  const orderedPages = pages.map((page, order) => ({ ...page, order, updatedAt: nowIso() }))
  const printEditions = (publication.printEditions || []).map((edition) => ({ ...edition, readerOrder: orderedPages.map((page) => page.id), printerOrder: buildPrinterOrder(orderedPages), updatedAt: nowIso() }))
  return { ...publication, pages: orderedPages, printEditions, updatedAt: nowIso() }
}

function normalizeVisibilityFromStatus(status) { if (status === 'published') return 'public'; if (status === 'archived') return 'archived'; return 'draft' }
function normalizeList(value) { if (Array.isArray(value)) return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]; return String(value || '').split(',').map((item) => item.trim()).filter(Boolean) }
function normalizeDownloadAssets(value) {
  const arr = Array.isArray(value) ? value : []
  return arr.map((asset) => ({ id: String(asset?.id || makeId('download')), title: String(asset?.title || ''), url: String(asset?.url || ''), type: String(asset?.type || ''), visibility: String(asset?.visibility || 'public') })).filter((asset) => asset.title || asset.url)
}
function normalizeVersions(value) {
  const arr = Array.isArray(value) ? value : []
  return arr.map((version) => ({ id: String(version?.id || makeId('version')), label: String(version?.label || 'Version'), createdAt: String(version?.createdAt || nowIso()), summary: String(version?.summary || ''), pageCount: Number(version?.pageCount || 0) }))
}
function stripHtml(value = '') {
  return String(value || '').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}
