import fs from 'node:fs'

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: node scripts/import-wordpress.mjs /path/to/export.xml')
  process.exit(1)
}

const xml = fs.readFileSync(inputPath, 'utf8')

const parsedItems = extractItems(xml)
  .map(parseItem)
  .filter(Boolean)

const attachmentMap = buildAttachmentMap(parsedItems)

const items = parsedItems
  .filter((item) => item.status === 'publish')
  .filter((item) => item.postType === 'post')
  .map((item) => normalizePiece(item, attachmentMap))
  .filter(Boolean)
  .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))

const out = {
  importedAt: new Date().toISOString(),
  sourceFile: inputPath,
  count: items.length,
  items,
}

fs.writeFileSync(
  new URL('../src/content/pieces.imported.json', import.meta.url),
  JSON.stringify(out, null, 2) + '\n',
)

console.log(`Imported ${items.length} published posts → src/content/pieces.imported.json`)

function extractItems(source) {
  return [...source.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1])
}

function parseItem(block) {
  const categories = [...block.matchAll(/<category[^>]*domain="category"[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g)]
    .map((m) => decodeXml(m[1]).trim())
    .filter(Boolean)

  const tags = [...block.matchAll(/<category[^>]*domain="post_tag"[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g)]
    .map((m) => decodeXml(m[1]).trim())
    .filter(Boolean)

  const postMeta = parsePostMeta(block)

  return {
    title: readCdata(block, 'title'),
    link: readText(block, 'link'),
    creator: readCdata(block, 'dc:creator'),
    guid: readTextWithAttr(block, 'guid'),
    excerpt: readCdata(block, 'excerpt:encoded'),
    content: readCdata(block, 'content:encoded'),
    postId: readCdata(block, 'wp:post_id'),
    postDate: readCdata(block, 'wp:post_date'),
    postDateGmt: readCdata(block, 'wp:post_date_gmt'),
    postName: readCdata(block, 'wp:post_name'),
    status: readCdata(block, 'wp:status'),
    postType: readCdata(block, 'wp:post_type'),
    attachmentUrl: readCdata(block, 'wp:attachment_url'),
    categories,
    tags,
    postMeta,
  }
}

function parsePostMeta(block) {
  return [...block.matchAll(/<wp:postmeta>([\s\S]*?)<\/wp:postmeta>/g)]
    .map((m) => {
      const metaBlock = m[1]
      return {
        key: readCdata(metaBlock, 'wp:meta_key'),
        value: readCdata(metaBlock, 'wp:meta_value'),
      }
    })
    .filter((entry) => entry.key)
}

function buildAttachmentMap(items) {
  const map = new Map()

  for (const item of items) {
    if (item.postType !== 'attachment') continue
    if (!item.postId) continue

    const alt = getPostMetaValue(item.postMeta, '_wp_attachment_image_alt')
    map.set(String(item.postId), {
      id: String(item.postId),
      title: cleanText(item.title),
      slug: cleanSlug(item.postName || item.title),
      url: cleanText(item.attachmentUrl),
      alt: cleanText(alt),
      sourceUrl: cleanText(item.link) || cleanText(item.guid),
    })
  }

  return map
}

function getPostMetaValue(postMeta, key) {
  const found = (Array.isArray(postMeta) ? postMeta : []).find((entry) => entry.key === key)
  return found?.value || ''
}

function resolveFeaturedImage(item, attachmentMap) {
  const thumbnailId = cleanText(getPostMetaValue(item.postMeta, '_thumbnail_id'))
  if (!thumbnailId) return ''

  const attachment = attachmentMap.get(thumbnailId)
  if (!attachment?.url) return ''

  return attachment.url
}

function normalizePiece(item, attachmentMap) {
  const title = cleanText(item.title)
  const slug = cleanSlug(item.postName || title)
  if (!title || !slug) return null

  const bodyHtml = sanitizeImportedHtml(item.content || '')
  const excerpt = cleanExcerpt(item.excerpt || bodyHtml)
  const subtitle = inferSubtitle(bodyHtml, title)
  const projects = mapProjects(item.categories || [])
  const primaryProject = projects[0] || 'General'
  const primaryProjectSlug = toProjectSlug(primaryProject)
  const relatedAssets = extractAssets(bodyHtml)
  const relatedPrintLinks = relatedAssets.filter((asset) =>
    /\.pdf($|\?)/i.test(asset.url) ||
    /reader|imposed|print|zine|booklet|bw/i.test(asset.url) ||
    /reader|imposed|print|zine|booklet|bw/i.test(asset.title)
  )
  const featuredImage = resolveFeaturedImage(item, attachmentMap)

  return {
    id: item.postId || slug,
    title,
    slug,
    author: cleanText(item.creator) || 'sabotmedia',
    publishedAt: toIso(item.postDateGmt || item.postDate),
    publishedDateLabel: formatDate(item.postDateGmt || item.postDate),
    type: inferType(item.categories || [], relatedAssets, bodyHtml),
    projects,
    primaryProject,
    primaryProjectSlug,
    tags: (item.tags || []).map(cleanText).filter(Boolean),
    excerpt,
    subtitle,
    bodyHtml,
    sourceUrl: cleanText(item.link) || cleanText(item.guid),
    sourcePostType: cleanText(item.postType),
    featuredImage,
    sourcePostId: cleanText(item.postId),
    featuredImage,
    relatedPrintLinks,
    relatedAssets,
    hasPrintAssets: relatedPrintLinks.length > 0,
  }
}

function readCdata(block, tag) {
  const cdataOpen = `<${tag}><![CDATA[`
  const cdataClose = `]]></${tag}>`
  const cdataStart = block.indexOf(cdataOpen)
  if (cdataStart !== -1) {
    const innerStart = cdataStart + cdataOpen.length
    const innerEnd = block.indexOf(cdataClose, innerStart)
    if (innerEnd !== -1) return decodeXml(block.slice(innerStart, innerEnd))
  }

  const open = `<${tag}>`
  const close = `</${tag}>`
  const start = block.indexOf(open)
  if (start !== -1) {
    const innerStart = start + open.length
    const innerEnd = block.indexOf(close, innerStart)
    if (innerEnd !== -1) return decodeXml(block.slice(innerStart, innerEnd))
  }

  return ''
}

function readText(block, tag) {
  const open = `<${tag}>`
  const close = `</${tag}>`
  const start = block.indexOf(open)
  if (start === -1) return ''
  const innerStart = start + open.length
  const innerEnd = block.indexOf(close, innerStart)
  if (innerEnd === -1) return ''
  return decodeXml(block.slice(innerStart, innerEnd))
}

function readTextWithAttr(block, tag) {
  const openNeedle = `<${tag}`
  const start = block.indexOf(openNeedle)
  if (start === -1) return ''

  const tagEnd = block.indexOf('>', start)
  if (tagEnd === -1) return ''

  const close = `</${tag}>`
  const innerStart = tagEnd + 1
  const innerEnd = block.indexOf(close, innerStart)
  if (innerEnd === -1) return ''

  return decodeXml(block.slice(innerStart, innerEnd))
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&#038;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8230;/g, '…')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function cleanSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toProjectSlug(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeProjectName(name) {
  const value = String(name || '').trim().toLowerCase()
  const map = {
    'the harbor rat report': 'The Example Project',
    'harbor-rat': 'The Example Project',
    'harbor rat report': 'The Example Project',
    'the communique': 'The Communique',
    'molotov now!': 'Example Project',
    'molotov now': 'Example Project',
    'black cat distro': 'Black Cat Distro',
    'the sabotuers': 'The Sabotuers',
    'zines and comics': 'Zines and Comics',
    'general': 'General',
    'glaring examples': 'Glaring Examples',
    'get to know your neighborhood': 'Get To Know Your Neighborhood',
    'sabots bay': 'Sabots Bay',
    'the child and its enemies': 'Example Project',
    'al1312': 'AL1312',
  }
  return map[value] || String(name || '').trim()
}

function mapProjects(categories) {
  const known = categories.filter((name) =>
    [
      'Black Cat Distro',
      'Example Project',
      'The Communique',
      'The Example Project',
      'General',
      'The Sabotuers',
      'Zines and Comics',
      'Glaring Examples',
      'Get To Know Your Neighborhood',
      'Sabots Bay',
      'Example Project',
      'AL1312',
      'harbor-rat',
      'molotov-now',
      'the-communique',
      'black-cat-distro',
      'the-sabotuers',
      'zines-and-comics',
      'glaring-examples',
      'get-to-know-your-neighborhood',
      'sabots-bay',
      'thechildanditsenemies',
      'al1312',
    ].includes(name),
  )

  return (known.length ? known : ['General']).map(normalizeProjectName)
}

function inferType(categories, relatedAssets, bodyHtml) {
  const joined = [...categories, ...relatedAssets.map((asset) => asset.title || ''), bodyHtml]
    .join(' ')
    .toLowerCase()

  if (joined.includes('newsletter') || joined.includes('communique')) return 'newsletter'
  if (/youtube|soundcloud|acast|spotify|peertube/.test(joined) || joined.includes('podcast') || joined.includes('molotov now')) return 'podcast'
  if (joined.includes('comic') || joined.includes('sabotuers') || joined.includes('glaring examples')) return 'comic'
  if (joined.includes('zine') || joined.includes('black cat distro') || relatedAssets.some((asset) => /\.pdf($|\?)/i.test(asset.url))) return 'zine'
  return 'article'
}

function sanitizeImportedHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\[caption[^\]]*\]/gi, '')
    .replace(/\[\/caption\]/gi, '')
    .replace(/\[gallery[^\]]*\]/gi, '')
    .replace(/width="\d+"/gi, '')
    .replace(/height="\d+"/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<p>\s*(<a[^>]*>\s*<img[^>]+>\s*<\/a>)\s*<\/p>/gi, '<figure class="imported-figure">$1</figure>')
    .replace(/<p>\s*(<img[^>]+>)\s*<\/p>/gi, '<figure class="imported-figure">$1</figure>')
    .replace(/\sloading="lazy"/gi, '')
    .replace(/\sdecoding="async"/gi, '')
    .replace(/<img([^>]*?)\s+align="[^"]*"/gi, '<img$1')
    .replace(/<img([^>]*?)\s+style="[^"]*"/gi, '<img$1')
    .replace(/<p>\s*Caption:\s*/gi, '<figcaption>')
    .replace(/(<figcaption>[\s\S]*?)(?=<figure|<p|<h[1-6]|$)/gi, (m) => m.includes('</figcaption>') ? m : m + '</figcaption>')
    .trim()
}

function extractAssets(bodyHtml) {
  const assets = []

  for (const m of bodyHtml.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi)) {
    assets.push({
      kind: 'image',
      url: decodeXml(m[1]),
      title: '',
    })
  }

  for (const m of bodyHtml.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = decodeXml(m[1])
    const title = cleanText(m[2])
    if (/\.(pdf|jpg|jpeg|png|gif|webp)($|\?)/i.test(url)) {
      assets.push({
        kind: /\.pdf($|\?)/i.test(url) ? 'file' : 'image',
        url,
        title,
      })
    }
  }

  return dedupeAssets(assets)
}

function dedupeAssets(assets) {
  const seen = new Set()
  const out = []
  for (const asset of assets) {
    const key = `${asset.kind}:${asset.url}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(asset)
  }
  return out
}

function cleanExcerpt(value) {
  const stripped = String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (/^to get this article in zine format/i.test(stripped)) return ''
  return stripped.slice(0, 220)
}

function inferSubtitle(html, title = '') {
  const parts = String(title || '').split(':').map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 2) return parts.slice(1).join(': ')

  const firstParagraph = String(html || '').match(/<p>([\s\S]*?)<\/p>/i)
  if (!firstParagraph) return ''
  const text = cleanText(firstParagraph[1])
  if (/^to get this article in zine format/i.test(text)) return ''
  return text.slice(0, 160)
}

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toIso(value) {
  const raw = String(value || '').trim()
  if (!raw) return new Date().toISOString()
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z'
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function formatDate(value) {
  const d = new Date(toIso(value))
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d)
}
