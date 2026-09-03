const ALLOWED_TAGS = new Set(['A', 'B', 'BR', 'DIV', 'EM', 'H2', 'H3', 'I', 'LI', 'OL', 'P', 'STRONG', 'UL'])

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeHref(value = '') {
  const href = String(value || '').trim()
  if (!href) return ''
  if (/^(javascript|data):/i.test(href)) return ''
  return href
}

function renderAnchor(label, href) {
  const safeHref = normalizeHref(href)
  if (!safeHref) return escapeHtml(label)
  const external = /^https?:\/\//i.test(safeHref)
  const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : ''
  return `<a href="${escapeHtml(safeHref)}"${attrs}>${escapeHtml(label)}</a>`
}

function trimUrlPunctuation(value) {
  let url = String(value || '')
  let suffix = ''
  while (/[.,;:!?)]$/.test(url)) {
    suffix = url.slice(-1) + suffix
    url = url.slice(0, -1)
  }
  return { url, suffix }
}

function linkifyInline(value = '') {
  const text = String(value || '')
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<]+)|([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi
  let out = ''
  let lastIndex = 0
  let match

  while ((match = pattern.exec(text))) {
    out += escapeHtml(text.slice(lastIndex, match.index))

    if (match[1] && match[2]) {
      out += renderAnchor(match[1], match[2])
    } else if (match[3]) {
      const { url, suffix } = trimUrlPunctuation(match[3])
      out += renderAnchor(url, url) + escapeHtml(suffix)
    } else if (match[4]) {
      out += renderAnchor(match[4], `mailto:${match[4]}`)
    }

    lastIndex = pattern.lastIndex
  }

  out += escapeHtml(text.slice(lastIndex))
  return out
}

export function plainTextToEditableHtml(value = '') {
  const normalized = String(value || '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph.split('\n')
      const heading = paragraph.match(/^(#{2,3})\s+(.+)$/)
      if (heading) {
        const Tag = heading[1].length === 2 ? 'h2' : 'h3'
        return `<${Tag}>${linkifyInline(heading[2])}</${Tag}>`
      }

      if (lines.every((line) => /^\s*-\s+/.test(line))) {
        return `<ul>${lines.map((line) => `<li>${linkifyInline(line.replace(/^\s*-\s+/, ''))}</li>`).join('')}</ul>`
      }

      if (lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
        return `<ol>${lines.map((line) => `<li>${linkifyInline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`).join('')}</ol>`
      }

      const renderedLines = lines
        .map((line) => linkifyInline(line))
        .join('<br>')
      return `<p>${renderedLines}</p>`
    })
    .join('')
}

export function editableHtmlToPlainText(html = '') {
  if (typeof document === 'undefined') return String(html || '').replace(/<[^>]+>/g, ' ')
  const node = document.createElement('div')
  node.innerHTML = sanitizeEditableHtml(html)
  return node.innerText || node.textContent || ''
}

export function sanitizeEditableHtml(html = '', options = {}) {
  if (typeof document === 'undefined') {
    return options.multiline === false ? escapeHtml(html).trim() : plainTextToEditableHtml(html)
  }

  const template = document.createElement('template')
  template.innerHTML = String(html || '')

  function htmlToFragment(htmlValue = '') {
    const fragmentTemplate = document.createElement('template')
    fragmentTemplate.innerHTML = htmlValue
    const fragment = document.createDocumentFragment()
    for (const child of Array.from(fragmentTemplate.content.childNodes)) {
      fragment.appendChild(child)
    }
    return fragment
  }

  function sanitizeNode(node, parentTag = '') {
    if (node.nodeType === Node.TEXT_NODE) {
      if (options.linkifyText && parentTag !== 'A') {
        return htmlToFragment(linkifyInline(node.textContent || ''))
      }
      return document.createTextNode(node.textContent || '')
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return document.createTextNode('')
    }

    const tag = node.tagName
    const children = Array.from(node.childNodes).map((child) => sanitizeNode(child, tag))

    if (!ALLOWED_TAGS.has(tag)) {
      const fragment = document.createDocumentFragment()
      for (const child of children) fragment.appendChild(child)
      return fragment
    }

    const element = document.createElement(tag.toLowerCase())
    if (tag === 'A') {
      const href = normalizeHref(node.getAttribute('href'))
      if (href) {
        element.setAttribute('href', href)
        if (/^https?:\/\//i.test(href)) {
          element.setAttribute('rel', 'noopener noreferrer')
          element.setAttribute('target', '_blank')
        }
      }
    }

    for (const child of children) element.appendChild(child)
    return element
  }

  const out = document.createElement('div')
  for (const child of Array.from(template.content.childNodes)) {
    out.appendChild(sanitizeNode(child))
  }

  return normalizeEditableHtml(out.innerHTML, options)
}

export function normalizeEditableHtml(html = '', { multiline = true } = {}) {
  const value = String(html || '')
    .replace(/<div><br><\/div>/gi, '<br>')
    .replace(/<div>/gi, '<p>')
    .replace(/<\/div>/gi, '</p>')
    .replace(/(<br>\s*){3,}/gi, '<br><br>')
    .trim()

  if (!value) return ''
  if (!multiline) {
    return value
      .replace(/<\/?(p|div|ul|ol|li)[^>]*>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  if (/<(p|ul|ol|br)\b/i.test(value)) return value
  return plainTextToEditableHtml(value)
}

export function insertPlainTextAsEditableHtml(text = '') {
  const html = plainTextToEditableHtml(text)
  if (!html) return

  if (document.queryCommandSupported?.('insertHTML')) {
    document.execCommand('insertHTML', false, html)
    return
  }

  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  range.deleteContents()
  const template = document.createElement('template')
  template.innerHTML = html
  range.insertNode(template.content)
}
