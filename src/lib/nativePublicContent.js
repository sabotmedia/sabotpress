import {
  fetchNativeEntries,
  saveNativeEntry,
  removeNativeEntry,
} from './nativePublicContentApi'
import { getImportedImage } from './getImportedImage'
import { normalizeNativeDisplaySettings } from './publicDisplayModes'
import { getDefaultFeaturedTitleDisplayForContentType, normalizeFeaturedTitleDisplay, resolveFeaturedTitleDisplay } from './featuredTitleDisplay'

const FALLBACK_STORAGE_KEY = 'sabot-native-public-content-v1'

export const NATIVE_CONTENT_SCHEMA_VERSION = 3

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return fallback
}

export function createEmptyNativeEntry() {
  const now = new Date().toISOString()
  return {
    id: `native-${Math.random().toString(36).slice(2, 10)}`,
    schemaVersion: NATIVE_CONTENT_SCHEMA_VERSION,
    contentType: 'note',
    status: 'draft',
    workflowState: 'draft',
    target: 'general',
    title: '',
    slug: '',
    excerpt: '',
    body: '',
    richBody: [],
    author: '',
    sourceType: 'manual',
    sourceKind: 'manual',
    sourceLabel: '',
    sourceUrl: '',
    sourceExternalId: '',
    sourcePostId: '',
    sourceNotes: '',
    categories: [],
    projects: [],
    collections: [],
    campaigns: [],
    tags: [],
    bodyHtml: '',
    featuredImage: '',
    heroImage: '',
    featuredImageTitle: '',
    featuredTitleDisplay: '',
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
    podcastMimeType: '',
    podcastFileSize: '',
    podcastExplicit: false,
    podcastCredits: '',
    podcastLicense: '',
    podcastMarkers: [],
    podcastTranscriptCues: [],
    podcastAudioMediaId: '',
    podcastAudioStorageKey: '',
    podcastMasterAudioUrl: '',
    podcastDeliveryAudioUrl: '',
    podcastDeliveryStatus: '',
    relatedAssets: [],
    relatedPrintLinks: [],
    seoTitle: '',
    seoDescription: '',
    createdAt: now,
    updatedAt: now,
    publishedAt: '',
    scheduledFor: '',
    allowComments: true,
  }
}

export function normalizeNativeEntry(input) {
  const raw = input || {}
  const status = normalizeEnum(raw.status, ['draft', 'published', 'scheduled', 'archived', 'trash']) || 'draft'
  const workflowState =
    normalizeEnum(raw.workflowState, ['draft', 'in_review', 'needs_revision', 'ready', 'scheduled', 'published', 'archived']) ||
    inferWorkflowState(raw, status)
  const display = normalizeNativeDisplaySettings(raw)

  return {
    id: String(raw.id || `native-${Math.random().toString(36).slice(2, 10)}`),
    schemaVersion: NATIVE_CONTENT_SCHEMA_VERSION,
    contentType: normalizeEnum(raw.contentType, ['note', 'publicBlock', 'dispatch', 'podcast', 'print']) || 'note',
    status,
    workflowState,
    target: normalizeEnum(raw.target, ['general', 'home', 'press', 'projects']) || 'general',
    title: String(raw.title || ''),
    slug: slugify(raw.slug || raw.title || ''),
    excerpt: String(raw.excerpt || ''),
    body: String(raw.body || ''),
    richBody: Array.isArray(raw.richBody) ? raw.richBody : [],
    author: String(raw.author || ''),
    sourceType: String(raw.sourceType || 'manual'),
    sourceKind: String(raw.sourceKind || raw.sourceType || 'manual'),
    sourceLabel: String(raw.sourceLabel || ''),
    sourceUrl: String(raw.sourceUrl || ''),
    sourceExternalId: String(raw.sourceExternalId || ''),
    sourcePostId: String(raw.sourcePostId || raw.sourceExternalId || ''),
    sourceNotes: String(raw.sourceNotes || ''),
    bodyHtml: String(raw.bodyHtml || raw.body || ''),
    heroImage: String(raw.heroImage || raw.featuredImage || ''),
    featuredImage: String(raw.featuredImage || raw.heroImage || ''),
    featuredImageTitle: String(raw.featuredImageTitle || ''),
    featuredTitleDisplay: normalizeFeaturedTitleDisplay(raw.featuredTitleDisplay),
    featuredImageAlt: String(raw.featuredImageAlt || ''),
    featuredImageCaption: String(raw.featuredImageCaption || ''),
    enableReadMode: display.enableReadMode,
    enableExperienceMode: display.enableExperienceMode,
    enablePrintMode: display.enablePrintMode,
    defaultMode: display.defaultMode,
    heroStyle: display.heroStyle,
    audioSummary: String(raw.audioSummary || ''),
    transcriptExcerpt: String(raw.transcriptExcerpt || ''),
    hasPrintAssets: Boolean(raw.hasPrintAssets),
    transcriptionStatus: String(raw.transcriptionStatus || 'none'),
    audioSourceUrl: String(raw.audioSourceUrl || ''),
    podcastAudioUrl: String(raw.podcastAudioUrl || raw.audioSourceUrl || ''),
    podcastRssEnclosureUrl: String(raw.podcastRssEnclosureUrl || ''),
    podcastDuration: String(raw.podcastDuration || ''),
    podcastEpisodeNumber: String(raw.podcastEpisodeNumber || ''),
    podcastSeason: String(raw.podcastSeason || ''),
    podcastTranscript: String(raw.podcastTranscript || raw.fullTranscript || ''),
    podcastSummary: String(raw.podcastSummary || raw.audioSummary || ''),
    podcastCoverImage: String(raw.podcastCoverImage || raw.featuredImage || raw.heroImage || ''),
    podcastMimeType: String(raw.podcastMimeType || raw.podcastEnclosureType || ''),
    podcastFileSize: String(raw.podcastFileSize || raw.podcastEnclosureLength || ''),
    podcastExplicit: normalizeBoolean(raw.podcastExplicit, false),
    podcastCredits: String(raw.podcastCredits || ''),
    podcastLicense: String(raw.podcastLicense || ''),
    podcastMarkers: Array.isArray(raw.podcastMarkers) ? raw.podcastMarkers : [],
    podcastTranscriptCues: Array.isArray(raw.podcastTranscriptCues) ? raw.podcastTranscriptCues : [],
    podcastAudioMediaId: String(raw.podcastAudioMediaId || ''),
    podcastAudioStorageKey: String(raw.podcastAudioStorageKey || ''),
    podcastMasterAudioUrl: String(raw.podcastMasterAudioUrl || ''),
    podcastDeliveryAudioUrl: String(raw.podcastDeliveryAudioUrl || ''),
    podcastDeliveryStatus: String(raw.podcastDeliveryStatus || ''),
    fullTranscript: String(raw.fullTranscript || ''),
    transcriptNotes: String(raw.transcriptNotes || ''),
    relatedAssets: Array.isArray(raw.relatedAssets) ? raw.relatedAssets : [],
    relatedPrintLinks: Array.isArray(raw.relatedPrintLinks) ? raw.relatedPrintLinks : [],
    seoTitle: String(raw.seoTitle || raw.metaTitle || ''),
    seoDescription: String(raw.seoDescription || raw.metaDescription || ''),
    categories: normalizeTags(raw.categories || raw.projects),
    projects: normalizeTags(raw.projects || raw.categories),
    collections: normalizeTags(raw.collections || raw.collection),
    campaigns: normalizeTags(raw.campaigns || raw.campaignRelations),
    tags: normalizeTags(raw.tags),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
    publishedAt: String(raw.publishedAt || ''),
    scheduledFor: normalizeDateString(raw.scheduledFor || ''),
    allowComments: raw.allowComments !== false,
  }
}

export function createNativeEntryFromImportedPiece(piece = {}) {
  const now = new Date().toISOString()
  const slug = slugify(piece.slug || piece.title || piece.id || '')
  const sourcePostId = String(piece.sourcePostId || piece.id || slug)
  const projects = normalizeTags(piece.projects || piece.primaryProject || piece.primaryProjectSlug)
  const collections = normalizeTags(piece.collections || piece.collection)
  const featuredImage = String(piece.featuredImage || piece.heroImage || piece.imageUrl || getImportedImage(piece) || '')
  const publishedAt = normalizeDateString(piece.publishedAt || piece.date || '') || now
  const contentType = mapImportedContentType(piece.type || piece.contentType)

  return normalizeNativeEntry({
    id: `imported-${sourcePostId || slug}`,
    schemaVersion: NATIVE_CONTENT_SCHEMA_VERSION,
    contentType,
    status: 'published',
    workflowState: 'published',
    target: projects.length ? 'projects' : 'general',
    title: piece.title || '',
    slug,
    excerpt: piece.excerpt || piece.subtitle || '',
    body: piece.bodyHtml || piece.body || '',
    bodyHtml: piece.bodyHtml || piece.body || '',
    richBody: Array.isArray(piece.richBody) ? piece.richBody : [],
    author: piece.author || 'SabotPress',
    sourceType: 'imported',
    sourceKind: 'imported',
    sourceLabel: piece.sourcePostType || piece.type || 'imported archive',
    sourceUrl: piece.sourceUrl || '',
    sourceExternalId: sourcePostId,
    sourcePostId,
    sourceNotes: piece.sourceNotes || '',
    categories: projects,
    projects,
    collections,
    campaigns: piece.campaigns || [],
    tags: piece.tags || [],
    featuredImage,
    heroImage: featuredImage,
    featuredImageTitle: piece.featuredImageTitle || piece.title || '',
    featuredTitleDisplay: resolveFeaturedTitleDisplay(piece) || getDefaultFeaturedTitleDisplayForContentType(contentType),
    featuredImageAlt: piece.featuredImageAlt || '',
    featuredImageCaption: piece.featuredImageCaption || '',
    hasPrintAssets: Boolean(piece.hasPrintAssets || contentType === 'print'),
    relatedAssets: piece.relatedAssets || [],
    relatedPrintLinks: piece.relatedPrintLinks || [],
    createdAt: piece.createdAt || publishedAt,
    updatedAt: now,
    publishedAt,
    allowComments: piece.allowComments !== false,
  })
}

export function normalizeNativeCollection(input) {
  const arr = Array.isArray(input) ? input : []
  return arr.map(normalizeNativeEntry).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

function loadLocalNativeCollection() {
  try {
    const raw = window.localStorage.getItem(FALLBACK_STORAGE_KEY)
    if (!raw) return []
    return normalizeNativeCollection(JSON.parse(raw))
  } catch {
    return []
  }
}

export function loadLegacyNativeCollection() {
  return loadLocalNativeCollection()
}

function mergeNativeCollections(primary = [], secondary = []) {
  const byId = new Map()
  for (const item of normalizeNativeCollection(secondary)) byId.set(item.id, item)
  for (const item of normalizeNativeCollection(primary)) byId.set(item.id, item)
  return normalizeNativeCollection([...byId.values()])
}

export async function loadNativeCollection(params = {}) {
  const data = await fetchNativeEntries(params)
  if (!data?.ok || !Array.isArray(data.items) || data.mode === 'scaffold') {
    throw new Error(data?.error || 'Native content load did not return confirmed D1 data')
  }
  return normalizeNativeCollection(data.items)
}

// Legacy browser helpers are retained only for explicit recovery/migration.
// Production read/write paths above and below never use them as persistence.
export function saveNativeCollection(items) {
  const normalized = normalizeNativeCollection(items)
  try { window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(normalized)) } catch { /* recovery store only */ }
  return normalized
}

export function upsertNativeEntryLocal(items, entry) {
  const normalizedEntry = normalizeNativeEntry({
    ...entry,
    updatedAt: new Date().toISOString(),
    publishedAt: ['published', 'scheduled'].includes(String(entry?.status || '')) ? String(entry.publishedAt || new Date().toISOString()) : String(entry?.publishedAt || ''),
  })
  const localBase = mergeNativeCollections(items || [], loadLocalNativeCollection())
  const nextItems = normalizeNativeCollection(localBase.some((item) => item.id === normalizedEntry.id) ? localBase.map((item) => (item.id === normalizedEntry.id ? normalizedEntry : item)) : [normalizedEntry, ...localBase])
  try {
    window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(nextItems))
    return { items: nextItems, item: normalizedEntry, ok: true }
  } catch {
    return { items: nextItems, item: normalizedEntry, ok: false }
  }
}

export async function upsertNativeEntry(items, entry, revisionNote = 'save') {
  const result = await upsertNativeEntryWithMeta(items, entry, revisionNote)
  return result.items
}

export async function upsertNativeEntryWithMeta(items, entry, revisionNote = 'save') {
  const normalizedEntry = normalizeNativeEntry({
    ...entry,
    updatedAt: new Date().toISOString(),
    publishedAt: ['published', 'scheduled'].includes(String(entry?.status || '')) ? String(entry.publishedAt || new Date().toISOString()) : String(entry?.publishedAt || ''),
  })
  const data = await saveNativeEntry(normalizedEntry, revisionNote)
  if (!data?.ok || !data?.item || data.mode === 'scaffold') {
    throw new Error(data?.error || 'Native content save did not receive confirmed D1 persistence')
  }
  const saved = normalizeNativeEntry(data.item)
  const current = normalizeNativeCollection(items || [])
  const next = current.some((item) => item.id === saved.id)
    ? current.map((item) => (item.id === saved.id ? saved : item))
    : [saved, ...current]
  return { items: normalizeNativeCollection(next), item: saved, synced: true }
}

export async function deleteNativeEntry(items, id) {
  const data = await removeNativeEntry(id)
  if (data && data.ok === false) throw new Error(data.error || 'Native content delete failed')
  return normalizeNativeCollection((items || []).filter((item) => item.id !== id && item.slug !== id))
}

export function exportNativeCollection(items) {
  return JSON.stringify({ schemaVersion: NATIVE_CONTENT_SCHEMA_VERSION, items: normalizeNativeCollection(items) }, null, 2)
}

export function importNativeCollection(raw) {
  const payload = raw?.items && Array.isArray(raw.items) ? raw.items : Array.isArray(raw) ? raw : []
  return saveNativeCollection(payload)
}

export function getPublishedNativeEntries(items) {
  return normalizeNativeCollection(items).filter((item) => ['published', 'scheduled'].includes(item.status) && isScheduledVisible(item))
}

export function getLatestPublishedNativeEntry(items, target = '') {
  const published = getPublishedNativeEntries(items)
  return published.find((item) => !target || item.target === target) || null
}

export function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function isScheduledVisible(item) {
  if (!item?.scheduledFor) return true
  const ms = new Date(item.scheduledFor).getTime()
  return !Number.isFinite(ms) || ms <= Date.now()
}

function inferWorkflowState(raw, status) {
  if (status === 'archived') return 'archived'
  if (status === 'published') {
    const scheduled = normalizeDateString(raw?.scheduledFor || '')
    if (scheduled && new Date(scheduled).getTime() > Date.now()) return 'scheduled'
    return 'published'
  }
  return 'draft'
}

function normalizeDateString(value) {
  const str = String(value || '').trim()
  if (!str) return ''
  const ms = new Date(str).getTime()
  return Number.isFinite(ms) ? new Date(ms).toISOString() : ''
}

function normalizeEnum(value, allowed) {
  const str = String(value || '').trim()
  return allowed.includes(str) ? str : ''
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean)
  return []
}

function mapImportedContentType(value) {
  const type = String(value || '').toLowerCase()
  if (type === 'podcast' || type === 'audio') return 'podcast'
  if (['print', 'zine', 'comic'].includes(type)) return 'print'
  if (type === 'note') return 'note'
  return 'dispatch'
}
