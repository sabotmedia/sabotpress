function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

function sanitizeUrl(url = '', { allowFragments = true } = {}) {
  const value = String(url || '').trim()
  if (!value) return ''
  if (allowFragments && value.startsWith('#')) return value
  if (value.startsWith('/')) return value
  if (value.startsWith('mailto:') || value.startsWith('tel:')) return value

  try {
    const parsed = new URL(value, 'https://example.invalid')
    const protocol = parsed.protocol.toLowerCase()
    if (protocol === 'http:' || protocol === 'https:') {
      if (value.startsWith('http://') || value.startsWith('https://')) return value
      if (value.startsWith('/')) return value
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    }
    return ''
  } catch {
    return ''
  }
}

function inlineMarkdownToHtml(text = '') {
  let html = escapeHtml(text)

  html = html.replace(/\[(.+?)\]\((.+?)\)/g, (_, label, href) => {
    const safeHref = sanitizeUrl(href)
    if (!safeHref) return escapeHtml(label)
    const external = /^https?:\/\//i.test(safeHref)
    return `<a href="${escapeAttr(safeHref)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(label)}</a>`
  })

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  return html
}

function lineLooksLikeHtml(line = '') {
  return /<\s*\/?[a-z][^>]*>/i.test(line)
}

function markdownLikeToHtml(input = '') {
  const lines = String(input || '').replace(/\r\n?/g, '\n').split('\n')
  const chunks = []
  let paragraph = []
  let listType = ''
  let listItems = []

  function flushParagraph() {
    if (!paragraph.length) return
    chunks.push(`<p>${inlineMarkdownToHtml(paragraph.join(' ').trim())}</p>`)
    paragraph = []
  }

  function flushList() {
    if (!listType || !listItems.length) {
      listType = ''
      listItems = []
      return
    }
    chunks.push(`<${listType}>${listItems.map((item) => `<li>${inlineMarkdownToHtml(item)}</li>`).join('')}</${listType}>`)
    listType = ''
    listItems = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      flushList()
      const level = Math.min(6, heading[1].length)
      chunks.push(`<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`)
      continue
    }

    const unordered = line.match(/^[-*]\s+(.+)$/)
    if (unordered) {
      flushParagraph()
      if (listType && listType !== 'ul') flushList()
      listType = 'ul'
      listItems.push(unordered[1])
      continue
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/)
    if (ordered) {
      flushParagraph()
      if (listType && listType !== 'ol') flushList()
      listType = 'ol'
      listItems.push(ordered[1])
      continue
    }

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      flushParagraph()
      flushList()
      chunks.push(`<blockquote><p>${inlineMarkdownToHtml(quote[1] || '')}</p></blockquote>`)
      continue
    }

    if (lineLooksLikeHtml(line)) {
      flushParagraph()
      flushList()
      chunks.push(line)
      continue
    }

    paragraph.push(line)
  }

  flushParagraph()
  flushList()

  return chunks.join('\n')
}

function sanitizeNode(node) {
  if (!node) return ''

  if (node.nodeType === 3) {
    return escapeHtml(node.textContent || '')
  }

  if (node.nodeType !== 1) return ''

  const tag = String(node.tagName || '').toLowerCase()
  const children = Array.from(node.childNodes || []).map((child) => sanitizeNode(child)).join('')

  if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed') {
    return ''
  }

  if (tag === 'a') {
    const safeHref = sanitizeUrl(node.getAttribute('href') || '')
    if (!safeHref) return children
    const external = /^https?:\/\//i.test(safeHref)
    return `<a href="${escapeAttr(safeHref)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${children}</a>`
  }

  if (tag === 'img') {
    const src = sanitizeUrl(node.getAttribute('src') || '', { allowFragments: false })
    if (!src) return ''
    const alt = escapeAttr(node.getAttribute('alt') || '')
    return `<img src="${escapeAttr(src)}" alt="${alt}" />`
  }

  if (tag === 'div') {
    const style = String(node.getAttribute('style') || '').toLowerCase()
    const align = style.match(/text-align\s*:\s*(left|center|right)/)
    if (align) return `<div style="text-align:${align[1]};">${children}</div>`
    // Browsers commonly create plain DIV blocks when Enter is pressed inside
    // contentEditable. Dropping the wrapper destroys paragraph/line boundaries
    // the next time the visual editor reloads the saved HTML.
    return `<div>${children}</div>`
  }

  const allowed = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'blockquote', 'figure', 'figcaption', 'br', 'hr'])
  if (!allowed.has(tag)) return children

  if (tag === 'br' || tag === 'hr') return `<${tag} />`
  return `<${tag}>${children}</${tag}>`
}

function sanitizeHtml(html = '') {
  const value = String(html || '').trim()
  if (!value) return ''

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return value
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(value, 'text/html')
  return Array.from(doc.body.childNodes || []).map((node) => sanitizeNode(node)).join('')
}

export function classicEditorBodyToHtml(body = '') {
  const value = String(body || '').trim()
  if (!value) return ''
  const htmlCandidate = lineLooksLikeHtml(value) ? value : markdownLikeToHtml(value)
  return sanitizeHtml(htmlCandidate)
}
