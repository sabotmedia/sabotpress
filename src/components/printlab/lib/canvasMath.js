export const systemCanvasFontOptions = [
  { label: 'System Sans', value: 'system', family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { label: 'Serif', value: 'serif', family: 'serif' },
  { label: 'Monospace', value: 'monospace', family: '"Courier New", Courier, monospace' },
  { label: 'Impact / Poster', value: 'impact', family: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
  { label: 'Georgia', value: 'georgia', family: 'Georgia, "Times New Roman", serif' },
]

export const googleCanvasFontOptions = [
  { label: 'Oswald', value: 'google-oswald', family: '"Oswald", "Arial Narrow", sans-serif' },
  { label: 'Roboto Condensed', value: 'google-roboto-condensed', family: '"Roboto Condensed", "Arial Narrow", sans-serif' },
  { label: 'Libre Baskerville', value: 'google-libre-baskerville', family: '"Libre Baskerville", Georgia, serif' },
  { label: 'Playfair Display', value: 'google-playfair-display', family: '"Playfair Display", Georgia, serif' },
  { label: 'Bebas Neue', value: 'google-bebas-neue', family: '"Bebas Neue", Impact, sans-serif' },
  { label: 'Archivo Black', value: 'google-archivo-black', family: '"Archivo Black", Impact, sans-serif' },
  { label: 'Merriweather', value: 'google-merriweather', family: '"Merriweather", Georgia, serif' },
  { label: 'Source Serif 4', value: 'google-source-serif-4', family: '"Source Serif 4", Georgia, serif' },
  { label: 'Space Mono', value: 'google-space-mono', family: '"Space Mono", "Courier New", monospace' },
  { label: 'Inter', value: 'google-inter', family: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
]

export const canvasFontOptions = [...systemCanvasFontOptions, ...googleCanvasFontOptions]
export const defaultCanvasSize = { width: 720, height: 540 }
export const canvasPresetOptions = {
  landscape: { label: 'Landscape', width: 720, height: 540 },
  portrait: { label: 'Portrait', width: 540, height: 720 },
  square: { label: 'Square', width: 620, height: 620 },
}

export const canvasResizeHandles = [
  { id: 'nw', cursor: 'nwse-resize' },
  { id: 'n', cursor: 'ns-resize' },
  { id: 'ne', cursor: 'nesw-resize' },
  { id: 'e', cursor: 'ew-resize' },
  { id: 'se', cursor: 'nwse-resize' },
  { id: 's', cursor: 'ns-resize' },
  { id: 'sw', cursor: 'nesw-resize' },
  { id: 'w', cursor: 'ew-resize' },
]

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getFontFormat(filename = '') {
  const extension = String(filename).split('.').pop()?.toLowerCase()
  if (extension === 'ttf') return 'truetype'
  if (extension === 'otf') return 'opentype'
  if (extension === 'woff') return 'woff'
  if (extension === 'woff2') return 'woff2'
  return ''
}

export function getCanvasFontFamily(value, uploadedFonts = []) {
  const uploaded = uploadedFonts.find((font) => font.family === value)
  if (uploaded) return `"${uploaded.family}", ${canvasFontOptions[0].family}`
  return canvasFontOptions.find((option) => option.value === value)?.family || canvasFontOptions[0].family
}

export function getUploadedFontFaceCss(fonts = []) {
  return fonts.map((font) => {
    if (!font?.family || !font?.dataUrl) return ''
    const format = getFontFormat(font.name)
    const formatHint = format ? ` format("${format}")` : ''
    return `@font-face { font-family: "${font.family}"; src: url("${font.dataUrl}")${formatHint}; font-weight: 100 900; font-style: normal; font-display: swap; }`
  }).filter(Boolean).join('\n')
}

export function makeCanvasBlock(type, patch = {}) {
  const base = {
    id: `canvas-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    name: patch.title || (type === 'image' ? 'Image' : 'Text'),
    x: type === 'image' ? 390 : 42,
    y: type === 'image' ? 58 : 46,
    width: type === 'image' ? 280 : 330,
    height: type === 'image' ? 260 : 92,
    text: 'New text',
    src: '',
    title: type === 'image' ? 'Image' : 'Text',
    fontSize: type === 'text' ? 28 : 16,
    fontFamily: 'system',
    fontWeight: type === 'text' ? 800 : 600,
    lineHeight: 1.12,
    color: '#111111',
    align: 'left',
    opacity: 1,
    fit: 'cover',
    mediaX: patch.x ?? (type === 'image' ? 390 : 42),
    mediaY: patch.y ?? (type === 'image' ? 58 : 46),
    mediaWidth: patch.width ?? (type === 'image' ? 280 : 330),
    mediaHeight: patch.height ?? (type === 'image' ? 260 : 92),
    cropLeft: 0,
    cropRight: 0,
    cropTop: 0,
    cropBottom: 0,
  }
  return { ...base, ...patch }
}

export function clampCanvasBlock(block, canvasSize = defaultCanvasSize) {
  const minWidth = 70
  const minHeight = 42
  const width = clampValue(Number(block.width || minWidth), minWidth, canvasSize.width)
  const height = clampValue(Number(block.height || minHeight), minHeight, canvasSize.height)
  return {
    ...block,
    width,
    height,
    x: clampValue(Number(block.x || 0), 0, Math.max(0, canvasSize.width - width)),
    y: clampValue(Number(block.y || 0), 0, Math.max(0, canvasSize.height - height)),
  }
}

export function isCanvasCropBlock(block) {
  return block?.type === 'image'
}

export function getCanvasMediaFrame(block) {
  if (!isCanvasCropBlock(block)) return null
  const frameX = Number(block?.x || 0)
  const frameY = Number(block?.y || 0)
  const frameWidth = Math.max(1, Number(block?.width || 1))
  const frameHeight = Math.max(1, Number(block?.height || 1))
  return {
    frameX,
    frameY,
    frameWidth,
    frameHeight,
    mediaX: Number(block?.mediaX ?? frameX),
    mediaY: Number(block?.mediaY ?? frameY),
    mediaWidth: Math.max(1, Number(block?.mediaWidth || frameWidth)),
    mediaHeight: Math.max(1, Number(block?.mediaHeight || frameHeight)),
  }
}

export function deriveCanvasCropPatch(frame) {
  const cropLeft = Math.max(0, Math.round(frame.frameX - frame.mediaX))
  const cropTop = Math.max(0, Math.round(frame.frameY - frame.mediaY))
  const cropRight = Math.max(0, Math.round((frame.mediaX + frame.mediaWidth) - (frame.frameX + frame.frameWidth)))
  const cropBottom = Math.max(0, Math.round((frame.mediaY + frame.mediaHeight) - (frame.frameY + frame.frameHeight)))
  return {
    x: frame.frameX,
    y: frame.frameY,
    width: frame.frameWidth,
    height: frame.frameHeight,
    mediaX: frame.mediaX,
    mediaY: frame.mediaY,
    mediaWidth: frame.mediaWidth,
    mediaHeight: frame.mediaHeight,
    cropLeft,
    cropRight,
    cropTop,
    cropBottom,
  }
}

export function applyCanvasCropDrag(resizeState, handle, dx, dy) {
  const minVisible = 24
  const mediaLeft = Number(resizeState?.mediaX ?? resizeState?.x ?? 0)
  const mediaTop = Number(resizeState?.mediaY ?? resizeState?.y ?? 0)
  const mediaWidth = Math.max(1, Number(resizeState?.mediaWidth || resizeState?.width || 1))
  const mediaHeight = Math.max(1, Number(resizeState?.mediaHeight || resizeState?.height || 1))
  const mediaRight = mediaLeft + mediaWidth
  const mediaBottom = mediaTop + mediaHeight
  let frameLeft = Number(resizeState?.x || 0)
  let frameTop = Number(resizeState?.y || 0)
  let frameRight = frameLeft + Math.max(1, Number(resizeState?.width || 1))
  let frameBottom = frameTop + Math.max(1, Number(resizeState?.height || 1))

  if (handle.includes('w')) frameLeft = clampValue(frameLeft + dx, mediaLeft, frameRight - minVisible)
  if (handle.includes('e')) frameRight = clampValue(frameRight + dx, frameLeft + minVisible, mediaRight)
  if (handle.includes('n')) frameTop = clampValue(frameTop + dy, mediaTop, frameBottom - minVisible)
  if (handle.includes('s')) frameBottom = clampValue(frameBottom + dy, frameTop + minVisible, mediaBottom)

  return deriveCanvasCropPatch({
    frameX: frameLeft,
    frameY: frameTop,
    frameWidth: frameRight - frameLeft,
    frameHeight: frameBottom - frameTop,
    mediaX: mediaLeft,
    mediaY: mediaTop,
    mediaWidth,
    mediaHeight,
  })
}

export function buildCanvasStarterBlocks({ title, body, imageUrl, imageTitle }) {
  const blocks = [
    makeCanvasBlock('text', {
      id: 'canvas-title',
      title: 'Title',
      text: title || imageTitle || 'Printlab Canvas',
      x: 42,
      y: 44,
      width: imageUrl ? 324 : 636,
      height: 96,
      fontSize: 30,
      fontWeight: 800,
      lineHeight: 1.05,
    }),
  ]

  if (body) {
    blocks.push(makeCanvasBlock('text', {
      id: 'canvas-body',
      title: 'Body',
      text: body,
      x: 44,
      y: 160,
      width: imageUrl ? 314 : 632,
      height: 240,
      fontSize: 15,
      fontWeight: 500,
      lineHeight: 1.38,
    }))
  }

  if (imageUrl) {
    blocks.push(makeCanvasBlock('image', {
      id: 'canvas-image',
      title: imageTitle || 'Image',
      src: imageUrl,
      x: 388,
      y: 58,
      width: 286,
      height: 350,
      fit: 'cover',
    }))
  }

  return blocks
}
