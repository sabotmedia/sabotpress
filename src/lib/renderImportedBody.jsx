import { Fragment } from 'react'

function makeKey(prefix, index) {
  return `${prefix}-${index}`
}

function renderInlineHTML(tag, className, html, key) {
  const Tag = tag
  return <Tag key={key} className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

function renderHeading(tag, className, node, key) {
  const Tag = tag
  const id = node.getAttribute('id') || slugifyHeading(node.textContent || key)
  return <Tag key={key} id={id} className={className} dangerouslySetInnerHTML={{ __html: node.innerHTML || '' }} />
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

function normalizeHref(href = '') {
  const value = String(href || '').trim()
  if (!value) return '#'
  return value
}

function isBlockedPublicHref(href = '') {
  const value = String(href || '').trim().toLowerCase()
  if (!value) return true
  if (value.includes('/wp-admin')) return true
  if (value === '/draft' || value.startsWith('/draft/')) return true
  if (value.startsWith('/admin') || value.startsWith('/customize') || value.startsWith('/site-editor')) return true
  return false
}

function sanitizePublicBodyLinks(doc) {
  const links = Array.from(doc?.body?.querySelectorAll('a[href]') || [])
  links.forEach((link) => {
    const href = normalizeHref(link.getAttribute('href'))
    if (isBlockedPublicHref(href)) {
      link.setAttribute('href', '/archive')
      link.setAttribute('rel', 'nofollow noopener noreferrer')
    }
  })
}

function renderChildren(nodes, mode, prefix = 'node') {
  return nodes.map((node, index) => renderNode(node, mode, makeKey(prefix, index))).filter(Boolean)
}

function looksLikeRawHtmlText(text = '') {
  const value = String(text || '').trim()
  if (!value) return false
  return /<\/?[a-z][^>]*>/i.test(value)
}

function parseHtmlFragment(value = '') {
  if (typeof DOMParser === 'undefined') return []
  const parser = new DOMParser()
  const doc = parser.parseFromString(String(value || ''), 'text/html')
  return Array.from(doc.body.childNodes || [])
}

function isMeaningfulElement(node) {
  if (!node) return false
  if (node.nodeType === 3) return Boolean((node.textContent || '').trim())
  if (node.nodeType !== 1) return false
  const tag = String(node.tagName || '').toLowerCase()
  if (['script', 'style', 'noscript'].includes(tag)) return false
  if (['img', 'iframe', 'video', 'audio', 'blockquote', 'hr'].includes(tag)) return true
  return Boolean((node.textContent || '').trim() || node.children?.length)
}

function normalizeBodyNodes(nodes = []) {
  const normalized = []
  let previousSignature = ''

  for (const node of nodes) {
    if (!isMeaningfulElement(node)) continue
    const tag = node.nodeType === 1 ? String(node.tagName || '').toLowerCase() : 'text'
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const imgSrc = node.nodeType === 1 ? (node.getAttribute('src') || node.querySelector?.('img')?.getAttribute('src') || '') : ''
    const href = node.nodeType === 1 ? (node.getAttribute('href') || node.querySelector?.('a[href]')?.getAttribute('href') || '') : ''
    const signature = `${tag}|${imgSrc}|${href}|${text}`
    if (signature && signature === previousSignature) continue
    previousSignature = signature
    normalized.push(node)
  }

  return normalized
}

function renderNode(node, mode, key) {
  if (!node) return null

  if (node.nodeType === 3) {
    const text = node.textContent || ''
    if (!text.trim()) return null
    return <Fragment key={key}>{text}</Fragment>
  }

  if (node.nodeType !== 1) return null

  const tag = String(node.tagName || '').toLowerCase()
  const html = node.innerHTML || ''

  switch (tag) {
    case 'p':
      if (!node.children.length && looksLikeRawHtmlText(node.textContent || '')) {
        const parsed = parseHtmlFragment(node.textContent || '')
        return (
          <div key={key} className="post-body__block">
            {renderChildren(parsed, mode, `${key}-html`)}
          </div>
        )
      }
      return renderInlineHTML('p', 'post-body__paragraph', html, key)

    case 'a': {
      const href = normalizeHref(node.getAttribute('href'))
      if (isBlockedPublicHref(href)) return <Fragment key={key}>{renderChildren(Array.from(node.childNodes || []), mode, key)}</Fragment>
      const external = /^https?:\/\//i.test(href)
      return (
        <a
          key={key}
          className="post-body__link"
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
        >
          {renderChildren(Array.from(node.childNodes || []), mode, key)}
        </a>
      )
    }

    case 'h1':
      return renderHeading('h1', 'post-body__heading post-body__heading--1', node, key)

    case 'h2':
      return renderHeading('h2', 'post-body__heading post-body__heading--2', node, key)

    case 'h3':
      return renderHeading('h3', 'post-body__heading post-body__heading--3', node, key)

    case 'h4':
    case 'h5':
    case 'h6':
      return renderHeading('h4', 'post-body__heading post-body__heading--4', node, key)

    case 'blockquote':
      return (
        <blockquote key={key} className="post-body__blockquote" dangerouslySetInnerHTML={{ __html: html }} />
      )

    case 'figure': {
      const img = node.querySelector('img')
      const caption = node.querySelector('figcaption')
      const src = img?.getAttribute('src') || ''
      const alt = img?.getAttribute('alt') || ''
      const captionHtml = caption?.innerHTML || ''
      if (!src) return null

      return (
        <figure
          key={key}
          className={`post-body__figure${mode === 'experience' ? ' post-body__figure--experience' : ''}`}
        >
          <img className="post-body__image" src={src} alt={alt} loading="lazy" />
          {captionHtml ? (
            <figcaption
              className="post-body__caption"
              dangerouslySetInnerHTML={{ __html: captionHtml }}
            />
          ) : null}
        </figure>
      )
    }

    case 'img': {
      const src = node.getAttribute('src') || ''
      const alt = node.getAttribute('alt') || ''
      if (!src) return null
      return (
        <figure
          key={key}
          className={`post-body__figure${mode === 'experience' ? ' post-body__figure--experience' : ''}`}
        >
          <img className="post-body__image" src={src} alt={alt} loading="lazy" />
        </figure>
      )
    }

    case 'ul':
      return (
        <ul key={key} className="post-body__list">
          {renderChildren(Array.from(node.childNodes || []), mode, key)}
        </ul>
      )

    case 'ol':
      return (
        <ol key={key} className="post-body__list post-body__list--ordered">
          {renderChildren(Array.from(node.childNodes || []), mode, key)}
        </ol>
      )

    case 'li':
      return (
        <li key={key} className="post-body__list-item" dangerouslySetInnerHTML={{ __html: html }} />
      )

    case 'hr':
      return <hr key={key} className="post-body__rule" />

    case 'pre':
      return (
        <pre key={key} className="post-body__pre" dangerouslySetInnerHTML={{ __html: html }} />
      )

    case 'iframe':
      return (
        <div
          key={key}
          className={`post-body__embed${mode === 'experience' ? ' post-body__embed--experience' : ''}`}
          dangerouslySetInnerHTML={{ __html: node.outerHTML }}
        />
      )

    case 'video':
    case 'audio':
      return (
        <figure key={key} className={`post-body__figure${mode === 'experience' ? ' post-body__figure--experience' : ''}`}>
          <div className="post-body__embed" dangerouslySetInnerHTML={{ __html: node.outerHTML }} />
        </figure>
      )

    case 'div':
    case 'section':
    case 'article':
      return (
        <div key={key} className="post-body__block">
          {renderChildren(Array.from(node.childNodes || []), mode, key)}
        </div>
      )

    default:
      return (
        <div key={key} className="post-body__block">
          {renderChildren(Array.from(node.childNodes || []), mode, key)}
        </div>
      )
  }
}

export function renderImportedBody(html, mode = 'read') {
  const value = String(html || '').trim()
  if (!value) return []

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return [
      <div
        key="server-fallback"
        className="post-body__fallback-html"
        dangerouslySetInnerHTML={{ __html: value }}
      />,
    ]
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(value, 'text/html')
  sanitizePublicBodyLinks(doc)
  const bodyNodes = normalizeBodyNodes(Array.from(doc.body.childNodes || []))
  return renderChildren(bodyNodes, mode, 'body')
}

export function extractLeadFromHtml(html = '') {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return ''
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(String(html || ''), 'text/html')
  const firstParagraph = doc.body.querySelector('p')
  return (firstParagraph?.textContent || '').trim()
}

export function normalizeLinkTarget(href = '') {
  const value = normalizeHref(href)
  if (
    value.startsWith('mailto:') ||
    value.startsWith('tel:') ||
    value.startsWith('#') ||
    value.startsWith('/')
  ) {
    return { href: value, external: false }
  }
  return { href: value, external: true }
}
