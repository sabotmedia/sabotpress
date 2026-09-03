export function createEmptyRichDoc() {
  return [
    { id: makeId(), type: 'paragraph', text: '' },
  ]
}

export function normalizeRichDoc(input) {
  const arr = Array.isArray(input) ? input : []
  const out = arr
    .map((block) => normalizeBlock(block))
    .filter(Boolean)

  return out.length ? out : createEmptyRichDoc()
}

export function normalizeBlock(block) {
  const raw = block || {}
  const type = String(raw.type || 'paragraph')

  if (type === 'paragraph' || type === 'heading' || type === 'quote') {
    return {
      id: String(raw.id || makeId()),
      type,
      text: String(raw.text || ''),
    }
  }

  if (type === 'image') {
    return {
      id: String(raw.id || makeId()),
      type,
      assetId: String(raw.assetId || ''),
      url: String(raw.url || ''),
      alt: String(raw.alt || ''),
      caption: String(raw.caption || ''),
    }
  }

  if (type === 'embed') {
    return {
      id: String(raw.id || makeId()),
      type,
      url: String(raw.url || ''),
      caption: String(raw.caption || ''),
    }
  }

  return null
}

export function serializeRichDocToPlainText(doc) {
  return normalizeRichDoc(doc)
    .map((block) => {
      if (block.type === 'heading') return block.text
      if (block.type === 'quote') return block.text
      if (block.type === 'paragraph') return block.text
      if (block.type === 'image') return block.caption || block.alt || ''
      if (block.type === 'embed') return block.url
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
}

export function cloneRichDoc(doc) {
  return JSON.parse(JSON.stringify(normalizeRichDoc(doc)))
}

export function makeId() {
  return `blk-${Math.random().toString(36).slice(2, 10)}`
}
