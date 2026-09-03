function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

const bundledSegmentationEndpoint = '/api/printlab/segment'

function getSegmentationEndpoint() {
  if (typeof window !== 'undefined' && window.__PRINTLAB_SEGMENTATION_ENDPOINT__) {
    return window.__PRINTLAB_SEGMENTATION_ENDPOINT__
  }
  return import.meta.env?.VITE_PRINTLAB_SEGMENTATION_ENDPOINT || bundledSegmentationEndpoint
}

function getPixelIndex(width, x, y) {
  return ((y * width) + x) * 4
}

function colorDistance(data, index, color) {
  const dr = data[index] - color[0]
  const dg = data[index + 1] - color[1]
  const db = data[index + 2] - color[2]
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db))
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function estimateBackgroundColor(data, width, height) {
  const samples = []
  const samplePoint = (x, y) => {
    const index = getPixelIndex(width, clampValue(Math.round(x), 0, width - 1), clampValue(Math.round(y), 0, height - 1))
    samples.push([data[index], data[index + 1], data[index + 2]])
  }
  const inset = Math.max(1, Math.round(Math.min(width, height) * 0.03))
  const step = Math.max(1, Math.floor(Math.max(width, height) / 36))
  for (let x = 0; x < width; x += step) {
    samplePoint(x, 0)
    samplePoint(x, height - 1)
    samplePoint(x, inset)
    samplePoint(x, height - inset - 1)
  }
  for (let y = 0; y < height; y += step) {
    samplePoint(0, y)
    samplePoint(width - 1, y)
    samplePoint(inset, y)
    samplePoint(width - inset - 1, y)
  }

  const clusters = []
  samples.forEach((sample) => {
    const cluster = clusters.find((item) => {
      const dr = sample[0] - item.color[0]
      const dg = sample[1] - item.color[1]
      const db = sample[2] - item.color[2]
      return Math.sqrt((dr * dr) + (dg * dg) + (db * db)) < 34
    })
    if (!cluster) {
      clusters.push({ color: sample.slice(), samples: [sample] })
      return
    }
    cluster.samples.push(sample)
    cluster.color = [
      median(cluster.samples.map((item) => item[0])),
      median(cluster.samples.map((item) => item[1])),
      median(cluster.samples.map((item) => item[2])),
    ]
  })

  const dominant = clusters.sort((a, b) => b.samples.length - a.samples.length)[0]
  return dominant?.color || [
    median(samples.map((sample) => sample[0])),
    median(samples.map((sample) => sample[1])),
    median(samples.map((sample) => sample[2])),
  ]
}

function buildBackgroundMask(frame, options = {}) {
  const { width, height, data } = frame
  const tolerance = Number(options.colorTolerance ?? options.edgeTolerance ?? 58)
  const looseTolerance = tolerance + 22
  const backgroundColor = estimateBackgroundColor(data, width, height)
  const total = width * height
  const backgroundMask = new Uint8Array(total)
  const visited = new Uint8Array(total)
  const queue = []

  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const position = (y * width) + x
    if (visited[position]) return
    visited[position] = 1
    queue.push(position)
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0)
    enqueue(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y)
    enqueue(width - 1, y)
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const position = queue[cursor]
    const x = position % width
    const y = Math.floor(position / width)
    const index = position * 4
    const alpha = data[index + 3]
    const distance = colorDistance(data, index, backgroundColor)
    if (alpha < 12 || distance <= looseTolerance) {
      backgroundMask[position] = 1
      enqueue(x + 1, y)
      enqueue(x - 1, y)
      enqueue(x, y + 1)
      enqueue(x, y - 1)
    }
  }

  return { backgroundMask, backgroundColor, tolerance }
}

function makeForegroundMask(frame, backgroundMask, backgroundColor, tolerance) {
  const { width, height, data } = frame
  const foregroundMask = new Uint8Array(width * height)
  for (let position = 0; position < foregroundMask.length; position += 1) {
    const index = position * 4
    if (data[index + 3] < 24 || backgroundMask[position]) continue
    const distance = colorDistance(data, index, backgroundColor)
    if (distance > tolerance) foregroundMask[position] = 1
  }
  return foregroundMask
}

function getMaskBounds(mask, width, height) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let area = 0
  for (let position = 0; position < mask.length; position += 1) {
    if (!mask[position]) continue
    const x = position % width
    const y = Math.floor(position / width)
    area += 1
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  if (!area) return { x: 0, y: 0, width: 0, height: 0, area: 0 }
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    area,
  }
}

function featherAlpha(data, width, height, backgroundMask, featherPixels = 1) {
  if (!featherPixels) return
  const originalAlpha = new Uint8ClampedArray(width * height)
  for (let position = 0; position < originalAlpha.length; position += 1) {
    originalAlpha[position] = data[(position * 4) + 3]
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const position = (y * width) + x
      if (backgroundMask[position] || !originalAlpha[position]) continue
      let touchesBackground = false
      for (let dy = -featherPixels; dy <= featherPixels && !touchesBackground; dy += 1) {
        for (let dx = -featherPixels; dx <= featherPixels; dx += 1) {
          if (!dx && !dy) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || backgroundMask[(ny * width) + nx]) {
            touchesBackground = true
            break
          }
        }
      }
      if (touchesBackground) data[(position * 4) + 3] = Math.min(originalAlpha[position], 210)
    }
  }
}

function connectedComponents(mask, width, height, options = {}) {
  const visited = new Uint8Array(mask.length)
  const minArea = Math.max(12, Math.round(mask.length * Number(options.minAreaRatio ?? 0.003)))
  const components = []
  const queue = []

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue
    let area = 0
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    queue.length = 0
    visited[start] = 1
    queue.push(start)

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const position = queue[cursor]
      const x = position % width
      const y = Math.floor(position / width)
      area += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)

      const neighbors = [position - 1, position + 1, position - width, position + width]
      for (const next of neighbors) {
        if (next < 0 || next >= mask.length || visited[next] || !mask[next]) continue
        const nx = next % width
        if ((next === position - 1 && nx !== x - 1) || (next === position + 1 && nx !== x + 1)) continue
        visited[next] = 1
        queue.push(next)
      }
    }

    if (area >= minArea) components.push({ area, minX, minY, maxX, maxY })
  }

  return components
}

function mergeNearbyComponents(components, mergeDistance = 10) {
  const merged = []
  components.forEach((component) => {
    const target = merged.find((item) => !(
      component.minX > item.maxX + mergeDistance ||
      component.maxX < item.minX - mergeDistance ||
      component.minY > item.maxY + mergeDistance ||
      component.maxY < item.minY - mergeDistance
    ))
    if (!target) {
      merged.push({ ...component })
      return
    }
    target.area += component.area
    target.minX = Math.min(target.minX, component.minX)
    target.minY = Math.min(target.minY, component.minY)
    target.maxX = Math.max(target.maxX, component.maxX)
    target.maxY = Math.max(target.maxY, component.maxY)
  })
  return merged
}

function decodeBase64Bytes(value = '') {
  const base64 = String(value || '').includes(',') ? String(value).split(',').pop() : String(value || '')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function decodeRleMask(mask, width, height) {
  const counts = Array.isArray(mask?.counts) ? mask.counts : []
  const bytes = new Uint8Array(width * height)
  let cursor = 0
  let value = Number(mask?.startsWithForeground ? 1 : 0)
  for (const count of counts) {
    const run = Math.max(0, Number(count) || 0)
    bytes.fill(value, cursor, Math.min(bytes.length, cursor + run))
    cursor += run
    value = value ? 0 : 1
    if (cursor >= bytes.length) break
  }
  return bytes
}

function decodeMaskBytes(mask, width, height) {
  if (!mask) return null
  if (Array.isArray(mask)) return Uint8Array.from(mask.map((value) => (value ? 1 : 0)))
  if (typeof mask === 'string' && !mask.startsWith('data:image/')) {
    return decodeBase64Bytes(mask).map((value) => (value ? 1 : 0))
  }
  if (typeof mask === 'object' && Array.isArray(mask.counts)) return decodeRleMask(mask, width, height)
  if (typeof mask === 'object' && Array.isArray(mask.data)) return Uint8Array.from(mask.data.map((value) => (value ? 1 : 0)))
  if (typeof mask === 'object' && typeof mask.data === 'string') return decodeBase64Bytes(mask.data).map((value) => (value ? 1 : 0))
  return null
}

async function maskImageToBytes(maskSrc, width, height) {
  const image = await loadImageForCanvas(maskSrc)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas image processing is unavailable in this browser.')
  context.drawImage(image, 0, 0, width, height)
  const frame = context.getImageData(0, 0, width, height)
  const bytes = new Uint8Array(width * height)
  for (let position = 0; position < bytes.length; position += 1) {
    const index = position * 4
    const alpha = frame.data[index + 3]
    const luminance = (frame.data[index] + frame.data[index + 1] + frame.data[index + 2]) / 3
    bytes[position] = alpha > 16 && luminance > 16 ? 1 : 0
  }
  return bytes
}

export async function maskToTransparentPng(src, mask, bbox, sourceWidth, sourceHeight) {
  const [boxX = 0, boxY = 0, boxWidth = sourceWidth, boxHeight = sourceHeight] = Array.isArray(bbox) ? bbox : [0, 0, sourceWidth, sourceHeight]
  const { canvas, context, width, height, scale } = await imageToCanvas(src, Math.max(sourceWidth || 1, sourceHeight || 1))
  const frame = context.getImageData(0, 0, width, height)
  const maskWidth = Math.max(1, Math.round(Number(mask?.width || sourceWidth || width) * scale))
  const maskHeight = Math.max(1, Math.round(Number(mask?.height || sourceHeight || height) * scale))
  let maskBytes = typeof mask === 'string' && mask.startsWith('data:image/')
    ? await maskImageToBytes(mask, maskWidth, maskHeight)
    : decodeMaskBytes(mask, maskWidth, maskHeight)
  if (!maskBytes) throw new Error('Segmentation endpoint returned an unreadable mask.')

  const minX = clampValue(Math.round(boxX * scale), 0, width - 1)
  const minY = clampValue(Math.round(boxY * scale), 0, height - 1)
  const cropWidth = Math.max(1, clampValue(Math.round(boxWidth * scale), 1, width - minX))
  const cropHeight = Math.max(1, clampValue(Math.round(boxHeight * scale), 1, height - minY))
  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = cropWidth
  outputCanvas.height = cropHeight
  const outputContext = outputCanvas.getContext('2d', { willReadFrequently: true })
  if (!outputContext) throw new Error('Canvas image processing is unavailable in this browser.')
  const outputFrame = outputContext.createImageData(cropWidth, cropHeight)

  const maskCoversCrop = maskBytes.length === cropWidth * cropHeight
  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const sourceX = minX + x
      const sourceY = minY + y
      const sourceIndex = ((sourceY * width) + sourceX) * 4
      const maskIndex = maskCoversCrop ? (y * cropWidth) + x : (sourceY * maskWidth) + sourceX
      if (!maskBytes[maskIndex]) continue
      const targetIndex = ((y * cropWidth) + x) * 4
      outputFrame.data[targetIndex] = frame.data[sourceIndex]
      outputFrame.data[targetIndex + 1] = frame.data[sourceIndex + 1]
      outputFrame.data[targetIndex + 2] = frame.data[sourceIndex + 2]
      outputFrame.data[targetIndex + 3] = frame.data[sourceIndex + 3]
    }
  }

  outputContext.putImageData(outputFrame, 0, 0)
  return outputCanvas.toDataURL('image/png')
}

export async function requestSegmentation(src, mode, options = {}) {
  const endpoint = getSegmentationEndpoint()
  if (!endpoint || !globalThis.fetch) return null
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 120000))
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeout = controller ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ image: src, mode, options }),
      signal: controller?.signal,
    })
    if (res.status === 404 || res.status === 501) return null
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || `Segmentation failed: ${res.status}`)
    if (!data || typeof data !== 'object') return null
    return data
  } finally {
    if (timeout) globalThis.clearTimeout(timeout)
  }
}

async function normalizeRemoteObjects(src, data) {
  const sourceWidth = Math.max(1, Number(data?.sourceWidth || 1))
  const sourceHeight = Math.max(1, Number(data?.sourceHeight || 1))
  const objects = []
  for (const object of Array.isArray(data?.objects) ? data.objects : []) {
    const bbox = Array.isArray(object?.bbox)
      ? object.bbox
      : [object?.x || 0, object?.y || 0, object?.width || sourceWidth, object?.height || sourceHeight]
    const objectSrc = object?.src || (object?.mask ? await maskToTransparentPng(src, object.mask, bbox, sourceWidth, sourceHeight) : '')
    if (!objectSrc) continue
    const [x, y, width, height] = bbox
    objects.push({
      id: object?.id || `remote-object-${objects.length + 1}`,
      src: objectSrc,
      bbox,
      x,
      y,
      width,
      height,
      area: Number(object?.area || width * height),
      score: Number(object?.score || 0),
      source: 'segmentation-endpoint',
    })
  }
  return { sourceWidth, sourceHeight, objects }
}

async function normalizeRemoteForeground(src, data) {
  const foreground = data?.foreground || {}
  const sourceWidth = Math.max(1, Number(data?.sourceWidth || foreground.sourceWidth || 1))
  const sourceHeight = Math.max(1, Number(data?.sourceHeight || foreground.sourceHeight || 1))
  const bbox = Array.isArray(foreground.bbox) ? foreground.bbox : [0, 0, sourceWidth, sourceHeight]
  const foregroundSrc = foreground.src || (foreground.mask ? await maskToTransparentPng(src, foreground.mask, bbox, sourceWidth, sourceHeight) : '')
  if (!foregroundSrc) return null
  const [, , width, height] = bbox
  return {
    src: foregroundSrc,
    bounds: { x: bbox[0], y: bbox[1], width, height },
    foregroundRatio: Number(foreground.foregroundRatio || ((width * height) / Math.max(1, sourceWidth * sourceHeight))),
    score: Number(foreground.score || 0),
    source: 'segmentation-endpoint',
  }
}

export function loadImageForCanvas(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('No image source was provided.'))
      return
    }
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load the selected image for canvas processing.'))
    if (/^https?:/i.test(src)) image.crossOrigin = 'anonymous'
    image.src = src
  })
}

export async function imageToCanvas(src, maxSide = 1600) {
  const image = await loadImageForCanvas(src)
  const sourceWidth = image.naturalWidth || image.width || 1
  const sourceHeight = image.naturalHeight || image.height || 1
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas image processing is unavailable in this browser.')
  context.drawImage(image, 0, 0, width, height)
  return { canvas, context, width, height, scale }
}

export async function removeBackgroundFromImage(src, options = {}) {
  if (!options.forceFallback) {
    try {
      const remote = await requestSegmentation(src, 'foreground', options)
      const normalized = remote ? await normalizeRemoteForeground(src, remote) : null
      if (normalized?.src) return normalized
    } catch (err) {
      if (options.failOnEndpointError) throw err
    }
  }

  const { canvas, context, width, height, scale } = await imageToCanvas(src, options.maxSide || 1600)
  const frame = context.getImageData(0, 0, width, height)
  const { backgroundMask, backgroundColor, tolerance } = buildBackgroundMask(frame, options)
  const foregroundMask = makeForegroundMask(frame, backgroundMask, backgroundColor, tolerance)
  const bounds = getMaskBounds(foregroundMask, width, height)
  const foregroundRatio = bounds.area / Math.max(1, width * height)
  const minForegroundRatio = Number(options.minForegroundRatio ?? 0.01)
  const maxForegroundRatio = Number(options.maxForegroundRatio ?? 0.92)
  if (foregroundRatio < minForegroundRatio) {
    throw new Error('Background removal could not find a clear foreground subject.')
  }
  if (foregroundRatio > maxForegroundRatio) {
    throw new Error('Background removal could not identify a separable background.')
  }
  const data = frame.data
  for (let position = 0; position < backgroundMask.length; position += 1) {
    const index = position * 4
    if (backgroundMask[position]) {
      data[index + 3] = 0
      continue
    }
    const distance = colorDistance(data, index, backgroundColor)
    if (distance < tolerance) {
      data[index + 3] = Math.min(data[index + 3], Math.round((distance / tolerance) * 255))
    }
  }
  featherAlpha(data, width, height, backgroundMask, Number(options.featherPixels ?? 1))
  context.putImageData(frame, 0, 0)
  return {
    src: canvas.toDataURL('image/png'),
    bounds: {
      x: bounds.x / scale,
      y: bounds.y / scale,
      width: bounds.width / scale,
      height: bounds.height / scale,
    },
    foregroundRatio,
  }
}

export async function extractImageObjects(src, options = {}) {
  if (!options.forceFallback) {
    try {
      const remote = await requestSegmentation(src, 'objects', options)
      const normalized = remote ? await normalizeRemoteObjects(src, remote) : null
      if (normalized?.objects?.length) return normalized
    } catch (err) {
      if (options.failOnEndpointError) throw err
    }
  }

  return componentMaskFallback(src, options)
}

export async function componentMaskFallback(src, options = {}) {
  const { canvas, context, width, height, scale } = await imageToCanvas(src, options.maxSide || 1600)
  const frame = context.getImageData(0, 0, width, height)
  const { backgroundMask, backgroundColor, tolerance } = buildBackgroundMask(frame, options)
  const foregroundMask = makeForegroundMask(frame, backgroundMask, backgroundColor, tolerance)
  const components = mergeNearbyComponents(
    connectedComponents(foregroundMask, width, height, options),
    Number(options.mergeDistance ?? Math.round(Math.min(width, height) * 0.015)),
  )
    .sort((a, b) => b.area - a.area)
    .slice(0, Number(options.maxObjects ?? 24))

  // TODO: replace this fallback with SAM/ONNX automatic mask generation once the
  // configurable segmentation endpoint is backed by a model service.
  const objects = components.map((component, index) => {
    const padding = Math.max(2, Math.round(Math.min(width, height) * 0.006))
    const minX = clampValue(component.minX - padding, 0, width - 1)
    const minY = clampValue(component.minY - padding, 0, height - 1)
    const maxX = clampValue(component.maxX + padding, 0, width - 1)
    const maxY = clampValue(component.maxY + padding, 0, height - 1)
    const cropWidth = Math.max(1, maxX - minX + 1)
    const cropHeight = Math.max(1, maxY - minY + 1)
    const objectCanvas = document.createElement('canvas')
    objectCanvas.width = cropWidth
    objectCanvas.height = cropHeight
    const objectContext = objectCanvas.getContext('2d', { willReadFrequently: true })
    if (!objectContext) throw new Error('Canvas image processing is unavailable in this browser.')
    const objectFrame = objectContext.createImageData(cropWidth, cropHeight)

    for (let y = 0; y < cropHeight; y += 1) {
      for (let x = 0; x < cropWidth; x += 1) {
        const sourceX = minX + x
        const sourceY = minY + y
        const sourcePosition = (sourceY * width) + sourceX
        if (!foregroundMask[sourcePosition]) continue
        const sourceIndex = sourcePosition * 4
        const targetIndex = ((y * cropWidth) + x) * 4
        objectFrame.data[targetIndex] = frame.data[sourceIndex]
        objectFrame.data[targetIndex + 1] = frame.data[sourceIndex + 1]
        objectFrame.data[targetIndex + 2] = frame.data[sourceIndex + 2]
        objectFrame.data[targetIndex + 3] = frame.data[sourceIndex + 3]
      }
    }

    objectContext.putImageData(objectFrame, 0, 0)
    return {
      id: `object-${Date.now()}-${index}`,
      src: objectCanvas.toDataURL('image/png'),
      x: minX / scale,
      y: minY / scale,
      width: cropWidth / scale,
      height: cropHeight / scale,
      score: component.area / (width * height),
      area: component.area / (scale * scale),
      bounds: {
        x: minX / scale,
        y: minY / scale,
        width: cropWidth / scale,
        height: cropHeight / scale,
      },
      sourceWidth: canvas.width / scale,
      sourceHeight: canvas.height / scale,
    }
  })

  return {
    sourceWidth: canvas.width / scale,
    sourceHeight: canvas.height / scale,
    objects,
  }
}
