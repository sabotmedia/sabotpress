function normalizePage(page, index) {
  if (!page) return null
  const width = Number(page.width || page.canvasSize?.width || 720)
  const height = Number(page.height || page.canvasSize?.height || 540)
  const background = page.background || page.backgroundColor || '#fffdf8'
  return {
    ...page,
    pageNumber: index + 1,
    label: page.label || page.title || `Page ${index + 1}`,
    title: page.title || page.label || `Page ${index + 1}`,
    width,
    height,
    canvasSize: { width, height },
    background,
    backgroundColor: background,
    blocks: Array.isArray(page.blocks) ? page.blocks : [],
  }
}

function getFirstTextBlock(page, index = 0) {
  return (page?.blocks || []).filter((block) => block.type === 'text')[index] || null
}

function getFirstImageBlock(page) {
  return (page?.blocks || []).find((block) => block.type === 'image' && block.src) || null
}

function cleanText(value = '') {
  return String(value || '').trim()
}

const defaultOutputMargins = { top: 10, right: 10, bottom: 10, left: 10 }

function normalizeMargins(margins) {
  return {
    top: Number(margins?.top ?? defaultOutputMargins.top),
    right: Number(margins?.right ?? defaultOutputMargins.right),
    bottom: Number(margins?.bottom ?? defaultOutputMargins.bottom),
    left: Number(margins?.left ?? defaultOutputMargins.left),
  }
}

export const printlabOutputTypes = {
  canvas: 'canvas',
  page: 'page',
  split: 'split',
  tile: 'tile',
  zine: 'zine',
}

export const printlabOutputViews = {
  readerOrder: 'reader-order',
  printLayout: 'print-layout',
}

export function getReaderOrderPages(publication) {
  const pages = Array.isArray(publication?.pages) ? publication.pages : []
  return pages.map((page, index) => normalizePage(page, index)).filter(Boolean)
}

function makeBookletPanel(page, side, sheetNumber, face) {
  return {
    id: `booklet-sheet-${sheetNumber}-${face}-${side}`,
    side,
    label: page ? `${side === 'left' ? 'Left' : 'Right'} panel / Page ${page.pageNumber}` : `${side === 'left' ? 'Left' : 'Right'} panel / Blank`,
    positionLabel: page ? `Page ${page.pageNumber}` : 'Blank',
    page,
  }
}

export function getBookletImposedSpreads(pages) {
  const readerPages = Array.isArray(pages) ? pages.filter(Boolean) : []
  const paddedPageCount = Math.max(4, Math.ceil(Math.max(1, readerPages.length) / 4) * 4)
  const paddedPages = Array.from({ length: paddedPageCount }).map((_, index) => readerPages[index] || null)
  const sheetCount = paddedPageCount / 4
  const spreads = []

  for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex += 1) {
    const sheetNumber = sheetIndex + 1
    const outsideLeft = paddedPageCount - (sheetIndex * 2)
    const outsideRight = 1 + (sheetIndex * 2)
    const insideLeft = 2 + (sheetIndex * 2)
    const insideRight = paddedPageCount - 1 - (sheetIndex * 2)

    spreads.push({
      id: `booklet-sheet-${sheetNumber}-front`,
      label: `Sheet ${sheetNumber} Front`,
      sheetNumber,
      face: 'Front',
      pageNumbers: [outsideLeft, outsideRight],
      panels: [
        makeBookletPanel(paddedPages[outsideLeft - 1], 'left', sheetNumber, 'front'),
        makeBookletPanel(paddedPages[outsideRight - 1], 'right', sheetNumber, 'front'),
      ],
    })

    spreads.push({
      id: `booklet-sheet-${sheetNumber}-back`,
      label: `Sheet ${sheetNumber} Back`,
      sheetNumber,
      face: 'Back',
      pageNumbers: [insideLeft, insideRight],
      panels: [
        makeBookletPanel(paddedPages[insideLeft - 1], 'left', sheetNumber, 'back'),
        makeBookletPanel(paddedPages[insideRight - 1], 'right', sheetNumber, 'back'),
      ],
    })
  }

  return spreads
}

export function getCanvasOutput({
  publication,
  activePageId,
  canvasSize,
  canvasBackground,
  canvasBlocks,
} = {}) {
  const pages = getReaderOrderPages(publication)
  const activePage = pages.find((page) => page.id === activePageId) || pages[0] || null
  return {
    type: printlabOutputTypes.canvas,
    label: activePage ? `${activePage.label} canvas / ${(activePage.blocks || []).length} blocks` : 'Canvas',
    pages,
    activePage,
    canvasSize: canvasSize || activePage?.canvasSize || { width: 720, height: 540 },
    canvasBackground: canvasBackground || activePage?.background || '#fffdf8',
    canvasBlocks: Array.isArray(canvasBlocks) ? canvasBlocks : (activePage?.blocks || []),
  }
}

export function getTileOutput({
  publication,
  rows = 3,
  columns = 3,
  gap = 8,
  fit = 'cover',
  caption = '',
  imageUrl = '',
  missingSourceMessage = '',
  margins,
} = {}) {
  const count = Math.max(1, Number(rows || 1) * Number(columns || 1))
  return {
    type: printlabOutputTypes.tile,
    label: `${rows}x${columns} tile sheet`,
    pages: getReaderOrderPages(publication),
    rows,
    columns,
    gap,
    fit,
    caption,
    imageUrl,
    missingSourceMessage,
    margins: normalizeMargins(margins),
    tiles: Array.from({ length: count }).map((_, index) => ({
      id: `tile-${index}`,
      index,
      imageUrl,
      fit,
      caption,
    })),
  }
}

export function getPosterOutput({
  publication,
  wide = 2,
  tall = 2,
  fit = 'cover',
  showNumbers = true,
  imageUrl = '',
  missingSourceMessage = '',
  margins,
} = {}) {
  const panelCount = Math.max(1, Number(wide || 1) * Number(tall || 1))
  const backgroundSize = fit === 'contain'
    ? `${Number(wide || 1) * 100}% auto`
    : `${Number(wide || 1) * 100}% ${Number(tall || 1) * 100}%`
  return {
    type: printlabOutputTypes.split,
    label: `${wide}x${tall} poster split`,
    pages: getReaderOrderPages(publication),
    wide,
    tall,
    fit,
    showNumbers,
    imageUrl,
    missingSourceMessage,
    margins: normalizeMargins(margins),
    backgroundSize,
    panels: Array.from({ length: panelCount }).map((_, index) => {
      const column = index % wide
      const row = Math.floor(index / wide)
      const x = wide === 1 ? 50 : (column / (wide - 1)) * 100
      const y = tall === 1 ? 50 : (row / (tall - 1)) * 100
      return {
        id: `split-${index}`,
        index,
        column,
        row,
        number: index + 1,
        objectPosition: `${x}% ${y}%`,
      }
    }),
  }
}

export function getPageLayoutOutput({
  publication,
  activePageId,
  usePublicationContent = true,
  orientation = 'portrait',
  imagePosition = 'top',
  title = '',
  body = '',
  footer = '',
  imageUrl = '',
  sourceTitle = '',
  sourceBody = '',
  sourceFooter = '',
  starterBody = '',
  truncateText = (value) => value,
  margins,
} = {}) {
  const pages = getReaderOrderPages(publication)
  const activePage = pages.find((page) => page.id === activePageId) || pages[0] || null
  const titleBlock = usePublicationContent ? getFirstTextBlock(activePage, 0) : null
  const bodyBlock = usePublicationContent ? getFirstTextBlock(activePage, 1) : null
  const imageBlock = usePublicationContent ? getFirstImageBlock(activePage) : null
  const resolvedTitle = cleanText(title) || cleanText(titleBlock?.text) || cleanText(sourceTitle) || 'Flyer / Article Title'
  const resolvedBody = cleanText(body) || cleanText(bodyBlock?.text) || cleanText(truncateText(sourceBody || '', 520)) || starterBody
  const resolvedFooter = cleanText(footer) || cleanText(sourceFooter) || 'Footer / source line'
  const resolvedImageUrl = imageUrl || imageBlock?.src || ''
  const hasPublicationPage = usePublicationContent && activePage && (activePage.blocks || []).length > 0
  const hasContent = Boolean(resolvedImageUrl || cleanText(title) || cleanText(body) || cleanText(footer) || titleBlock || bodyBlock || imageBlock)
  return {
    type: printlabOutputTypes.page,
    label: `${orientation} page layout`,
    view: hasPublicationPage ? printlabOutputViews.readerOrder : printlabOutputViews.printLayout,
    pages,
    activePage,
    publicationPage: hasPublicationPage ? activePage : null,
    orientation,
    imagePosition,
    hasContent,
    imageUrl: resolvedImageUrl,
    titleText: resolvedTitle,
    bodyContent: resolvedBody,
    footerText: resolvedFooter,
    margins: normalizeMargins(margins),
  }
}

export function getHalfFoldOutput({
  publication,
  margins,
} = {}) {
  const pages = getReaderOrderPages(publication)
  const sheets = getBookletImposedSpreads(pages)
  return {
    type: printlabOutputTypes.zine,
    view: printlabOutputViews.printLayout,
    label: `${sheets.length} imposed spread${sheets.length === 1 ? '' : 's'}`,
    pages,
    sheets,
    spreads: sheets.map((sheet) => ({
      id: sheet.id,
      label: sheet.label,
      left: sheet.panels[0].page,
      right: sheet.panels[1].page,
      leftLabel: sheet.panels[0].positionLabel,
      rightLabel: sheet.panels[1].positionLabel,
      face: sheet.face,
      sheetNumber: sheet.sheetNumber,
    })),
    sheetSize: {
      label: 'Letter landscape',
      width: 11,
      height: 8.5,
      unit: 'in',
    },
    margins: normalizeMargins(margins),
    fold: 'vertical-center',
    zineHasContent: true,
  }
}

export function getHalfFoldSpreads(publication) {
  return getHalfFoldOutput({ publication }).spreads
}

export function getOutputLabel(mode, publication) {
  const pageCount = getReaderOrderPages(publication).length
  if (mode === 'zine' || mode === 'half-fold') {
    return `${Math.max(1, Math.ceil(pageCount / 2))} half-fold spread${pageCount <= 2 ? '' : 's'}`
  }
  if (mode === 'canvas') return `Reader order / ${pageCount} page${pageCount === 1 ? '' : 's'}`
  return `Reader order / ${pageCount} page${pageCount === 1 ? '' : 's'}`
}
