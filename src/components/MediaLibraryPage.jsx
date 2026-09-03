import { useEffect, useMemo, useRef, useState } from 'react'
import { getPieces } from '../lib/pieces'
import { loadNativeCollection } from '../lib/nativePublicContent'
import { loadLocalMediaItems } from '../lib/localMediaLibrary'
import { fetchMediaAssets, saveMediaAsset } from '../lib/mediaAssetsApi'
import { AdminFrame } from './AdminRail'
import { WpAdminNotices, useAdminNotices } from './WpAdminNotices'

const MEDIA_ACCEPT = [
  'image/*',
  'audio/*',
  'video/mp4',
  'video/webm',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/epub+zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'text/plain',
  'text/markdown',
  'text/csv',
].join(',')

function collectMediaFromPieces(pieces) {
  const list = []
  for (const piece of pieces || []) {
    const pushUrl = (url, extra = {}) => {
      const clean = String(url || '').trim()
      if (!clean) return
      list.push(normalizeMediaItem({
        id: `imported-${clean}`,
        url: clean,
        title: piece.title || extra.title || 'Imported media',
        alt: extra.alt || '',
        caption: extra.caption || '',
        description: extra.description || '',
        source: 'imported',
        mediaType: extra.mediaType || 'image',
        mimeType: extra.mimeType || '',
      }))
    }

    pushUrl(piece.featuredImage, { title: piece.title, mediaType: 'image' })
    pushUrl(piece.heroImage, { title: piece.title, mediaType: 'image' })
    pushUrl(piece.imageUrl, { title: piece.title, mediaType: 'image' })

    for (const asset of piece.relatedAssets || []) {
      pushUrl(asset?.url || asset?.href, {
        title: asset?.title || piece.title,
        alt: asset?.alt || '',
        caption: asset?.caption || '',
        description: asset?.description || '',
        mediaType: asset?.kind === 'image' ? 'image' : asset?.kind === 'pdf' ? 'pdf' : asset?.kind || 'file',
        mimeType: asset?.mimeType || '',
      })
    }
  }
  return list.filter(Boolean)
}

function collectMediaFromNative(items) {
  const list = []
  for (const entry of items || []) {
    const imageUrl = String(entry.featuredImage || entry.heroImage || '').trim()
    if (imageUrl) {
      list.push(normalizeMediaItem({
        id: `native-${entry.id}-${imageUrl}`,
        url: imageUrl,
        title: entry.featuredImageTitle || entry.title || 'Native image',
        alt: entry.featuredImageAlt || '',
        caption: entry.featuredImageCaption || '',
        description: String(entry.excerpt || ''),
        source: 'native',
        mediaType: 'image',
      }))
    }

    const body = String(entry.body || entry.bodyHtml || '')
    for (const match of body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const url = String(match[1] || '').trim()
      if (!url || !looksLikeFileUrl(url)) continue
      const text = String(match[2] || '').replace(/<[^>]+>/g, '').trim()
      list.push(normalizeMediaItem({
        id: `native-file-${entry.id}-${url}`,
        url,
        title: text || entry.title || 'Native file',
        description: String(entry.excerpt || ''),
        source: 'native',
        mediaType: inferMediaType('', url),
      }))
    }

    const audioUrl = String(entry.podcastAudioUrl || entry.audioSourceUrl || '').trim()
    if (audioUrl) {
      list.push(normalizeMediaItem({
        id: `native-audio-${entry.id}-${audioUrl}`,
        url: audioUrl,
        title: entry.title || 'Native audio',
        description: String(entry.podcastSummary || entry.excerpt || ''),
        source: 'native',
        mediaType: 'audio',
      }))
    }
  }
  return list.filter(Boolean)
}

function normalizeMediaItem(raw = {}) {
  const url = String(raw.url || raw.publicUrl || raw.downloadUrl || raw.dataUrl || '').trim()
  if (!url) return null
  const filename = String(raw.filename || filenameFromUrl(url) || '')
  const mediaType = normalizeMediaType(raw.mediaType || inferMediaType(raw.mimeType, filename || url))
  const alt = String(raw.alt ?? raw.altText ?? raw.alt_text ?? '')
  return {
    id: String(raw.id || `media-${Math.random().toString(36).slice(2, 10)}`),
    url,
    downloadUrl: String(raw.downloadUrl || url),
    filename,
    title: String(raw.title || filename.replace(/\.[^.]+$/, '') || 'Media'),
    alt,
    altText: alt,
    caption: String(raw.caption || ''),
    description: String(raw.description || ''),
    credit: String(raw.credit || ''),
    attribution: String(raw.attribution || raw.attributionText || raw.credit || ''),
    creator: String(raw.creator || ''),
    license: String(raw.license || ''),
    licenseUrl: String(raw.licenseUrl || ''),
    sourceUrl: String(raw.sourceUrl || raw.landingUrl || raw.landingPageUrl || ''),
    folder: String(raw.folder || defaultFolder(mediaType)),
    tags: normalizeTags(raw.tags),
    mimeType: String(raw.mimeType || ''),
    extension: String(raw.extension || extensionFromFilename(filename) || ''),
    mediaType,
    source: String(raw.source || 'registry'),
    storageKey: String(raw.storageKey || ''),
    size: Number(raw.size || 0) || 0,
    uploadedAt: String(raw.uploadedAt || raw.createdAt || ''),
    createdAt: String(raw.createdAt || raw.uploadedAt || ''),
    updatedAt: String(raw.updatedAt || ''),
  }
}

function normalizeMediaType(value) {
  const type = String(value || '').toLowerCase()
  if (type === 'svg') return 'svg'
  if (type === 'image') return 'image'
  if (type === 'audio') return 'audio'
  if (type === 'video') return 'video'
  if (type === 'pdf') return 'pdf'
  if (['document', 'archive', 'epub', 'text', 'file'].includes(type)) return type
  return 'file'
}

function dedupeMedia(items) {
  const byUrl = new Map()
  for (const item of items.filter(Boolean)) {
    const key = String(item.url || item.downloadUrl || '').trim()
    if (!key) continue
    const current = byUrl.get(key)
    if (!current || mediaSourceRank(item) > mediaSourceRank(current)) byUrl.set(key, item)
  }
  return [...byUrl.values()]
}

function mediaSourceRank(item) {
  if (['server-upload', 'registry', 'media-registry'].includes(item?.source)) return 5
  if (item?.storageKey) return 5
  if (item?.source === 'native') return 3
  if (item?.source === 'imported') return 2
  return 1
}

export function loadMediaLibraryItems(nativeItems = [], registryItems = []) {
  const registry = (registryItems || []).map(normalizeMediaItem).filter(Boolean)
  return dedupeMedia([
    ...registry,
    ...collectMediaFromNative(nativeItems || []),
    ...collectMediaFromPieces(getPieces()),
  ])
}

async function loadMediaLibraryState() {
  const [registryResult, nativeResult] = await Promise.allSettled([
    fetchMediaAssets(),
    loadNativeCollection({ includeFuture: 1 }),
  ])

  const registryItems = registryResult.status === 'fulfilled' && Array.isArray(registryResult.value?.items)
    ? registryResult.value.items
    : []
  const nativeItems = nativeResult.status === 'fulfilled' && Array.isArray(nativeResult.value)
    ? nativeResult.value
    : []
  const items = loadMediaLibraryItems(nativeItems, registryItems)
  const persistentUrls = new Set(registryItems.map((item) => String(item?.url || '').trim()).filter(Boolean))
  const legacyItems = loadLocalMediaItems()
    .map(normalizeMediaItem)
    .filter(Boolean)
    .filter((item) => !persistentUrls.has(item.url))

  const errors = []
  if (registryResult.status === 'rejected') errors.push(`Media registry: ${String(registryResult.reason?.message || registryResult.reason)}`)
  if (nativeResult.status === 'rejected') errors.push(`Native media references: ${String(nativeResult.reason?.message || nativeResult.reason)}`)

  return { items, legacyItems, error: errors.join(' ') }
}

async function uploadMediaFileToServer(file) {
  const form = new FormData()
  form.append('file', file, file.name || 'upload')
  form.append('filename', file.name || 'upload')
  form.append('mimeType', file.type || '')
  form.append('title', String(file.name || 'upload').replace(/\.[^.]+$/, ''))

  const response = await fetch('/api/media/files', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  })
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : { ok: false, error: await response.text() }

  if (!response.ok || !payload?.ok || !payload?.media?.url) {
    throw new Error(payload?.error || `Upload failed with status ${response.status}`)
  }

  return normalizeMediaItem(payload.media)
}

async function uploadMediaFiles(files = []) {
  const created = []
  const rejected = []
  for (const file of files) {
    try {
      created.push(await uploadMediaFileToServer(file))
    } catch (error) {
      rejected.push({ name: file?.name || 'file', error: String(error?.message || error) })
    }
  }
  return { created, rejected }
}

function mergeUploadedMedia(created, items) {
  return dedupeMedia([...(created || []), ...(items || [])])
}

function mediaKindLabel(item = {}) {
  const type = String(item.mediaType || 'file').toUpperCase()
  if (type === 'IMAGE') return 'IMAGE'
  if (type === 'SVG') return 'SVG'
  if (type === 'PDF') return 'PDF'
  if (type === 'AUDIO') return 'AUDIO'
  if (type === 'VIDEO') return 'VIDEO'
  return type
}

function formatBytes(value = 0) {
  const bytes = Number(value || 0)
  if (!bytes) return ''
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function MediaPreview({ item, compact = false }) {
  if (!item) return null
  const type = item.mediaType
  if (type === 'image' || type === 'svg') {
    return <img src={item.url} alt={item.alt || item.title || ''} loading="lazy" />
  }
  if (type === 'audio') {
    return compact ? <span className="media-file-icon" aria-hidden="true">AUDIO</span> : <audio controls src={item.url} preload="metadata" />
  }
  if (type === 'video') {
    return compact ? <span className="media-file-icon" aria-hidden="true">VIDEO</span> : <video controls src={item.url} preload="metadata" />
  }
  if (type === 'pdf') return <span className="media-file-icon" aria-hidden="true">PDF</span>
  return <span className="media-file-icon" aria-hidden="true">{mediaKindLabel(item)}</span>
}

function MediaTile({ item, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`media-library-tile${selected ? ' is-selected' : ''}`}
      onClick={() => onSelect(item)}
      aria-pressed={selected}
    >
      <span className="media-library-tile__preview"><MediaPreview item={item} compact /></span>
      <span className="media-library-tile__meta">
        <strong>{item.title || item.filename || 'Untitled'}</strong>
        <small>{mediaKindLabel(item)}{item.size ? ` · ${formatBytes(item.size)}` : ''}</small>
      </span>
    </button>
  )
}

function UploadPanel({ onUploaded, compact = false }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  async function handleFiles(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setBusy(true)
    setStatus('')
    setError('')
    const { created, rejected } = await uploadMediaFiles(files)
    if (created.length) {
      setStatus(`${created.length} file${created.length === 1 ? '' : 's'} uploaded and registered.`)
      onUploaded?.(created)
    }
    if (rejected.length) {
      setError(rejected.map((item) => `${item.name}: ${item.error}`).join(' · '))
    }
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <section
      className={`media-upload-panel${compact ? ' media-upload-panel--compact' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        handleFiles(event.dataTransfer?.files)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={MEDIA_ACCEPT}
        className="media-upload-panel__input"
        onChange={(event) => handleFiles(event.target.files)}
      />
      <div>
        <strong>{busy ? 'Uploading…' : 'Upload media'}</strong>
        <p>Files are saved to site media storage and registered in D1. Server failure is a failure; there is no browser-local pretend upload.</p>
      </div>
      <button className="button button--primary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
        Select Files
      </button>
      {status ? <p className="description" role="status">{status}</p> : null}
      {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
    </section>
  )
}

function LegacyRecoveryNotice({ items = [], onRegistered }) {
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  if (!items.length) return null

  async function registerExisting(item) {
    if (!item?.url || item.url.startsWith('data:')) return
    try {
      setBusyId(item.id)
      setError('')
      const result = await saveMediaAsset(toPersistentAsset(item))
      onRegistered?.(normalizeMediaItem(result?.asset || item))
    } catch (nextError) {
      setError(String(nextError?.message || nextError))
    } finally {
      setBusyId('')
    }
  }

  return (
    <section className="wp-meta-box media-legacy-recovery">
      <h2>Legacy browser media recovery</h2>
      <p className="description">
        {items.length} media record{items.length === 1 ? '' : 's'} exist only in this browser's old cache and are not treated as published Media Library assets.
        Existing server URLs can be registered in D1 below. Data-URL uploads require the original file to be uploaded again.
      </p>
      {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
      <div className="media-legacy-recovery__list">
        {items.slice(0, 24).map((item) => {
          const dataOnly = item.url.startsWith('data:')
          return (
            <article key={item.id} className="media-legacy-recovery__item">
              <strong>{item.title || item.filename || 'Legacy media'}</strong>
              <span>{dataOnly ? 'Browser data only — re-upload original file' : 'Existing URL can be registered'}</span>
              {!dataOnly ? (
                <button className="button" type="button" disabled={busyId === item.id} onClick={() => registerExisting(item)}>
                  {busyId === item.id ? 'Registering…' : 'Register in D1'}
                </button>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function AttachmentDetails({ selected, onSaved }) {
  const [fields, setFields] = useState(() => fieldsFromItem(selected))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    setFields(fieldsFromItem(selected))
    setError('')
    setStatus('')
  }, [selected?.id, selected?.url])

  if (!selected) {
    return (
      <aside className="media-attachment-details media-attachment-details--empty">
        <h2>Attachment details</h2>
        <p>Select an item to inspect or edit persistent metadata.</p>
      </aside>
    )
  }

  function update(field, value) {
    setFields((current) => ({ ...current, [field]: value }))
    setStatus('')
  }

  async function save() {
    try {
      setSaving(true)
      setError('')
      setStatus('')
      const result = await saveMediaAsset(toPersistentAsset({ ...selected, ...fields }))
      const saved = normalizeMediaItem(result?.asset || { ...selected, ...fields })
      onSaved?.(saved)
      setFields(fieldsFromItem(saved))
      setStatus('Metadata saved to D1.')
    } catch (nextError) {
      setError(String(nextError?.message || nextError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside className="media-attachment-details">
      <h2>Attachment details</h2>
      <div className="media-attachment-details__preview"><MediaPreview item={selected} /></div>
      <div className="media-attachment-details__facts">
        <strong>{selected.filename || selected.title}</strong>
        <span>{mediaKindLabel(selected)}{selected.mimeType ? ` · ${selected.mimeType}` : ''}</span>
        {selected.size ? <span>{formatBytes(selected.size)}</span> : null}
        <span>{selected.source === 'imported' || selected.source === 'native' ? 'Derived asset; saving metadata registers it in D1.' : 'Persistent media record'}</span>
      </div>

      <label><span>Title</span><input value={fields.title} onChange={(event) => update('title', event.target.value)} /></label>
      <label><span>Alt text</span><input value={fields.alt} onChange={(event) => update('alt', event.target.value)} /></label>
      <label><span>Caption / link text</span><textarea value={fields.caption} onChange={(event) => update('caption', event.target.value)} /></label>
      <label><span>Description</span><textarea value={fields.description} onChange={(event) => update('description', event.target.value)} /></label>
      <label><span>Folder</span><input value={fields.folder} onChange={(event) => update('folder', event.target.value)} /></label>
      <label><span>Tags</span><input value={fields.tags} onChange={(event) => update('tags', event.target.value)} placeholder="press, protest, portrait" /></label>
      <label><span>Creator</span><input value={fields.creator} onChange={(event) => update('creator', event.target.value)} /></label>
      <label><span>Credit</span><input value={fields.credit} onChange={(event) => update('credit', event.target.value)} /></label>
      <label><span>Attribution</span><textarea value={fields.attribution} onChange={(event) => update('attribution', event.target.value)} /></label>
      <label><span>License</span><input value={fields.license} onChange={(event) => update('license', event.target.value)} /></label>
      <label><span>License URL</span><input value={fields.licenseUrl} onChange={(event) => update('licenseUrl', event.target.value)} /></label>
      <label><span>Source / landing page</span><input value={fields.sourceUrl} onChange={(event) => update('sourceUrl', event.target.value)} /></label>
      <label><span>Public URL</span><input value={selected.url} readOnly /></label>

      <div className="review-card__actions">
        <button className="button button--primary" type="button" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Metadata'}</button>
        <a className="button" href={selected.url} target="_blank" rel="noreferrer">Open File</a>
        <button className="button" type="button" disabled title="Upload a new file instead; binary replacement is not yet a supported server operation.">Replace File</button>
      </div>
      <p className="description">Replace File is intentionally disabled until binary replacement can update R2 and D1 as one server operation.</p>
      {status ? <p className="description" role="status">{status}</p> : null}
      {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
    </aside>
  )
}

export function MediaLibraryPage() {
  const [items, setItems] = useState([])
  const [legacyItems, setLegacyItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [state, setState] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const { pushNotice } = useAdminNotices()

  async function reload() {
    setState('loading')
    const loaded = await loadMediaLibraryState()
    setItems(loaded.items)
    setLegacyItems(loaded.legacyItems)
    setLoadError(loaded.error)
    setSelected((current) => current ? loaded.items.find((item) => item.url === current.url || item.id === current.id) || null : null)
    setState(loaded.error ? 'partial' : 'loaded')
  }

  useEffect(() => { reload() }, [])

  const visibleItems = useMemo(() => filterMedia(items, query, filter), [items, query, filter])

  function handleUploaded(created) {
    setItems((current) => mergeUploadedMedia(created, current))
    if (created[0]) setSelected(created[0])
    pushNotice(`${created.length} media item${created.length === 1 ? '' : 's'} uploaded and registered.`, 'success')
  }

  function handleSaved(saved) {
    setItems((current) => dedupeMedia([saved, ...current.filter((item) => item.url !== saved.url && item.id !== saved.id)]))
    setSelected(saved)
  }

  function handleLegacyRegistered(saved) {
    handleSaved(saved)
    setLegacyItems((current) => current.filter((item) => item.url !== saved.url))
    pushNotice('Legacy server asset registered in D1.', 'success')
  }

  return (
    <AdminFrame>
      <main className="page wp-admin-screen media-library-page">
        <div className="wp-screen-header">
          <div>
            <h1>Media Library</h1>
            <p className="description">Persistent site media backed by R2 binary storage and the BF_DB media registry.</p>
          </div>
          <button className="button" type="button" onClick={reload}>Reload</button>
        </div>
        <WpAdminNotices />

        <UploadPanel onUploaded={handleUploaded} />
        {loadError ? <div className="notice notice-error"><p>{loadError}</p></div> : null}
        <LegacyRecoveryNotice items={legacyItems} onRegistered={handleLegacyRegistered} />

        <section className="media-library-toolbar" aria-label="Media filters">
          <label>
            <span className="screen-reader-text">Search media</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search media" />
          </label>
          <label>
            <span className="screen-reader-text">Filter media type</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">All media</option>
              <option value="image">Images</option>
              <option value="audio">Audio</option>
              <option value="video">Video</option>
              <option value="pdf">PDFs</option>
              <option value="document">Documents</option>
            </select>
          </label>
          <span className="description">{state} · {visibleItems.length} visible</span>
        </section>

        <div className="media-library-layout">
          <section className="media-library-grid" aria-label="Media items">
            {visibleItems.length ? visibleItems.map((item) => (
              <MediaTile key={`${item.id}-${item.url}`} item={item} selected={selected?.url === item.url} onSelect={setSelected} />
            )) : (
              <div className="missing-state"><h2>No media found</h2><p>Upload a file or change the current filters.</p></div>
            )}
          </section>
          <AttachmentDetails selected={selected} onSaved={handleSaved} />
        </div>
      </main>
    </AdminFrame>
  )
}

export function MediaPickerModal({ open, onClose, onPick, title = 'Choose Media' }) {
  const [items, setItems] = useState([])
  const [legacyItems, setLegacyItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    loadMediaLibraryState().then((loaded) => {
      if (cancelled) return
      setItems(loaded.items)
      setLegacyItems(loaded.legacyItems)
      setLoadError(loaded.error)
      setSelected(null)
    })
    return () => { cancelled = true }
  }, [open])

  const visibleItems = useMemo(() => filterMedia(items, query, filter), [items, query, filter])
  if (!open) return null

  function handleUploaded(created) {
    setItems((current) => mergeUploadedMedia(created, current))
    if (created[0]) setSelected(created[0])
  }

  function handleSaved(saved) {
    setItems((current) => dedupeMedia([saved, ...current.filter((item) => item.url !== saved.url && item.id !== saved.id)]))
    setSelected(saved)
  }

  return (
    <div className="media-picker-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.()
    }}>
      <div className="media-picker-modal__panel">
        <header className="media-picker-modal__header">
          <h2>{title}</h2>
          <button className="button" type="button" onClick={onClose}>Close</button>
        </header>

        <UploadPanel compact onUploaded={handleUploaded} />
        {loadError ? <div className="notice notice-error"><p>{loadError}</p></div> : null}
        {legacyItems.length ? <p className="description">{legacyItems.length} legacy browser-only media record{legacyItems.length === 1 ? '' : 's'} are excluded from selection until migrated or re-uploaded.</p> : null}

        <div className="media-library-toolbar">
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search media" aria-label="Search media" />
          <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter media type">
            <option value="all">All media</option>
            <option value="image">Images</option>
            <option value="audio">Audio</option>
            <option value="video">Video</option>
            <option value="pdf">PDFs</option>
            <option value="document">Documents</option>
          </select>
        </div>

        <div className="media-picker-modal__body">
          <section className="media-library-grid">
            {visibleItems.map((item) => (
              <MediaTile key={`${item.id}-${item.url}`} item={item} selected={selected?.url === item.url} onSelect={setSelected} />
            ))}
          </section>
          <AttachmentDetails selected={selected} onSaved={handleSaved} />
        </div>

        <footer className="media-picker-modal__footer">
          <button className="button" type="button" onClick={onClose}>Cancel</button>
          <button className="button button--primary" type="button" disabled={!selected} onClick={() => selected && onPick?.(selected)}>
            Use Selected Media
          </button>
        </footer>
      </div>
    </div>
  )
}

function filterMedia(items, query, filter) {
  const q = String(query || '').trim().toLowerCase()
  return (items || []).filter((item) => {
    const typeMatches = filter === 'all'
      || item.mediaType === filter
      || (filter === 'image' && item.mediaType === 'svg')
      || (filter === 'document' && ['document', 'text', 'archive', 'epub', 'file'].includes(item.mediaType))
    if (!typeMatches) return false
    if (!q) return true
    return [
      item.title,
      item.filename,
      item.caption,
      item.description,
      item.creator,
      item.credit,
      item.attribution,
      item.license,
      item.folder,
      ...(item.tags || []),
    ].join(' ').toLowerCase().includes(q)
  })
}

function fieldsFromItem(item = {}) {
  return {
    title: String(item?.title || ''),
    alt: String(item?.alt || item?.altText || ''),
    caption: String(item?.caption || ''),
    description: String(item?.description || ''),
    folder: String(item?.folder || defaultFolder(item?.mediaType)),
    tags: normalizeTags(item?.tags).join(', '),
    creator: String(item?.creator || ''),
    credit: String(item?.credit || ''),
    attribution: String(item?.attribution || ''),
    license: String(item?.license || ''),
    licenseUrl: String(item?.licenseUrl || ''),
    sourceUrl: String(item?.sourceUrl || ''),
  }
}

function toPersistentAsset(item = {}) {
  return {
    id: String(item.id || `media-${Math.random().toString(36).slice(2, 10)}`),
    title: String(item.title || item.filename || 'Media'),
    url: String(item.url || ''),
    downloadUrl: String(item.downloadUrl || item.url || ''),
    altText: String(item.alt || item.altText || ''),
    caption: String(item.caption || ''),
    description: String(item.description || ''),
    credit: String(item.credit || ''),
    attribution: String(item.attribution || ''),
    creator: String(item.creator || ''),
    license: String(item.license || ''),
    licenseUrl: String(item.licenseUrl || ''),
    sourceUrl: String(item.sourceUrl || ''),
    folder: String(item.folder || defaultFolder(item.mediaType)),
    tags: normalizeTags(item.tags),
    mediaType: normalizeMediaType(item.mediaType),
    mimeType: String(item.mimeType || ''),
    filename: String(item.filename || filenameFromUrl(item.url) || ''),
    size: Number(item.size || 0) || 0,
    extension: String(item.extension || extensionFromFilename(item.filename || filenameFromUrl(item.url)) || ''),
    storageKey: String(item.storageKey || storageKeyFromUrl(item.url) || ''),
    source: ['native', 'imported'].includes(item.source) ? 'registry' : String(item.source || 'registry'),
    createdAt: String(item.createdAt || item.uploadedAt || new Date().toISOString()),
  }
}

function normalizeTags(value) {
  if (Array.isArray(value)) return [...new Set(value.map((tag) => String(tag || '').trim()).filter(Boolean))]
  return [...new Set(String(value || '').split(',').map((tag) => tag.trim()).filter(Boolean))]
}

function inferMediaType(mimeType = '', filename = '') {
  const mime = String(mimeType || '').toLowerCase()
  const ext = extensionFromFilename(filename)
  if (mime.startsWith('image/')) return mime.includes('svg') ? 'svg' : 'image'
  if (mime.startsWith('audio/') || ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'flac'].includes(ext)) return 'audio'
  if (mime.startsWith('video/') || ['mp4', 'webm'].includes(ext)) return 'video'
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mime.includes('epub') || ext === 'epub') return 'epub'
  if (mime.includes('zip') || ext === 'zip') return 'archive'
  if (mime.startsWith('text/') || ['txt', 'md', 'markdown', 'csv'].includes(ext)) return 'text'
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'document'
  return 'file'
}

function defaultFolder(mediaType) {
  if (['image', 'svg'].includes(mediaType)) return 'Images'
  if (mediaType === 'audio') return 'Audio'
  if (mediaType === 'video') return 'Video'
  if (mediaType === 'pdf') return 'Zines / PDFs'
  return 'Files'
}

function looksLikeFileUrl(url) {
  return /\.(pdf|zip|epub|docx?|odt|rtf|txt|md|markdown|csv|mp3|m4a|wav|ogg|oga|flac|mp4|webm)(?:[?#].*)?$/i.test(url)
    || String(url).includes('/api/media/files')
}

function filenameFromUrl(url = '') {
  try {
    const parsed = new URL(String(url), 'https://example.invalid')
    return parsed.searchParams.get('filename') || parsed.pathname.split('/').filter(Boolean).pop() || ''
  } catch {
    return ''
  }
}

function storageKeyFromUrl(url = '') {
  try {
    const parsed = new URL(String(url), 'https://example.invalid')
    return parsed.searchParams.get('key') || ''
  } catch {
    return ''
  }
}

function extensionFromFilename(filename = '') {
  const parts = String(filename || '').split(/[?#]/)[0].split('.')
  return parts.length > 1 ? String(parts.pop() || '').toLowerCase() : ''
}
