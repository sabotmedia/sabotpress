export function createPublicationPage(patch = {}) {
  const id = patch.id || `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const preset = patch.preset || patch.orientation || 'portrait'
  const width = Number(patch.width || patch.canvasSize?.width || 540)
  const height = Number(patch.height || patch.canvasSize?.height || 720)
  const background = patch.background || patch.backgroundColor || '#fffdf8'
  return {
    id,
    label: patch.label || patch.title || 'Page',
    title: patch.title || patch.label || 'Page',
    preset,
    width,
    height,
    canvasSize: patch.canvasSize || { width, height },
    orientation: patch.orientation || preset,
    background,
    backgroundColor: background,
    blocks: Array.isArray(patch.blocks) ? patch.blocks : [],
  }
}

function cleanPostText(text = '') {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function clampValue(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || min))
}

function normalizePrintMargins(marginSettings = {}) {
  return {
    top: clampValue(marginSettings.top ?? marginSettings.margin ?? 10, 0, 96),
    right: clampValue(marginSettings.right ?? marginSettings.margin ?? 10, 0, 96),
    bottom: clampValue(marginSettings.bottom ?? marginSettings.margin ?? 10, 0, 96),
    left: clampValue(marginSettings.left ?? marginSettings.margin ?? 10, 0, 96),
  }
}

function splitLongSentenceByWords(sentence, maxChars) {
  const words = String(sentence || '').trim().split(/\s+/).filter(Boolean)
  const chunks = []
  let current = ''

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      chunks.push(current)
      current = word
    } else {
      current = next
    }
  })

  if (current) chunks.push(current)
  return chunks
}

export function splitTextIntoPageChunks(text = '', maxChars = 900) {
  const paragraphs = cleanPostText(text).split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
  const chunks = []
  let current = ''

  paragraphs.forEach((paragraph) => {
    if (paragraph.length > maxChars) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      const sentences = paragraph.match(/[^.!?]+[.!?]+|\S.+$/g) || [paragraph]
      sentences.forEach((sentence) => {
        const next = current ? `${current} ${sentence.trim()}` : sentence.trim()
        if (sentence.trim().length > maxChars) {
          if (current) {
            chunks.push(current)
            current = ''
          }
          splitLongSentenceByWords(sentence, maxChars).forEach((piece) => {
            if (piece.length > maxChars && current) {
              chunks.push(current)
              current = piece
            } else if (!current) {
              current = piece
            } else {
              const combined = `${current} ${piece}`
              if (combined.length > maxChars) {
                chunks.push(current)
                current = piece
              } else {
                current = combined
              }
            }
          })
          return
        }
        if (next.length > maxChars && current) {
          chunks.push(current)
          current = sentence.trim()
        } else {
          current = next
        }
      })
      return
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph
    if (next.length > maxChars && current) {
      chunks.push(current)
      current = paragraph
    } else {
      current = next
    }
  })

  if (current) chunks.push(current)
  return chunks.length ? chunks : []
}

export function buildZinePublicationFromPost({
  title = '',
  body = '',
  excerpt = '',
  imageUrl = '',
  footer = '',
  background = '#fffdf8',
  marginSettings = {},
} = {}) {
  const pageWidth = 540
  const pageHeight = 720
  const safeTitle = cleanPostText(title) || 'Untitled'
  const safeFooter = cleanPostText(footer)
  const margins = normalizePrintMargins(marginSettings)
  const pageInset = {
    top: 26 + margins.top,
    right: 26 + margins.right,
    bottom: 26 + margins.bottom,
    left: 26 + margins.left,
  }
  const contentX = pageInset.left
  const contentY = pageInset.top
  const contentWidth = pageWidth - pageInset.left - pageInset.right
  const contentHeight = pageHeight - pageInset.top - pageInset.bottom
  const headerHeight = 36
  const footerHeight = safeFooter ? 30 : 16
  const bodyY = contentY + headerHeight + 18
  const bodyHeight = contentHeight - headerHeight - footerHeight - 28
  const targetChars = clampValue(Math.round((contentWidth / 470) * (bodyHeight / 540) * 820), 620, 980)
  const chunks = splitTextIntoPageChunks(body || excerpt, targetChars)
  const titleHeight = imageUrl ? 150 : 260
  const coverImageHeight = imageUrl ? Math.min(290, Math.max(220, Math.round(contentHeight * 0.43))) : 0
  const coverTitleY = imageUrl ? contentY + coverImageHeight + 30 : contentY + Math.round(contentHeight * 0.18)
  const coverFooterText = safeFooter || 'SABOT MEDIA'
  const idPrefix = `zine-${Date.now().toString(36)}`
  const pages = [
    createPublicationPage({
      label: 'Cover',
      title: 'Cover',
      preset: 'portrait',
      width: pageWidth,
      height: pageHeight,
      background,
      backgroundColor: background,
      blocks: [
        ...(imageUrl ? [{
          id: `${idPrefix}-cover-image`,
          type: 'image',
          title: 'Featured image',
          name: 'Featured image',
          src: imageUrl,
          x: contentX,
          y: contentY,
          width: contentWidth,
          height: coverImageHeight,
          opacity: 1,
          fit: 'cover',
          mediaX: contentX,
          mediaY: contentY,
          mediaWidth: contentWidth,
          mediaHeight: coverImageHeight,
          cropLeft: 0,
          cropRight: 0,
          cropTop: 0,
          cropBottom: 0,
        }] : []),
        {
          id: `${idPrefix}-cover-title`,
          type: 'text',
          title: 'Title',
          name: 'Title',
          text: safeTitle,
          x: contentX,
          y: coverTitleY,
          width: contentWidth,
          height: titleHeight,
          fontSize: imageUrl ? 34 : 40,
          fontFamily: 'system',
          fontWeight: 800,
          lineHeight: 1.04,
          color: '#111111',
          align: 'left',
          opacity: 1,
        },
        {
          id: `${idPrefix}-cover-source`,
          type: 'text',
          title: 'Source line',
          name: 'Source line',
          text: coverFooterText,
          x: contentX,
          y: pageHeight - pageInset.bottom - 28,
          width: contentWidth,
          height: 28,
          fontSize: 10,
          fontFamily: 'system',
          fontWeight: 700,
          lineHeight: 1.25,
          color: '#555555',
          align: 'left',
          opacity: 1,
        },
      ],
    }),
  ]

  chunks.forEach((chunk, index) => {
    const pageNumber = index + 2
    pages.push(createPublicationPage({
      label: `Page ${pageNumber}`,
      title: `Page ${pageNumber}`,
      preset: 'portrait',
      width: pageWidth,
      height: pageHeight,
      background,
      backgroundColor: background,
      blocks: [
        {
          id: `${idPrefix}-page-${pageNumber}-header`,
          type: 'text',
          title: 'Article title',
          name: 'Article title',
          text: safeTitle,
          x: contentX,
          y: contentY,
          width: contentWidth,
          height: headerHeight,
          fontSize: 11,
          fontFamily: 'system',
          fontWeight: 800,
          lineHeight: 1.2,
          color: '#555555',
          align: 'left',
          opacity: 1,
        },
        {
          id: `${idPrefix}-page-${pageNumber}-body`,
          type: 'text',
          title: 'Article text',
          name: 'Article text',
          text: chunk,
          x: contentX,
          y: bodyY,
          width: contentWidth,
          height: bodyHeight,
          fontSize: 15,
          fontFamily: 'serif',
          fontWeight: 500,
          lineHeight: 1.42,
          color: '#111111',
          align: 'left',
          opacity: 1,
        },
        {
          id: `${idPrefix}-page-${pageNumber}-number`,
          type: 'text',
          title: 'Page number',
          name: 'Page number',
          text: String(pageNumber),
          x: contentX,
          y: pageHeight - pageInset.bottom - 20,
          width: contentWidth,
          height: 20,
          fontSize: 10,
          fontFamily: 'system',
          fontWeight: 700,
          lineHeight: 1.2,
          color: '#777777',
          align: pageNumber % 2 === 0 ? 'left' : 'right',
          opacity: 1,
        },
      ],
    }))
  })

  if (safeFooter && pages.length > 2) {
    pages.push(createPublicationPage({
      label: 'Back / Colophon',
      title: 'Back / Colophon',
      preset: 'portrait',
      width: pageWidth,
      height: pageHeight,
      background,
      backgroundColor: background,
      blocks: [
        {
          id: `${idPrefix}-colophon-title`,
          type: 'text',
          title: 'Colophon label',
          name: 'Colophon label',
          text: 'Colophon',
          x: contentX,
          y: contentY + Math.round(contentHeight * 0.32),
          width: contentWidth,
          height: 42,
          fontSize: 16,
          fontFamily: 'system',
          fontWeight: 800,
          lineHeight: 1.15,
          color: '#111111',
          align: 'center',
          opacity: 1,
        },
        {
          id: `${idPrefix}-colophon-body`,
          type: 'text',
          title: 'Source',
          name: 'Source',
          text: safeFooter,
          x: contentX,
          y: contentY + Math.round(contentHeight * 0.42),
          width: contentWidth,
          height: 130,
          fontSize: 13,
          fontFamily: 'system',
          fontWeight: 600,
          lineHeight: 1.35,
          color: '#333333',
          align: 'center',
          opacity: 1,
        },
      ],
    }))
  }

  return pages
}

export function buildPublicationPagesFromPost({
  title = '',
  body = '',
  excerpt = '',
  imageUrl = '',
  footer = '',
  background = '#fffdf8',
} = {}) {
  const pageWidth = 540
  const pageHeight = 720
  const safeTitle = cleanPostText(title) || 'Untitled'
  const chunks = splitTextIntoPageChunks(body || excerpt, 820)
  const pages = [
    createPublicationPage({
      label: 'Cover',
      title: 'Cover',
      preset: 'portrait',
      width: pageWidth,
      height: pageHeight,
      background,
      backgroundColor: background,
      blocks: [
        {
          id: 'post-cover-title',
          type: 'text',
          title: 'Title',
          name: 'Title',
          text: safeTitle,
          x: 44,
          y: imageUrl ? 382 : 170,
          width: 452,
          height: 148,
          fontSize: 40,
          fontFamily: 'system',
          fontWeight: 800,
          lineHeight: 1.04,
          color: '#111111',
          align: 'left',
          opacity: 1,
        },
        ...(imageUrl ? [{
          id: 'post-cover-image',
          type: 'image',
          title: 'Featured image',
          name: 'Featured image',
          src: imageUrl,
          x: 44,
          y: 48,
          width: 452,
          height: 300,
          opacity: 1,
          fit: 'cover',
          mediaX: 44,
          mediaY: 48,
          mediaWidth: 452,
          mediaHeight: 300,
          cropLeft: 0,
          cropRight: 0,
          cropTop: 0,
          cropBottom: 0,
        }] : []),
      ],
    }),
  ]

  chunks.forEach((chunk, index) => {
    pages.push(createPublicationPage({
      label: `Article ${index + 1}`,
      title: `Article ${index + 1}`,
      preset: 'portrait',
      width: pageWidth,
      height: pageHeight,
      background,
      backgroundColor: background,
      blocks: [
        {
          id: `post-page-kicker-${index + 1}`,
          type: 'text',
          title: 'Section label',
          name: 'Section label',
          text: safeTitle,
          x: 44,
          y: 42,
          width: 452,
          height: 40,
          fontSize: 13,
          fontFamily: 'system',
          fontWeight: 800,
          lineHeight: 1.15,
          color: '#555555',
          align: 'left',
          opacity: 1,
        },
        {
          id: `post-page-body-${index + 1}`,
          type: 'text',
          title: 'Article text',
          name: 'Article text',
          text: chunk,
          x: 44,
          y: 98,
          width: 452,
          height: 540,
          fontSize: 16,
          fontFamily: 'serif',
          fontWeight: 500,
          lineHeight: 1.38,
          color: '#111111',
          align: 'left',
          opacity: 1,
        },
      ],
    }))
  })

  if (footer) {
    pages.push(createPublicationPage({
      label: 'Colophon',
      title: 'Colophon',
      preset: 'portrait',
      width: pageWidth,
      height: pageHeight,
      background,
      backgroundColor: background,
      blocks: [
        {
          id: 'post-colophon',
          type: 'text',
          title: 'Colophon',
          name: 'Colophon',
          text: footer,
          x: 54,
          y: 270,
          width: 432,
          height: 180,
          fontSize: 18,
          fontFamily: 'system',
          fontWeight: 700,
          lineHeight: 1.3,
          color: '#111111',
          align: 'center',
          opacity: 1,
        },
      ],
    }))
  }

  return pages
}

export function createEmptyPublication(patch = {}) {
  const firstPage = createPublicationPage({ id: 'page-1', label: 'Page 1', title: 'Page 1' })
  const pages = Array.isArray(patch.pages) && patch.pages.length ? patch.pages : [firstPage]
  return {
    id: patch.id || `publication-${Date.now()}`,
    title: patch.title || 'Untitled Publication',
    pages,
    activePageId: patch.activePageId || pages[0]?.id || firstPage.id,
    assets: Array.isArray(patch.assets) ? patch.assets : [],
    outputSettings: {
      mode: patch.outputSettings?.mode || 'reader',
      format: patch.outputSettings?.format || 'letter',
    },
  }
}

export function getActivePage(publication) {
  const pages = Array.isArray(publication?.pages) ? publication.pages : []
  return pages.find((page) => page.id === publication?.activePageId) || pages[0] || null
}

export function duplicatePublicationPage(publication, pageId = publication?.activePageId) {
  const pages = Array.isArray(publication?.pages) ? publication.pages : []
  const index = pages.findIndex((page) => page.id === pageId)
  if (index < 0) return publication
  const source = pages[index]
  const duplicate = createPublicationPage({
    ...source,
    id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: `${source.label || 'Page'} Copy`,
    title: `${source.title || source.label || 'Page'} Copy`,
    blocks: (source.blocks || []).map((block) => ({
      ...block,
      id: `${block.id || block.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    })),
  })
  const nextPages = pages.slice()
  nextPages.splice(index + 1, 0, duplicate)
  return { ...publication, pages: nextPages, activePageId: duplicate.id }
}

export function deletePublicationPage(publication, pageId = publication?.activePageId) {
  const pages = Array.isArray(publication?.pages) ? publication.pages : []
  if (pages.length <= 1) return publication
  const index = pages.findIndex((page) => page.id === pageId)
  const nextPages = pages.filter((page) => page.id !== pageId)
  const nextActive = nextPages[Math.max(0, Math.min(index, nextPages.length - 1))] || nextPages[0]
  return { ...publication, pages: nextPages, activePageId: nextActive?.id || '' }
}
