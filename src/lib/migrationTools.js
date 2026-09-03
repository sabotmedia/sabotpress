export function archivePieceToNativeDraft(piece) {
  const title = String(piece?.title || '').trim()
  const subtitle = String(piece?.subtitle || '').trim()
  const excerpt = String(piece?.excerpt || '').trim()
  const bodyText = String(piece?.bodyText || piece?.body_plain || '').trim()
  const slug = String(piece?.slug || '')
  const author = String(piece?.author || '')
  const tags = Array.isArray(piece?.tags) ? piece.tags : []

  return {
    contentType: inferContentType(piece),
    status: 'draft',
    workflowState: 'draft',
    target: inferTarget(piece),
    title,
    slug,
    excerpt: excerpt || subtitle,
    body: bodyText || excerpt || subtitle,
    richBody: buildRichBody({ title, subtitle, excerpt, bodyText }),
    author,
    tags,
    sourceType: 'imported',
    sourceLabel: piece?.primaryProject || 'Imported archive',
    sourceUrl: piece?.sourceUrl || '',
    sourceExternalId: slug,
    sourceNotes: `Migrated from archive piece ${slug}`,
    transcriptionStatus: piece?.type === 'podcast' ? 'none' : 'none',
    audioSourceUrl: piece?.audioUrl || '',
    fullTranscript: piece?.fullTranscript || '',
    transcriptNotes: '',
    scheduledFor: '',
    publishedAt: '',
  }
}

export function buildRichBody({ title = '', subtitle = '', excerpt = '', bodyText = '' }) {
  const out = []
  if (title) out.push({ id: makeId(), type: 'heading', text: title })
  if (subtitle) out.push({ id: makeId(), type: 'quote', text: subtitle })
  if (excerpt) out.push({ id: makeId(), type: 'paragraph', text: excerpt })

  const bodyParas = String(bodyText || '')
    .split(/\n{2,}/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 8)

  for (const para of bodyParas) {
    out.push({ id: makeId(), type: 'paragraph', text: para })
  }

  if (!out.length) {
    out.push({ id: makeId(), type: 'paragraph', text: '' })
  }

  return out
}

export function summarizeArchiveForAnalytics(pieces) {
  const list = Array.isArray(pieces) ? pieces : []

  const byProject = countBy(list, (p) => p?.primaryProject || 'Unknown')
  const byType = countBy(list, (p) => p?.type || 'unknown')
  const podcasts = list.filter((p) => p?.type === 'podcast').length
  const printReady = list.filter((p) => p?.hasPrintAssets).length
  const reviewFlagged = list.filter((p) => Array.isArray(p?.reviewFlags) && p.reviewFlags.length).length

  return {
    total: list.length,
    podcasts,
    printReady,
    reviewFlagged,
    byProject,
    byType,
  }
}

export function summarizeNativeForAnalytics(items) {
  const list = Array.isArray(items) ? items : []

  return {
    total: list.length,
    published: list.filter((i) => i?.status === 'published').length,
    archived: list.filter((i) => i?.status === 'archived').length,
    scheduled: list.filter((i) => i?.workflowState === 'scheduled').length,
    byTarget: countBy(list, (i) => i?.target || 'general'),
    byWorkflow: countBy(list, (i) => i?.workflowState || 'draft'),
    byType: countBy(list, (i) => i?.contentType || 'note'),
  }
}

function inferContentType(piece) {
  if (piece?.type === 'podcast') return 'dispatch'
  if (piece?.type === 'comic') return 'publicBlock'
  return 'note'
}

function inferTarget(piece) {
  const project = String(piece?.primaryProject || '').toLowerCase()
  if (project.includes('press')) return 'press'
  if (project.includes('project')) return 'projects'
  return 'general'
}

function countBy(list, fn) {
  const map = new Map()
  for (const item of list) {
    const key = String(fn(item) || 'unknown')
    map.set(key, (map.get(key) || 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}

function makeId() {
  return `mig-${Math.random().toString(36).slice(2, 10)}`
}
