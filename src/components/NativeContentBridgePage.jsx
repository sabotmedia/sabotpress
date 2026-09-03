import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getPieces } from '../lib/pieces'
import {
  createEmptyNativeEntry,
  createNativeEntryFromImportedPiece,
  loadNativeCollection,
  slugify,
  upsertNativeEntryWithMeta,
} from '../lib/nativePublicContent'
import { fetchNativeRevisions, restoreNativeRevision } from '../lib/nativePublicContentApi'
import { AdminFrame } from './AdminRail'
import { MediaPickerModal } from './MediaLibraryPage'
import { WpAdminNotices, useAdminNotices } from './WpAdminNotices'
import { normalizeNativeDisplaySettings } from '../lib/publicDisplayModes'
import { classicEditorBodyToHtml } from '../lib/classicEditorBody'
import { getDefaultFeaturedTitleDisplayForContentType } from '../lib/featuredTitleDisplay'
import { adminRoutes } from '../routing/routes'
import { loadCampaigns } from '../lib/campaignsApi'

function normalizeTermList(value) {
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
  if (typeof value === 'string') return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]
  return []
}

function createTypedEntry(kind = 'article') {
  const base = createEmptyNativeEntry()
  return {
    ...base,
    contentType: kind === 'podcast' ? 'podcast' : kind === 'print' ? 'print' : 'dispatch',
    title: '',
    slug: '',
    excerpt: '',
    body: '',
    richBody: [],
    status: 'draft',
    workflowState: 'draft',
    tags: [],
    categories: [],
    collections: [],
    campaigns: [],
    featuredImage: '',
    heroImage: '',
    featuredImageTitle: '',
    featuredTitleDisplay: getDefaultFeaturedTitleDisplayForContentType(kind),
    featuredImageAlt: '',
    featuredImageCaption: '',
    podcastAudioUrl: '',
    podcastRssEnclosureUrl: '',
    podcastDuration: '',
    podcastEpisodeNumber: '',
    podcastSeason: '',
    podcastTranscript: '',
    podcastSummary: '',
    podcastCoverImage: '',
  }
}

function toLocalDateTime(value) {
  const d = new Date(String(value || ''))
  if (!Number.isFinite(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalDateTime(value) {
  const d = new Date(String(value || ''))
  return Number.isFinite(d.getTime()) ? d.toISOString() : ''
}

function wrapSelected(textarea, opener, closer = opener) {
  if (!textarea) return null
  const start = textarea.selectionStart ?? 0
  const end = textarea.selectionEnd ?? 0
  const value = textarea.value || ''
  const selected = value.slice(start, end) || 'text'
  const next = `${value.slice(0, start)}${opener}${selected}${closer}${value.slice(end)}`
  const cursorStart = start + opener.length
  const cursorEnd = cursorStart + selected.length
  return { next, cursorStart, cursorEnd }
}

function prefixSelectedLines(textarea, prefix) {
  if (!textarea) return null
  const start = textarea.selectionStart ?? 0
  const end = textarea.selectionEnd ?? 0
  const value = textarea.value || ''
  const hasSelection = end > start
  if (!hasSelection) {
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const lineEndIndex = value.indexOf('\n', start)
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex
    const line = value.slice(lineStart, lineEnd)
    const nextLine = `${prefix}${line}`
    const next = `${value.slice(0, lineStart)}${nextLine}${value.slice(lineEnd)}`
    return { next, cursorStart: lineStart, cursorEnd: lineStart + nextLine.length }
  }
  const segment = value.slice(start, end)
  const nextSegment = segment
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n')
  const next = `${value.slice(0, start)}${nextSegment}${value.slice(end)}`
  return { next, cursorStart: start, cursorEnd: start + nextSegment.length }
}

function wrapSelectionWithHtmlBlock(textarea, style) {
  if (!textarea) return null
  const start = textarea.selectionStart ?? 0
  const end = textarea.selectionEnd ?? 0
  const value = textarea.value || ''
  const selected = value.slice(start, end) || 'text'
  const snippet = `<div style="${style}">${selected}</div>`
  const next = `${value.slice(0, start)}${snippet}${value.slice(end)}`
  const cursorStart = start
  const cursorEnd = start + snippet.length
  return { next, cursorStart, cursorEnd }
}

function escapeHtmlAttribute(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeHtmlText(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function sanitizeVisualHtml(value = '') {
  const raw = String(value || '')
  if (!raw.trim()) return ''

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return raw
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
      .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"')
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(raw, 'text/html')
  doc.querySelectorAll('script').forEach((node) => node.remove())

  for (const el of doc.querySelectorAll('*')) {
    for (const attr of Array.from(el.attributes || [])) {
      const name = String(attr.name || '').toLowerCase()
      const attrValue = String(attr.value || '')
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name)
        continue
      }
      if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attrValue)) {
        el.setAttribute(attr.name, '#')
      }
    }
  }

  return doc.body.innerHTML
}

const AUTOSAVE_DEBOUNCE_MS = 1200
const LOCAL_REVISIONS_KEY_PREFIX = 'sabot-native-local-revisions-v1'

function getLocalRevisionsStorageKey(id) {
  return `${LOCAL_REVISIONS_KEY_PREFIX}:${String(id || '')}`
}

function loadLegacyLocalRevisions(postId) {
  if (!postId) return []
  try {
    const raw = window.localStorage.getItem(getLocalRevisionsStorageKey(postId))
    const parsed = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
  } catch {
    return []
  }
}

function normalizeServerRevision(revision) {
  return {
    id: String(revision?.id || ''),
    createdAt: String(revision?.createdAt || ''),
    editor: 'server',
    note: String(revision?.revisionNote || 'save'),
    draft: revision?.snapshot && typeof revision.snapshot === 'object' ? revision.snapshot : {},
  }
}

function summarizeRevisionChanges(current = {}, previous = {}) {
  const checks = [
    ['title', 'title'],
    ['excerpt', 'excerpt'],
    ['body', 'body'],
    ['status', 'status'],
    ['workflowState', 'workflow'],
    ['featuredImage', 'featured image'],
    ['publishedAt', 'publication date'],
  ]
  const changed = checks
    .filter(([key]) => String(current?.[key] || '') !== String(previous?.[key] || ''))
    .map(([, label]) => label)
  return changed.length ? changed.join(', ') : 'metadata snapshot'
}

function toAutosaveFingerprint(draft, allowComments) {
  const display = normalizeNativeDisplaySettings(draft)
  return JSON.stringify({
    title: draft?.title || '',
    slug: draft?.slug || '',
    excerpt: draft?.excerpt || '',
    body: draft?.body || '',
    contentType: draft?.contentType || 'dispatch',
    status: draft?.status || 'draft',
    workflowState: draft?.workflowState || 'draft',
    publishedAt: draft?.publishedAt || '',
    author: draft?.author || '',
    scheduledFor: draft?.scheduledFor || '',
    tags: Array.isArray(draft?.tags) ? draft.tags : [],
    categories: Array.isArray(draft?.categories) ? draft.categories : [],
    collections: Array.isArray(draft?.collections) ? draft.collections : [],
    campaigns: Array.isArray(draft?.campaigns) ? draft.campaigns : [],
    featuredImage: draft?.featuredImage || '',
    heroImage: draft?.heroImage || '',
    featuredTitleDisplay: draft?.featuredTitleDisplay || '',
    enableReadMode: display.enableReadMode,
    enableExperienceMode: display.enableExperienceMode,
    enablePrintMode: display.enablePrintMode,
    defaultMode: display.defaultMode,
    heroStyle: display.heroStyle,
    podcastAudioUrl: draft?.podcastAudioUrl || '',
    podcastRssEnclosureUrl: draft?.podcastRssEnclosureUrl || '',
    podcastDuration: draft?.podcastDuration || '',
    podcastEpisodeNumber: draft?.podcastEpisodeNumber || '',
    podcastSeason: draft?.podcastSeason || '',
    podcastTranscript: draft?.podcastTranscript || '',
    podcastSummary: draft?.podcastSummary || '',
    podcastCoverImage: draft?.podcastCoverImage || '',
    allowComments: Boolean(allowComments),
  })
}

function formatAutosaveTime(value) {
  const d = new Date(String(value || ''))
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function applyDisplayPatch(current, patch) {
  return {
    ...current,
    ...normalizeNativeDisplaySettings({
      ...current,
      ...patch,
    }),
  }
}

function liveBodyToBodyHtml(body = '') {
  return classicEditorBodyToHtml(body)
}

export function NativeContentBridgePage() {
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [activeId, setActiveId] = useState('')
  const [draft, setDraft] = useState(createTypedEntry())
  const [editorTab, setEditorTab] = useState('visual')
  const [tagInput, setTagInput] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [categoryTab, setCategoryTab] = useState('all')
  const [openMediaFor, setOpenMediaFor] = useState('')
  const [campaignOptions, setCampaignOptions] = useState([])
  const [campaignOptionsState, setCampaignOptionsState] = useState('loading')
  const [allowComments, setAllowComments] = useState(true)
  const [isPermalinkEditing, setIsPermalinkEditing] = useState(false)
  const [permalinkDraft, setPermalinkDraft] = useState('')
  const textareaRef = useRef(null)
  const visualEditorRef = useRef(null)
  const autosaveTimerRef = useRef(null)
  const suppressAutosaveRef = useRef(false)
  const lastAutosaveFingerprintRef = useRef('')
  const visualSyncLockRef = useRef(false)
  const [visualEditorEmpty, setVisualEditorEmpty] = useState(true)
  const [revisions, setRevisions] = useState([])
  const [legacyRevisions, setLegacyRevisions] = useState([])
  const [revisionState, setRevisionState] = useState('idle')
  const [revisionError, setRevisionError] = useState('')
  const [compareRevisionId, setCompareRevisionId] = useState('')
  const [restoringRevisionId, setRestoringRevisionId] = useState('')
  const [recoverySnapshotLoaded, setRecoverySnapshotLoaded] = useState(false)
  const [autosaveState, setAutosaveState] = useState({ status: 'idle', at: '' })
  const [publishSuccess, setPublishSuccess] = useState(null)
  const { pushNotice } = useAdminNotices()

  useEffect(() => {
    let cancelled = false
    loadCampaigns({ includeDrafts: true })
      .then((items) => {
        if (cancelled) return
        setCampaignOptions(Array.isArray(items) ? items : [])
        setCampaignOptionsState('loaded')
      })
      .catch((error) => {
        if (cancelled) return
        setCampaignOptions([])
        setCampaignOptionsState('error')
        pushNotice(`Campaign relationships failed to load: ${String(error?.message || error)}`, 'error')
      })
    return () => { cancelled = true }
  }, [pushNotice])

  const categoryOptions = useMemo(() => [...new Set(getPieces().flatMap((piece) => piece.projects || [piece.primaryProject]).filter(Boolean))], [])
  const mostUsedCategories = useMemo(() => {
    const counts = new Map()
    for (const item of items) {
      for (const category of (item.categories || item.projects || [])) {
        counts.set(category, (counts.get(category) || 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name).slice(0, 10)
  }, [items])
  const mostUsedTags = useMemo(() => {
    const counts = new Map()
    for (const item of items) {
      for (const tag of (item.tags || [])) {
        counts.set(tag, (counts.get(tag) || 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  }, [items])

  async function reloadServerRevisions(postId = activeId, { quiet = false } = {}) {
    if (!postId) {
      setRevisions([])
      setRevisionState('idle')
      return []
    }
    try {
      if (!quiet) setRevisionState('loading')
      setRevisionError('')
      const data = await fetchNativeRevisions({ nativeId: postId })
      if (!data?.ok || data.mode !== 'd1' || !Array.isArray(data.items)) {
        throw new Error(data?.error || 'Revision history did not return confirmed D1 data')
      }
      const next = data.items.map(normalizeServerRevision).filter((item) => item.id)
      setRevisions(next)
      setRevisionState('loaded')
      return next
    } catch (error) {
      const message = String(error?.message || error)
      setRevisionError(message)
      setRevisionState('error')
      if (!quiet) pushNotice(`Revision history failed to load: ${message}`, 'error')
      return []
    }
  }

  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        const loaded = await loadNativeCollection({ includeFuture: 1 })
        if (cancelled) return
        setItems(Array.isArray(loaded) ? loaded : [])
        const editId = searchParams.get('edit')
        const importSlug = searchParams.get('import')
        const mode = searchParams.get('new') || 'article'
        const importedPiece = importSlug
          ? getPieces().find((piece) => piece.slug === importSlug || String(piece.id || '') === importSlug || String(piece.sourcePostId || '') === importSlug)
          : null
        const found = importSlug
          ? (loaded || []).find((item) => item.slug === importedPiece?.slug || item.sourcePostId === String(importedPiece?.sourcePostId || importedPiece?.id || ''))
          : (loaded || []).find((item) => item.id === editId)

        let nextDraft
        let shouldLoadServerHistory = false
        if (found) {
          nextDraft = { ...found, tags: found.tags || [], categories: found.categories || found.projects || [], collections: found.collections || [], campaigns: found.campaigns || [], slugManuallyEdited: true }
          shouldLoadServerHistory = true
        } else if (importedPiece) {
          const importedDraft = createNativeEntryFromImportedPiece(importedPiece)
          nextDraft = { ...importedDraft, tags: importedDraft.tags || [], categories: importedDraft.categories || importedDraft.projects || [], collections: importedDraft.collections || [], campaigns: importedDraft.campaigns || [], slugManuallyEdited: true }
        } else {
          nextDraft = createTypedEntry(mode)
        }

        if (cancelled) return
        setActiveId(nextDraft.id)
        setDraft(nextDraft)
        setPermalinkDraft(nextDraft.slug || '')
        setAllowComments(nextDraft.allowComments ?? true)
        setLegacyRevisions(loadLegacyLocalRevisions(nextDraft.id))
        setRecoverySnapshotLoaded(false)
        setCompareRevisionId('')
        lastAutosaveFingerprintRef.current = toAutosaveFingerprint(nextDraft, nextDraft.allowComments ?? true)
        setPublishSuccess(null)
        setAutosaveState({ status: 'idle', at: '' })

        if (shouldLoadServerHistory) await reloadServerRevisions(nextDraft.id)
        else {
          setRevisions([])
          setRevisionState('idle')
          setRevisionError('')
        }
      } catch (error) {
        if (cancelled) return
        const message = String(error?.message || error)
        setItems([])
        setRevisions([])
        setRevisionState('error')
        setRevisionError(message)
        pushNotice(`Post editor failed to load production content: ${message}`, 'error')
      }
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  useEffect(() => {
    if (!visualSyncLockRef.current) return
    visualSyncLockRef.current = false
  }, [draft.body])

  useEffect(() => {
    if (editorTab !== 'visual') return
    if (visualSyncLockRef.current) return
    loadDraftBodyIntoVisualEditor()
  }, [editorTab, draft.body, activeId])

  async function handleRestoreRevision(revision) {
    if (!revision?.id) return
    try {
      setRestoringRevisionId(revision.id)
      const data = await restoreNativeRevision(revision.id)
      if (!data?.ok || data.mode !== 'd1' || !data.item) {
        throw new Error(data?.error || 'Revision restore did not return confirmed D1 data')
      }
      const restored = {
        ...data.item,
        tags: Array.isArray(data.item.tags) ? data.item.tags : [],
        categories: Array.isArray(data.item.categories || data.item.projects) ? (data.item.categories || data.item.projects) : [],
        collections: Array.isArray(data.item.collections) ? data.item.collections : [],
        campaigns: Array.isArray(data.item.campaigns) ? data.item.campaigns : [],
        slugManuallyEdited: true,
      }
      suppressAutosaveRef.current = true
      setDraft(restored)
      setActiveId(restored.id)
      setItems((current) => current.some((item) => item.id === restored.id)
        ? current.map((item) => (item.id === restored.id ? restored : item))
        : [restored, ...current])
      setPermalinkDraft(restored.slug || '')
      setAllowComments(restored.allowComments ?? true)
      setRecoverySnapshotLoaded(false)
      setPublishSuccess(null)
      lastAutosaveFingerprintRef.current = toAutosaveFingerprint(restored, restored.allowComments ?? true)
      await reloadServerRevisions(restored.id, { quiet: true })
      pushNotice('Revision restored in D1 and loaded into the editor.', 'success')
    } catch (error) {
      pushNotice(`Revision restore failed: ${String(error?.message || error)}`, 'error')
    } finally {
      suppressAutosaveRef.current = false
      setRestoringRevisionId('')
    }
  }

  function loadLegacyRecoveryRevision(revision) {
    if (!revision?.draft) return
    const restored = {
      ...draft,
      ...revision.draft,
      tags: Array.isArray(revision.draft.tags) ? revision.draft.tags : [],
      categories: Array.isArray(revision.draft.categories) ? revision.draft.categories : [],
      collections: Array.isArray(revision.draft.collections) ? revision.draft.collections : [],
      campaigns: Array.isArray(revision.draft.campaigns) ? revision.draft.campaigns : [],
    }
    suppressAutosaveRef.current = true
    setDraft(restored)
    setPublishSuccess(null)
    setPermalinkDraft(restored.slug || '')
    setRecoverySnapshotLoaded(true)
    lastAutosaveFingerprintRef.current = toAutosaveFingerprint(restored, allowComments)
    window.setTimeout(() => { suppressAutosaveRef.current = false }, 0)
    pushNotice('Legacy browser recovery snapshot loaded. It has not been saved to D1; use Save Draft or Publish to persist it.', 'warning')
  }

  const compareRevision = revisions.find((revision) => revision.id === compareRevisionId)

  useEffect(() => {
    if (!activeId || recoverySnapshotLoaded) return
    const fingerprint = toAutosaveFingerprint(draft, allowComments)
    if (!fingerprint || fingerprint === lastAutosaveFingerprintRef.current || suppressAutosaveRef.current) return
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = window.setTimeout(async () => {
      try {
        setAutosaveState({ status: 'saving', at: '' })
        const normalized = buildNormalizedDraft(draft)
        const result = await upsertNativeEntryWithMeta(items, normalized, 'autosave')
        setItems(result.items)
        lastAutosaveFingerprintRef.current = fingerprint
        setAutosaveState({ status: 'saved', at: new Date().toISOString() })
        await reloadServerRevisions(normalized.id, { quiet: true })
      } catch (error) {
        setAutosaveState({ status: 'error', at: '' })
        pushNotice(`Autosave failed: ${String(error?.message || error)}`, 'error')
      }
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
    }
  }, [activeId, draft, allowComments, items, pushNotice, recoverySnapshotLoaded])

  function addTagsFromInput(rawInput = tagInput) {
    const nextTags = normalizeTermList(rawInput)
    if (!nextTags.length) return
    setDraft((d) => ({ ...d, tags: [...new Set([...(d.tags || []), ...nextTags])] }))
    setTagInput('')
  }

  const displaySettings = useMemo(() => normalizeNativeDisplaySettings(draft), [draft])

  function buildNormalizedDraft(baseDraft, patch = {}) {
    const merged = {
      ...baseDraft,
      ...patch,
    }
    const normalizedCategories = normalizeTermList(merged.categories || merged.projects)
    return {
      ...merged,
      slug: slugify(merged.slug || merged.title),
      tags: Array.isArray(merged.tags) ? merged.tags : [],
      collections: normalizeTermList(merged.collections),
      campaigns: normalizeTermList(merged.campaigns),
      categories: normalizedCategories,
      projects: normalizedCategories,
      featuredImage: merged.featuredImage || merged.heroImage || '',
      heroImage: merged.heroImage || merged.featuredImage || '',
      bodyHtml: liveBodyToBodyHtml(merged.body || ''),
      featuredImageTitle: merged.featuredImageTitle || '',
      featuredTitleDisplay: merged.featuredTitleDisplay || '',
      featuredImageAlt: merged.featuredImageAlt || '',
      featuredImageCaption: merged.featuredImageCaption || '',
      podcastCoverImage: merged.podcastCoverImage || merged.featuredImage || merged.heroImage || '',
      allowComments,
    }
  }

  function isVisualEditorEmpty(html = '') {
    const value = String(html || '').replace(/&nbsp;/gi, ' ').trim()
    if (!value) return true
    const hasMedia = /<(img|video|audio|iframe|figure)\b/i.test(value)
    const textOnly = value.replace(/<[^>]+>/g, '').trim()
    return !hasMedia && !textOnly
  }

  function syncVisualBodyIntoDraft() {
    const editor = visualEditorRef.current
    if (!editor) return draft.body || ''
    const sanitized = sanitizeVisualHtml(editor.innerHTML || '')
    setVisualEditorEmpty(isVisualEditorEmpty(sanitized))
    if (sanitized !== (draft.body || '')) {
      visualSyncLockRef.current = true
      setDraft((current) => ({ ...current, body: sanitized }))
    }
    return sanitized
  }

  function loadDraftBodyIntoVisualEditor(force = false) {
    const editor = visualEditorRef.current
    if (!editor) return
    const visualHtml = classicEditorBodyToHtml(draft.body || '')
    const sanitized = sanitizeVisualHtml(visualHtml)
    if (!force && document.activeElement === editor) return
    if ((editor.innerHTML || '') !== sanitized) {
      editor.innerHTML = sanitized
    }
    setVisualEditorEmpty(isVisualEditorEmpty(sanitized))
  }

  function insertHtmlIntoVisualEditor(markup) {
    const editor = visualEditorRef.current
    if (!editor) return
    editor.focus()
    const selection = window.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    if (range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents()
      const fragment = range.createContextualFragment(markup)
      const lastNode = fragment.lastChild
      range.insertNode(fragment)
      if (lastNode) {
        const nextRange = document.createRange()
        nextRange.setStartAfter(lastNode)
        nextRange.collapse(true)
        selection.removeAllRanges()
        selection.addRange(nextRange)
      }
    } else {
      editor.insertAdjacentHTML('beforeend', markup)
    }
    syncVisualBodyIntoDraft()
  }

  async function handleSave(note = 'save', patch = {}, options = {}) {
    try {
      const liveBody = editorTab === 'visual' ? syncVisualBodyIntoDraft() : draft.body
      const normalized = buildNormalizedDraft(draft, { ...patch, body: liveBody })
      const result = await upsertNativeEntryWithMeta(items, normalized, note)
      setItems(result.items)
      const saved = result.items.find((item) => item.id === normalized.id)
      if (!saved) throw new Error(options.failureNotice || 'Save did not return the persisted post.')

      setActiveId(saved.id)
      setDraft({ ...saved, slugManuallyEdited: true })
      setPermalinkDraft(saved.slug || '')
      setAllowComments(saved.allowComments ?? true)
      setRecoverySnapshotLoaded(false)
      lastAutosaveFingerprintRef.current = toAutosaveFingerprint(saved, saved.allowComments ?? true)
      if (saved.status === 'published' || saved.status === 'scheduled') {
        setPublishSuccess({
          id: saved.id,
          slug: saved.slug || '',
          title: saved.title || 'Untitled post',
          status: saved.status,
        })
      } else {
        setPublishSuccess(null)
      }
      await reloadServerRevisions(saved.id, { quiet: true })
      if (options.successNotice !== false) {
        pushNotice(options.successNotice || 'Post saved to D1.', 'success')
      }
      return { saved, synced: true }
    } catch (error) {
      pushNotice(options.failureNotice || `Save failed: ${String(error?.message || error)}`, 'error')
      return { saved: null, synced: false }
    }
  }

  async function handleMoveToTrash() {
    const { saved } = await handleSave('trash', {
      status: 'trash',
      workflowState: 'trash',
    }, { successNotice: false, failureNotice: 'Move to Trash failed.' })
    if (saved) pushNotice('Post moved to Trash.', 'warning')
    setPublishSuccess(null)
  }

  async function handlePreviewChanges() {
    const { saved } = await handleSave('preview', {}, { successNotice: false, failureNotice: 'Preview failed to save changes.' })
    if (!saved) return
    const canResolvePublicRoute = saved.status === 'published' && Boolean(saved.slug)
    const previewPath = canResolvePublicRoute ? `/post/${saved.slug}` : `/native-preview/${saved.id}`
    const nextWindow = window.open(previewPath, '_blank', 'noopener,noreferrer')
    if (!nextWindow) {
      pushNotice('Preview window was blocked by your browser.', 'error')
    }
  }

  function applyEditorMutation(mutator) {
    if (editorTab === 'visual') return
    const el = textareaRef.current
    const result = mutator(el)
    if (!result) return
    setDraft((d) => ({ ...d, body: result.next }))
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.focus()
      textareaRef.current.selectionStart = result.cursorStart
      textareaRef.current.selectionEnd = result.cursorEnd
    })
  }

  function insertAtCursor(snippet) {
    applyEditorMutation((textarea) => {
      if (!textarea) return null
      const start = textarea.selectionStart ?? 0
      const end = textarea.selectionEnd ?? 0
      const value = textarea.value || ''
      const next = `${value.slice(0, start)}${snippet}${value.slice(end)}`
      const cursor = start + snippet.length
      return { next, cursorStart: cursor, cursorEnd: cursor }
    })
  }

  function runVisualCommand(command, value = null) {
    const editor = visualEditorRef.current
    if (!editor) return
    editor.focus()
    document.execCommand(command, false, value)
    syncVisualBodyIntoDraft()
  }

  function handleToolbarAction(action) {
    if (editorTab === 'visual') {
      if (action === 'bold') return runVisualCommand('bold')
      if (action === 'italic') return runVisualCommand('italic')
      if (action === 'link') {
        const href = window.prompt('Enter URL for link', 'https://')
        if (!href) return
        return runVisualCommand('createLink', href)
      }
      if (action === 'ul') return runVisualCommand('insertUnorderedList')
      if (action === 'ol') return runVisualCommand('insertOrderedList')
      if (action === 'quote') return runVisualCommand('formatBlock', 'blockquote')
      if (action === 'left') return runVisualCommand('justifyLeft')
      if (action === 'center') return runVisualCommand('justifyCenter')
      if (action === 'right') return runVisualCommand('justifyRight')
      return
    }

    if (action === 'bold') return applyEditorMutation((el) => wrapSelected(el, '**'))
    if (action === 'italic') return applyEditorMutation((el) => wrapSelected(el, '*'))
    if (action === 'link') {
      const href = window.prompt('Enter URL for link', 'https://')
      if (!href) return
      return applyEditorMutation((el) => wrapSelected(el, '[', `](${href})`))
    }
    if (action === 'ul') return applyEditorMutation((el) => prefixSelectedLines(el, '- '))
    if (action === 'ol') return applyEditorMutation((el) => prefixSelectedLines(el, '1. '))
    if (action === 'quote') return applyEditorMutation((el) => prefixSelectedLines(el, '> '))
    if (action === 'left') return applyEditorMutation((el) => wrapSelectionWithHtmlBlock(el, 'text-align:left;'))
    if (action === 'center') return applyEditorMutation((el) => wrapSelectionWithHtmlBlock(el, 'text-align:center;'))
    if (action === 'right') return applyEditorMutation((el) => wrapSelectionWithHtmlBlock(el, 'text-align:right;'))
  }

  function handleEditorTabChange(nextTab) {
    if (nextTab === editorTab) return
    if (editorTab === 'visual' && nextTab === 'text') {
      syncVisualBodyIntoDraft()
    }
    setEditorTab(nextTab)
    if (nextTab === 'visual') {
      requestAnimationFrame(() => loadDraftBodyIntoVisualEditor(true))
    }
  }

  function handleTitleChange(nextTitle) {
    setDraft((current) => {
      const manuallyEditedSlug = current.slugManuallyEdited === true
      if (manuallyEditedSlug) return { ...current, title: nextTitle }
      const nextSlug = slugify(nextTitle)
      setPermalinkDraft(nextSlug)
      return { ...current, title: nextTitle, slug: nextSlug }
    })
  }

  function handlePermalinkConfirm() {
    const nextSlug = slugify(permalinkDraft)
    setDraft((current) => ({ ...current, slug: nextSlug, slugManuallyEdited: true }))
    setPermalinkDraft(nextSlug)
    setIsPermalinkEditing(false)
  }

  function handlePermalinkCancel() {
    setPermalinkDraft(draft.slug || '')
    setIsPermalinkEditing(false)
  }

  function handleContentTypeChange(nextContentType) {
    setDraft((current) => {
      const previousDefault = getDefaultFeaturedTitleDisplayForContentType(current.contentType || 'dispatch')
      const nextDefault = getDefaultFeaturedTitleDisplayForContentType(nextContentType)
      const shouldUpdateTitleDisplay = !current.featuredTitleDisplay || current.featuredTitleDisplay === previousDefault
      return {
        ...current,
        contentType: nextContentType,
        featuredTitleDisplay: shouldUpdateTitleDisplay ? nextDefault : current.featuredTitleDisplay,
      }
    })
  }

  return (
    <AdminFrame>
      <main className="page wp-admin-screen wp-edit-screen">
        <div className="wp-screen-header">
          <h1>{searchParams.get('edit') || searchParams.get('import') ? 'Edit Post' : 'Add New Post'}</h1>
          {searchParams.get('edit') || searchParams.get('import') ? <Link className="button" to={adminRoutes.addNew}>Add New</Link> : null}
        </div>
        <WpAdminNotices />

        <section className="native-bridge-layout">
          <article className="native-bridge-main">
            <label className="native-content-editor__title-field">
              <span>Title</span>
              <input
                value={draft.title || ''}
                onChange={(event) => handleTitleChange(event.target.value)}
                placeholder="Add title"
              />
            </label>

            <div className="native-content-editor__permalink">
              <span>Permalink</span>
              {isPermalinkEditing ? (
                <>
                  <input value={permalinkDraft} onChange={(event) => setPermalinkDraft(event.target.value)} />
                  <button className="button" type="button" onClick={handlePermalinkConfirm}>OK</button>
                  <button className="button" type="button" onClick={handlePermalinkCancel}>Cancel</button>
                </>
              ) : (
                <>
                  <code>{draft.slug || slugify(draft.title) || draft.id}</code>
                  <button className="button" type="button" onClick={() => setIsPermalinkEditing(true)}>Edit</button>
                </>
              )}
            </div>

            <div className="native-content-editor__chrome">
              <div className="native-content-editor__media-row">
                <button className="button native-content-editor__add-media" type="button" onClick={() => setOpenMediaFor('body')}>Add Media</button>
                <div className="native-content-editor__tabs">
                  <button className={`button${editorTab === 'visual' ? ' button--primary' : ''}`} type="button" onClick={() => handleEditorTabChange('visual')}>Visual</button>
                  <button className={`button${editorTab === 'text' ? ' button--primary' : ''}`} type="button" onClick={() => handleEditorTabChange('text')}>Text</button>
                </div>
              </div>

              <div className="native-content-editor__toolbar" aria-label="Editor toolbar">
                {['bold', 'italic', 'link', 'ul', 'ol', 'quote', 'left', 'center', 'right'].map((action) => (
                  <button className="button" key={action} type="button" onClick={() => handleToolbarAction(action)}>
                    {action}
                  </button>
                ))}
              </div>
            </div>

            {editorTab === 'visual' ? (
              <div className="native-content-editor__visual-wrap">
                {visualEditorEmpty ? <span className="native-content-editor__placeholder">Start writing...</span> : null}
                <div
                  className="native-content-editor__visual"
                  contentEditable
                  ref={visualEditorRef}
                  suppressContentEditableWarning
                  onBlur={syncVisualBodyIntoDraft}
                  onInput={() => {
                    const html = visualEditorRef.current?.innerHTML || ''
                    setVisualEditorEmpty(isVisualEditorEmpty(html))
                  }}
                />
              </div>
            ) : (
              <textarea
                className="native-content-editor__textarea"
                ref={textareaRef}
                rows="18"
                value={draft.body || ''}
                onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
              />
            )}
          </article>

          <aside className="native-bridge-sidebar native-bridge-sidebar--open">
            <section className="wp-meta-box">
              <h2>Publish</h2>
              <label className="native-content-editor__field">
                <span>Author</span>
                <input
                  value={draft.author || ''}
                  onChange={(event) => setDraft((current) => ({ ...current, author: event.target.value }))}
                  placeholder="SabotPress"
                />
              </label>
              <label className="native-content-editor__field">
                <span>Publication date</span>
                <input
                  type="datetime-local"
                  value={toLocalDateTime(draft.publishedAt)}
                  onChange={(event) => setDraft((current) => ({ ...current, publishedAt: fromLocalDateTime(event.target.value) }))}
                />
              </label>
              <label className="native-content-editor__field">
                <span>Publication status</span>
                <select value={draft.status || 'draft'} onChange={(event) => setDraft((current) => {
                  const status = event.target.value
                  return {
                    ...current,
                    status,
                    workflowState: status === 'published' ? 'published' : status === 'scheduled' ? 'scheduled' : status === 'archived' ? 'archived' : current.workflowState || 'draft',
                  }
                })}>
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                  <option value="trash">Trash</option>
                </select>
              </label>
              <label className="native-content-editor__field">
                <span>Editorial workflow</span>
                <select value={draft.workflowState || 'draft'} onChange={(event) => setDraft((current) => ({ ...current, workflowState: event.target.value }))}>
                  <option value="draft">Draft</option>
                  <option value="in_review">Review</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              {draft.status === 'scheduled' ? (
                <label className="native-content-editor__field">
                  <span>Scheduled for</span>
                  <input
                    type="datetime-local"
                    value={toLocalDateTime(draft.scheduledFor)}
                    onChange={(event) => setDraft((current) => ({ ...current, scheduledFor: fromLocalDateTime(event.target.value) }))}
                  />
                </label>
              ) : null}
              <div className="native-content-editor__actions">
                <button className="button" type="button" onClick={() => handleSave('save draft', { status: 'draft', workflowState: 'draft' })}>Save Draft</button>
                <button className="button" type="button" onClick={() => handleSave('submit for review', { status: 'draft', workflowState: 'in_review' })}>Submit for Review</button>
                <button className="button" type="button" onClick={handlePreviewChanges}>Preview</button>
                <button className="button" type="button" onClick={() => handleSave('schedule', { status: 'scheduled', workflowState: 'scheduled' })}>Schedule</button>
                <button className="button button--primary" type="button" onClick={() => handleSave('publish', { status: 'published', workflowState: 'published' })}>Publish</button>
                {searchParams.get('edit') || searchParams.get('import') ? <button className="button button-link-delete" type="button" onClick={handleMoveToTrash}>Trash</button> : null}
              </div>
              {autosaveState.status === 'saving' ? <p className="description" role="status">Autosaving to D1…</p> : null}
              {autosaveState.status === 'saved' ? <p className="description" role="status">Autosaved to D1 {formatAutosaveTime(autosaveState.at)}</p> : null}
              {autosaveState.status === 'error' ? <p className="description" role="alert">Autosave failed. Unsaved editor changes remain in this browser until the next successful save.</p> : null}
              {recoverySnapshotLoaded ? <p className="description" role="status">Legacy recovery snapshot loaded. Autosave is paused until you explicitly save it.</p> : null}
              {publishSuccess ? <p className="description" role="status">Saved: <Link to={publishSuccess.slug ? `/post/${publishSuccess.slug}` : `/native-preview/${publishSuccess.id}`}>{publishSuccess.title}</Link></p> : null}
            </section>

            <section className="wp-meta-box">
              <h2>Post Settings</h2>
              <label className="native-content-editor__field">
                <span>Content type</span>
                <select value={draft.contentType || 'dispatch'} onChange={(event) => handleContentTypeChange(event.target.value)}>
                  <option value="dispatch">Dispatch</option>
                  <option value="podcast">Podcast</option>
                  <option value="print">Print</option>
                  <option value="note">Note</option>
                </select>
              </label>
              <label className="native-content-editor__field">
                <span>Default display</span>
                <select value={displaySettings.defaultMode} onChange={(event) => setDraft((current) => applyDisplayPatch(current, { defaultMode: event.target.value }))}>
                  <option value="read">Read</option>
                  <option value="experience">Experience</option>
                  <option value="print">Print</option>
                </select>
              </label>
            </section>

            <section className="wp-meta-box">
              <h2>Categories</h2>
              <div className="native-content-editor__tabs">
                <button className={`button${categoryTab === 'all' ? ' button--primary' : ''}`} type="button" onClick={() => setCategoryTab('all')}>All</button>
                <button className={`button${categoryTab === 'used' ? ' button--primary' : ''}`} type="button" onClick={() => setCategoryTab('used')}>Most Used</button>
              </div>
              {(categoryTab === 'used' ? mostUsedCategories : categoryOptions).map((category) => (
                <label className="native-content-editor__check" key={category}>
                  <input
                    type="checkbox"
                    checked={(draft.categories || []).includes(category)}
                    onChange={(event) => setDraft((current) => {
                      const currentCategories = normalizeTermList(current.categories || current.projects)
                      const next = event.target.checked
                        ? [...new Set([...currentCategories, category])]
                        : currentCategories.filter((item) => item !== category)
                      return { ...current, categories: next, projects: next }
                    })}
                  />
                  <span>{category}</span>
                </label>
              ))}
              <div className="native-content-editor__inline-add">
                <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} />
                <button className="button" type="button" onClick={() => {
                  const category = newCategory.trim()
                  if (!category) return
                  setDraft((current) => {
                    const next = [...new Set([...normalizeTermList(current.categories || current.projects), category])]
                    return { ...current, categories: next, projects: next }
                  })
                  setNewCategory('')
                }}>Add</button>
              </div>
            </section>

            <section className="wp-meta-box">
              <h2>Collections</h2>
              <label className="native-content-editor__field">
                <span>Collection slugs or names</span>
                <input
                  value={(draft.collections || []).join(', ')}
                  onChange={(event) => setDraft((current) => ({ ...current, collections: normalizeTermList(event.target.value) }))}
                  placeholder="collection-one, another-collection"
                />
              </label>
              <p className="description">{(draft.collections || []).join(', ') || 'No collections'}</p>
            </section>

            <section className="wp-meta-box">
              <h2>Campaign relationship</h2>
              <label className="native-content-editor__field">
                <span>Connected campaign</span>
                <select
                  value={(draft.campaigns || [])[0] || ''}
                  onChange={(event) => setDraft((current) => ({ ...current, campaigns: event.target.value ? [event.target.value] : [] }))}
                >
                  <option value="">No campaign</option>
                  {campaignOptions.map((campaign) => (
                    <option key={campaign.id || campaign.slug} value={campaign.slug}>
                      {campaign.shortTitle || campaign.title} ({campaign.status})
                    </option>
                  ))}
                </select>
              </label>
              {campaignOptionsState === 'loading' ? <p className="description">Loading campaigns from D1…</p> : null}
              {campaignOptionsState === 'error' ? <p className="description">Campaign selection is unavailable until the D1 connection recovers.</p> : null}
              <p className="description">Published posts connected here automatically appear in campaign reporting and the campaign log.</p>
            </section>

            <section className="wp-meta-box">
              <h2>Tags</h2>
              <div className="native-content-editor__inline-add">
                <input value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addTagsFromInput()
                  }
                }} />
                <button className="button" type="button" onClick={() => addTagsFromInput()}>Add</button>
              </div>
              <p className="description">{(draft.tags || []).join(', ') || 'No tags'}</p>
              {mostUsedTags.length ? (
                <p className="description">
                  {mostUsedTags.slice(0, 8).map((tag) => (
                    <button className="button" type="button" key={tag} onClick={() => addTagsFromInput(tag)}>{tag}</button>
                  ))}
                </p>
              ) : null}
            </section>

            <section className="wp-meta-box">
              <h2>Featured Image</h2>
              {draft.featuredImage ? <img className="native-content-editor__featured-preview" src={draft.featuredImage} alt="" /> : null}
              <label className="native-content-editor__field">
                <span>Image URL</span>
                <input value={draft.featuredImage || ''} onChange={(event) => setDraft((current) => ({ ...current, featuredImage: event.target.value, heroImage: event.target.value }))} />
              </label>
              <button className="button" type="button" onClick={() => setOpenMediaFor('featured')}>Choose from Media</button>
              <label className="native-content-editor__field">
                <span>Featured image title</span>
                <select
                  value={draft.featuredTitleDisplay || getDefaultFeaturedTitleDisplayForContentType(draft.contentType || 'dispatch')}
                  onChange={(event) => setDraft((current) => ({ ...current, featuredTitleDisplay: event.target.value }))}
                >
                  <option value="overlay">Overlay title on image</option>
                  <option value="below">Show title below image</option>
                  <option value="hidden">Hide title because image already includes it</option>
                </select>
              </label>
            </section>

            <section className="wp-meta-box">
              <h2>Excerpt</h2>
              <label className="native-content-editor__field native-content-editor__field--plain">
                <span>Excerpt</span>
                <textarea
                  rows="4"
                  value={draft.excerpt || ''}
                  onChange={(event) => setDraft((current) => ({ ...current, excerpt: event.target.value }))}
                />
              </label>
            </section>

            <section className="wp-meta-box">
              <h2>Discussion</h2>
              <label className="native-content-editor__check">
                <input type="checkbox" checked={allowComments} onChange={(event) => setAllowComments(event.target.checked)} />
                <span>Allow comments</span>
              </label>
            </section>

            <section className="wp-meta-box">
              <div className="wp-screen-header wp-screen-header--compact">
                <div>
                  <h2>Revision History</h2>
                  <p className="description">Authoritative server revisions stored in D1.</p>
                </div>
                <button className="button" type="button" onClick={() => reloadServerRevisions(activeId)} disabled={!activeId || revisionState === 'loading'}>
                  {revisionState === 'loading' ? 'Loading…' : 'Reload'}
                </button>
              </div>

              {revisionError ? (
                <div className="notice notice-error" role="alert"><p>{revisionError}</p></div>
              ) : null}

              {revisionState === 'loading' ? <p className="description">Loading D1 revision history…</p> : null}
              {revisionState !== 'loading' && !revisions.length ? <p className="description">No server revisions yet. The first successful save or autosave will create one.</p> : null}

              {revisions.length ? (
                <div className="native-content-editor__revision-list">
                  {revisions.slice(0, 8).map((revision, index) => {
                    const previous = revisions[index + 1]?.draft || {}
                    return (
                      <article className="native-content-editor__revision" key={revision.id}>
                        <strong>{new Date(revision.createdAt).toLocaleString()}</strong>
                        <span>{revision.editor} / {revision.note || 'save'}</span>
                        <span>Changed: {summarizeRevisionChanges(revision.draft, previous)}</span>
                        <div className="review-card__actions">
                          <button className="button" type="button" onClick={() => setCompareRevisionId(revision.id)}>Compare</button>
                          <button
                            className="button"
                            type="button"
                            disabled={restoringRevisionId === revision.id}
                            onClick={() => handleRestoreRevision(revision)}
                          >
                            {restoringRevisionId === revision.id ? 'Restoring…' : 'Restore in D1'}
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : null}

              {compareRevision ? (
                <div className="native-content-editor__revision-compare">
                  <h3>Compare Revision</h3>
                  <dl>
                    <dt>Title</dt>
                    <dd><del>{compareRevision.draft?.title || 'Untitled'}</del><ins>{draft.title || 'Untitled'}</ins></dd>
                    <dt>Status</dt>
                    <dd><del>{compareRevision.draft?.status || 'draft'}</del><ins>{draft.status || 'draft'}</ins></dd>
                    <dt>Excerpt length</dt>
                    <dd><del>{String(compareRevision.draft?.excerpt || '').length}</del><ins>{String(draft.excerpt || '').length}</ins></dd>
                    <dt>Body length</dt>
                    <dd><del>{String(compareRevision.draft?.body || '').length}</del><ins>{String(draft.body || '').length}</ins></dd>
                  </dl>
                </div>
              ) : null}

              {legacyRevisions.length ? (
                <details className="native-content-editor__legacy-revisions">
                  <summary>Legacy browser recovery snapshots ({legacyRevisions.length})</summary>
                  <p className="description">These snapshots were created by the old browser-only revision system. They are recovery data only and are never merged into D1 automatically.</p>
                  <div className="native-content-editor__revision-list">
                    {legacyRevisions.slice(0, 8).map((revision) => (
                      <article className="native-content-editor__revision" key={revision.id || revision.createdAt}>
                        <strong>{new Date(revision.createdAt || 0).toLocaleString()}</strong>
                        <span>{revision.note || 'legacy local snapshot'}</span>
                        <div className="review-card__actions">
                          <button className="button" type="button" onClick={() => loadLegacyRecoveryRevision(revision)}>Load recovery snapshot</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </details>
              ) : null}
            </section>
          </aside>
        </section>

        <MediaPickerModal
          open={Boolean(openMediaFor)}
          onClose={() => setOpenMediaFor('')}
          onPick={(media) => {
            const selectedMedia = {
              url: String(media?.url || ''),
              title: String(media?.title || ''),
              alt: String(media?.alt || ''),
              caption: String(media?.caption || ''),
            }
            if (openMediaFor === 'featured') {
              setDraft((d) => ({
                ...d,
                featuredImage: selectedMedia.url,
                heroImage: selectedMedia.url,
                podcastCoverImage: (d.contentType || 'dispatch') === 'podcast' ? selectedMedia.url : d.podcastCoverImage || '',
                featuredImageTitle: selectedMedia.title,
                featuredImageAlt: selectedMedia.alt,
                featuredImageCaption: selectedMedia.caption,
              }))
            }
            if (openMediaFor === 'body') {
              const escapedUrl = escapeHtmlAttribute(selectedMedia.url)
              const escapedAlt = escapeHtmlAttribute(selectedMedia.alt)
              const escapedCaption = escapeHtmlText(selectedMedia.caption)
              const visualMarkup = escapedCaption
                ? `<figure><img src="${escapedUrl}" alt="${escapedAlt}" /><figcaption>${escapedCaption}</figcaption></figure><p><br /></p>`
                : `<img src="${escapedUrl}" alt="${escapedAlt}" /><p><br /></p>`
              const textMarkup = escapedCaption
                ? `<figure><img src="${escapedUrl}" alt="${escapedAlt}" /><figcaption>${escapedCaption}</figcaption></figure>`
                : `<img src="${escapedUrl}" alt="${escapedAlt}" />`
              if (editorTab === 'visual') {
                insertHtmlIntoVisualEditor(visualMarkup)
              } else {
                insertAtCursor(`\n${textMarkup}\n`)
              }
            }
            setOpenMediaFor('')
          }}
        />
      </main>
    </AdminFrame>
  )
}
