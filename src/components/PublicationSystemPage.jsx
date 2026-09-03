import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminFrame } from './AdminRail'
import { MediaPickerModal } from './MediaLibraryPage'
import { WpAdminNotices, useAdminNotices } from './WpAdminNotices'
import { createNativeEntryFromImportedPiece, loadNativeCollection } from '../lib/nativePublicContent'
import { getPieces } from '../lib/pieces'
import {
  PUBLICATION_TYPES, PUBLICATION_VISIBILITY, createPublication, generatePublicationFromPieces,
  loadPublicationsAsync, savePublicationAsync, slugifyPublication,
} from '../lib/publications'
import { adminRoutes } from '../routing/routes'

function resolveSlug(piece) { return String(piece?.slug || piece?.id || '').trim() }
function normalizeList(value) { if (Array.isArray(value)) return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]; return String(value || '').split(',').map((item) => item.trim()).filter(Boolean) }
function formatDate(value) { const d = new Date(String(value || '')); return Number.isFinite(d.getTime()) ? d.toLocaleDateString() : 'No date' }
function makeDownload() { return { id: `download-${Math.random().toString(36).slice(2, 10)}`, title: '', url: '', type: 'PDF', visibility: 'public' } }

export function PublicationSystemPage() {
  const [publications, setPublications] = useState([])
  const [nativeItems, setNativeItems] = useState([])
  const [activeId, setActiveId] = useState('')
  const [draft, setDraft] = useState(() => createPublication({ title: 'Untitled Publication' }))
  const [query, setQuery] = useState('')
  const [openMedia, setOpenMedia] = useState(false)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const { pushNotice } = useAdminNotices()

  async function reload() {
    try {
      setState('loading')
      setError('')
      const [loadedPublications, loadedNative] = await Promise.all([
        loadPublicationsAsync({ includeDrafts: 1 }),
        loadNativeCollection({ includeFuture: 1 }),
      ])
      setPublications(loadedPublications)
      setNativeItems(Array.isArray(loadedNative) ? loadedNative : [])
      if (loadedPublications[0] && !activeId) {
        setActiveId(loadedPublications[0].id)
        setDraft(loadedPublications[0])
      }
      setState('loaded')
    } catch (err) {
      setState('error')
      setError(String(err?.message || err))
    }
  }

  useEffect(() => { reload() }, [])

  const allPieces = useMemo(() => {
    const nativeSlugs = new Set(nativeItems.map((item) => String(item.slug || '').toLowerCase()))
    const imported = getPieces().filter((piece) => !nativeSlugs.has(String(piece.slug || '').toLowerCase())).map(createNativeEntryFromImportedPiece)
    return [...nativeItems, ...imported].sort((a, b) => new Date(b.publishedAt || b.updatedAt || 0) - new Date(a.publishedAt || a.updatedAt || 0))
  }, [nativeItems])

  const filteredPieces = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return allPieces
    return allPieces.filter((piece) => [piece.title, piece.slug, piece.excerpt, piece.contentType, ...(piece.projects || []), ...(piece.collections || []), ...(piece.tags || [])].join(' ').toLowerCase().includes(q))
  }, [allPieces, query])

  const selectedPieces = useMemo(() => {
    const wanted = new Set(draft.pieceSlugs || [])
    return allPieces.filter((piece) => wanted.has(resolveSlug(piece)))
  }, [allPieces, draft.pieceSlugs])

  function patchDraft(patch) { setDraft((current) => ({ ...current, ...patch })) }
  function startNew() { const fresh = createPublication({ title: 'Untitled Publication' }); setActiveId(fresh.id); setDraft(fresh); setError('') }
  function editPublication(publication) { setActiveId(publication.id); setDraft(publication); setError('') }

  async function saveDraft(nextDraft = draft, notice = 'Publication saved.') {
    try {
      setState('saving')
      setError('')
      const normalized = {
        ...nextDraft,
        slug: slugifyPublication(nextDraft.slug || nextDraft.title),
        status: nextDraft.visibility === 'public' ? 'published' : nextDraft.visibility === 'archived' ? 'archived' : 'draft',
        printlabProjectUrl: nextDraft.printlabProjectUrl || `${adminRoutes.printlab}?publication=${encodeURIComponent(nextDraft.id)}`,
      }
      const saved = await savePublicationAsync(normalized)
      const loaded = await loadPublicationsAsync({ includeDrafts: 1 })
      setPublications(loaded)
      setActiveId(saved.id)
      setDraft(saved)
      setState('loaded')
      pushNotice(notice, 'success')
      return saved
    } catch (err) {
      const message = String(err?.message || err)
      setState('error')
      setError(message)
      pushNotice(`Publication save failed: ${message}`, 'error')
      throw err
    }
  }

  async function generatePublication() {
    const generated = generatePublicationFromPieces({ ...draft, printlabProjectUrl: `${adminRoutes.printlab}?publication=${encodeURIComponent(draft.id)}` }, allPieces)
    try { await saveDraft(generated, 'Publication generated.') } catch { /* visible error already set */ }
  }

  function togglePiece(piece) {
    const slug = resolveSlug(piece)
    if (!slug) return
    setDraft((current) => {
      const slugs = normalizeList(current.pieceSlugs)
      return { ...current, pieceSlugs: slugs.includes(slug) ? slugs.filter((item) => item !== slug) : [...slugs, slug] }
    })
  }

  function movePiece(slug, direction) {
    setDraft((current) => {
      const slugs = normalizeList(current.pieceSlugs)
      const index = slugs.indexOf(slug)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= slugs.length) return current
      const next = [...slugs]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return { ...current, pieceSlugs: next }
    })
  }

  const disabled = state === 'loading' || state === 'saving'

  return (
    <AdminFrame>
      <main className="page wp-admin-screen publication-system-page">
        <div className="wp-screen-header">
          <div><h1>Publications</h1><p className="description">Build books, magazines, zines, readers, pamphlets, poster packs, campaign kits, and booklets above Printlab.</p></div>
          <button className="button button--primary" type="button" onClick={startNew} disabled={disabled}>Create Publication</button>
        </div>
        <WpAdminNotices />
        {state === 'loading' ? <div className="notice notice-info" role="status"><p>Loading publications…</p></div> : null}
        {error ? <div className="notice notice-error" role="alert"><p><strong>Publication error:</strong> {error}</p></div> : null}

        <div className="publication-builder-layout">
          <aside className="wp-meta-box publication-builder-list">
            <h2>Issues</h2>
            {publications.length ? publications.map((publication) => (
              <button type="button" className={`publication-builder-list__item${publication.id === activeId ? ' is-active' : ''}`} key={publication.id} onClick={() => editPublication(publication)}>
                <strong>{publication.title}</strong><span>{publication.publicationType} / {publication.visibility} / {publication.pages.length} pages</span>
              </button>
            )) : <p className="description">{state === 'loaded' ? 'No publications yet.' : 'No publication data loaded.'}</p>}
          </aside>

          <section className="publication-builder">
            <section className="wp-meta-box"><div className="publication-builder__workflow" aria-label="Publication workflow"><span>Create Publication</span><span>Select pieces</span><span>Select cover</span><span>Arrange order</span><span>Generate publication</span></div></section>

            <section className="wp-meta-box publication-builder__grid">
              <div>
                <h2>Publication Details</h2>
                <label className="native-content-editor__field"><span>Title</span><input value={draft.title || ''} onChange={(event) => patchDraft({ title: event.target.value, slug: draft.slug ? draft.slug : slugifyPublication(event.target.value) })} /></label>
                <label className="native-content-editor__field"><span>Slug</span><input value={draft.slug || ''} onChange={(event) => patchDraft({ slug: slugifyPublication(event.target.value) })} /></label>
                <label className="native-content-editor__field"><span>Type</span><select value={draft.publicationType || 'Zine'} onChange={(event) => patchDraft({ publicationType: event.target.value, type: event.target.value })}>{PUBLICATION_TYPES.map((type) => <option value={type} key={type}>{type}</option>)}</select></label>
                <label className="native-content-editor__field"><span>Visibility</span><select value={draft.visibility || 'draft'} onChange={(event) => patchDraft({ visibility: event.target.value })}>{PUBLICATION_VISIBILITY.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
                <label className="native-content-editor__field"><span>Issue number</span><input value={draft.issueNumber || ''} onChange={(event) => patchDraft({ issueNumber: event.target.value })} /></label>
                <label className="native-content-editor__field"><span>Edition</span><input value={draft.edition || ''} onChange={(event) => patchDraft({ edition: event.target.value })} /></label>
                <label className="native-content-editor__field"><span>Description</span><textarea value={draft.description || ''} onChange={(event) => patchDraft({ description: event.target.value })} /></label>
              </div>
              <div>
                <h2>Cover and Matter</h2>
                {draft.coverImage ? <img className="publication-builder__cover" src={draft.coverImage} alt={draft.coverAlt || ''} /> : null}
                <label className="native-content-editor__field"><span>Cover image</span><input value={draft.coverImage || ''} onChange={(event) => patchDraft({ coverImage: event.target.value })} /></label>
                <button className="button" type="button" onClick={() => setOpenMedia(true)}>Choose Cover</button>
                <label className="native-content-editor__field"><span>Front matter</span><textarea value={draft.frontMatter || ''} onChange={(event) => patchDraft({ frontMatter: event.target.value })} /></label>
                <label className="native-content-editor__field"><span>Credits</span><textarea value={draft.credits || ''} onChange={(event) => patchDraft({ credits: event.target.value })} /></label>
                <label className="native-content-editor__field"><span>Colophon</span><textarea value={draft.colophon || ''} onChange={(event) => patchDraft({ colophon: event.target.value })} /></label>
                <label className="native-content-editor__field"><span>Back cover</span><textarea value={draft.backCover || ''} onChange={(event) => patchDraft({ backCover: event.target.value })} /></label>
              </div>
            </section>

            <section className="wp-meta-box">
              <h2>Select Pieces</h2>
              <input className="publication-builder__search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pieces" />
              <div className="publication-piece-picker">
                <div><h3>Archive</h3>{filteredPieces.slice(0, 100).map((piece) => { const slug = resolveSlug(piece); const checked = normalizeList(draft.pieceSlugs).includes(slug); return <label className="native-content-editor__check" key={piece.id || slug}><input type="checkbox" checked={checked} onChange={() => togglePiece(piece)} /><span>{piece.title || slug} <small>{piece.contentType || piece.type} / {formatDate(piece.publishedAt || piece.updatedAt)}</small></span></label> })}</div>
                <div><h3>Publication Order</h3>{selectedPieces.length ? selectedPieces.map((piece) => { const slug = resolveSlug(piece); return <div className="publication-selected-piece" key={slug}><strong>{piece.title || slug}</strong><span>{piece.contentType || piece.type}</span><div><button className="button" type="button" onClick={() => movePiece(slug, -1)}>Up</button><button className="button" type="button" onClick={() => movePiece(slug, 1)}>Down</button></div></div> }) : <p className="description">Select pieces to arrange the publication.</p>}</div>
              </div>
            </section>

            <section className="wp-meta-box">
              <div className="publication-builder__section-header"><h2>Downloads and Editions</h2><button className="button" type="button" onClick={() => patchDraft({ downloadAssets: [...(draft.downloadAssets || []), makeDownload()] })}>Add Download</button></div>
              {(draft.downloadAssets || []).map((asset, index) => (
                <div className="publication-download-editor" key={asset.id || index}>
                  <input value={asset.title || ''} onChange={(event) => { const next = [...(draft.downloadAssets || [])]; next[index] = { ...asset, title: event.target.value }; patchDraft({ downloadAssets: next }) }} placeholder="Title" />
                  <input value={asset.url || ''} onChange={(event) => { const next = [...(draft.downloadAssets || [])]; next[index] = { ...asset, url: event.target.value }; patchDraft({ downloadAssets: next }) }} placeholder="URL" />
                  <input value={asset.type || ''} onChange={(event) => { const next = [...(draft.downloadAssets || [])]; next[index] = { ...asset, type: event.target.value }; patchDraft({ downloadAssets: next }) }} placeholder="Type" />
                  <button className="button button-link-delete" type="button" onClick={() => patchDraft({ downloadAssets: (draft.downloadAssets || []).filter((_, i) => i !== index) })}>Remove</button>
                </div>
              ))}
              <label className="native-content-editor__field"><span>Printlab project URL</span><input value={draft.printlabProjectUrl || ''} onChange={(event) => patchDraft({ printlabProjectUrl: event.target.value })} /></label>
            </section>

            <section className="wp-meta-box publication-builder__actions">
              <button className="button" type="button" disabled={disabled} onClick={() => saveDraft().catch(() => {})}>Save</button>
              <button className="button button--primary" type="button" disabled={disabled} onClick={generatePublication}>Generate Publication</button>
              <Link className="button" to={`${adminRoutes.printlab}?publication=${encodeURIComponent(draft.id)}`}>Open in Printlab</Link>
              {draft.slug ? <Link className="button" to={`/publications/${draft.slug}`}>Download Page</Link> : null}
              {draft.slug ? <Link className="button" to={`/reader/${draft.slug}`}>Reader Edition</Link> : null}
            </section>

            <section className="wp-meta-box"><h2>Version History</h2>{(draft.versions || []).length ? draft.versions.map((version) => <article className="publication-version" key={version.id}><strong>{version.label}</strong><span>{version.summary}</span><small>{version.pageCount} pages</small></article>) : <p className="description">Generate the publication to create the first version.</p>}</section>
          </section>
        </div>

        <MediaPickerModal open={openMedia} onClose={() => setOpenMedia(false)} onPick={(item) => { patchDraft({ coverImage: item?.url || item?.dataUrl || '', coverAlt: item?.alt || draft.coverAlt || '' }); setOpenMedia(false) }} />
      </main>
    </AdminFrame>
  )
}
