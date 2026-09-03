import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminFrame } from './AdminRail'
import { MediaPickerModal } from './MediaLibraryPage'
import { WpAdminNotices, useAdminNotices } from './WpAdminNotices'
import { createNativeEntryFromImportedPiece, loadNativeCollection } from '../lib/nativePublicContent'
import { getPieces } from '../lib/pieces'
import {
  createEmptyCollection,
  deleteCollectionAsync,
  findCollection,
  loadCollections,
  loadCollectionsAsync,
  normalizeCollection,
  slugifyCollection,
  upsertCollectionAsync,
} from '../lib/collections'

const ROW_FIELDS = {
  timeline: ['date', 'title', 'body'],
  downloads: ['title', 'url', 'type'],
  gallery: ['title', 'url', 'alt', 'caption'],
  updates: ['date', 'title', 'body', 'url'],
  externalLinks: ['title', 'url'],
}

function normalizeTermList(value) {
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function resolvePieceSlug(piece) {
  return String(piece?.slug || piece?.id || '').trim()
}

function formatDate(value) {
  const d = new Date(String(value || ''))
  if (!Number.isFinite(d.getTime())) return 'No date'
  return d.toLocaleDateString()
}

function makeRow(section) {
  const row = { id: `row-${Math.random().toString(36).slice(2, 10)}` }
  for (const field of ROW_FIELDS[section] || []) row[field] = ''
  return row
}

function RowEditor({ title, section, rows = [], onChange }) {
  const fields = ROW_FIELDS[section] || []
  return (
    <section className="wp-meta-box collection-editor__section">
      <div className="collection-editor__section-header">
        <h2>{title}</h2>
        <button type="button" className="button" onClick={() => onChange([...rows, makeRow(section)])}>Add</button>
      </div>
      {rows.length ? rows.map((row, index) => (
        <div className="collection-row-editor" key={row.id || index}>
          {fields.map((field) => (
            <label className="native-content-editor__field" key={field}>
              <span>{field}</span>
              {field === 'body' || field === 'caption' ? (
                <textarea value={row[field] || ''} onChange={(event) => {
                  const next = [...rows]
                  next[index] = { ...row, [field]: event.target.value }
                  onChange(next)
                }} />
              ) : (
                <input value={row[field] || ''} onChange={(event) => {
                  const next = [...rows]
                  next[index] = { ...row, [field]: event.target.value }
                  onChange(next)
                }} />
              )}
            </label>
          ))}
          <div className="collection-row-editor__actions">
            <button type="button" className="button" onClick={() => {
              if (index <= 0) return
              const next = [...rows]
              const [item] = next.splice(index, 1)
              next.splice(index - 1, 0, item)
              onChange(next)
            }}>Up</button>
            <button type="button" className="button" onClick={() => {
              const next = [...rows]
              const [item] = next.splice(index, 1)
              next.splice(index + 1, 0, item)
              onChange(next)
            }}>Down</button>
            <button type="button" className="button button-link-delete" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button>
          </div>
        </div>
      )) : <p className="description">No {title.toLowerCase()} yet.</p>}
    </section>
  )
}

export function CollectionsAdminPage() {
  const [collections, setCollections] = useState([])
  const [nativeItems, setNativeItems] = useState([])
  const [activeId, setActiveId] = useState('')
  const [draft, setDraft] = useState(createEmptyCollection())
  const [query, setQuery] = useState('')
  const [openMediaFor, setOpenMediaFor] = useState('')
  const { pushNotice } = useAdminNotices()

  useEffect(() => {
    loadCollectionsAsync({ includeDrafts: 1 }).then((loaded) => setCollections(loaded))
    loadNativeCollection({ includeFuture: 1 }).then((loaded) => setNativeItems(Array.isArray(loaded) ? loaded : []))
  }, [])

  const allPieces = useMemo(() => {
    const nativeSlugs = new Set(nativeItems.map((item) => String(item.slug || '').toLowerCase()))
    const imported = getPieces()
      .filter((piece) => !nativeSlugs.has(String(piece.slug || '').toLowerCase()))
      .map(createNativeEntryFromImportedPiece)
    return [...nativeItems, ...imported].sort((a, b) => new Date(b.publishedAt || b.updatedAt || 0) - new Date(a.publishedAt || a.updatedAt || 0))
  }, [nativeItems])

  const filteredPieces = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return allPieces
    return allPieces.filter((piece) => [
      piece.title,
      piece.slug,
      piece.excerpt,
      piece.contentType,
      piece.type,
      ...(piece.projects || []),
      ...(piece.categories || []),
      ...(piece.tags || []),
      ...(piece.collections || []),
    ].join(' ').toLowerCase().includes(q))
  }, [allPieces, query])

  function startNew() {
    const fresh = createEmptyCollection()
    setActiveId(fresh.id)
    setDraft(fresh)
  }

  function editCollection(collection) {
    const normalized = normalizeCollection(collection)
    setActiveId(normalized.id)
    setDraft(normalized)
  }

  function saveDraft() {
    const normalized = normalizeCollection({
      ...draft,
      slug: slugifyCollection(draft.slug || draft.title),
    })
    if (!normalized.title.trim() || !normalized.slug.trim()) {
      pushNotice('Collections need a title and slug.', 'error')
      return
    }
    const existingSlug = findCollection(collections, normalized.slug)
    if (existingSlug && existingSlug.id !== normalized.id) {
      pushNotice('Another collection already uses that slug.', 'error')
      return
    }
    upsertCollectionAsync(collections, normalized).then(({ items, item, mode }) => {
      setCollections(items)
      setActiveId(item.id)
      setDraft(item)
      pushNotice(`Collection saved${mode === 'local' ? ' locally' : ''}.`, 'success')
    }).catch(() => {
      pushNotice('Collection failed to save.', 'error')
    })
  }

  function removeActiveCollection() {
    if (!activeId) return
    deleteCollectionAsync(collections, activeId).then((next) => {
      setCollections(next)
      startNew()
      pushNotice('Collection deleted.', 'warning')
    }).catch(() => {
      pushNotice('Collection failed to delete.', 'error')
    })
  }

  function patchDraft(patch) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function togglePiece(piece) {
    const slug = resolvePieceSlug(piece)
    if (!slug) return
    setDraft((current) => {
      const currentSlugs = normalizeTermList(current.pieceSlugs)
      const next = currentSlugs.includes(slug)
        ? currentSlugs.filter((item) => item !== slug)
        : [...currentSlugs, slug]
      return { ...current, pieceSlugs: next }
    })
  }

  function toggleFeaturedPiece(piece) {
    const slug = resolvePieceSlug(piece)
    if (!slug) return
    setDraft((current) => {
      const currentSlugs = normalizeTermList(current.featuredPieceSlugs)
      const next = currentSlugs.includes(slug)
        ? currentSlugs.filter((item) => item !== slug)
        : [...currentSlugs, slug]
      return { ...current, featuredPieceSlugs: next }
    })
  }

  function movePiece(slug, direction) {
    setDraft((current) => {
      const pieceSlugs = normalizeTermList(current.pieceSlugs)
      const index = pieceSlugs.indexOf(slug)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= pieceSlugs.length) return current
      const next = [...pieceSlugs]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return { ...current, pieceSlugs: next }
    })
  }

  const assignedPieces = allPieces.filter((piece) => normalizeTermList(draft.pieceSlugs).includes(resolvePieceSlug(piece)))

  return (
    <AdminFrame>
      <main className="page wp-admin-screen collections-admin-page">
        <div className="wp-screen-header">
          <div>
            <h1>Collections</h1>
            <p className="description">Collections organize posts, downloads, media, timelines, and related work without replacing posts.</p>
          </div>
          <button type="button" className="button button--primary" onClick={startNew}>Add Collection</button>
        </div>
        <WpAdminNotices />

        <div className="collection-admin-layout">
          <aside className="wp-meta-box collection-admin-list">
            <h2>All Collections</h2>
            {collections.length ? collections.map((collection) => (
              <button
                type="button"
                className={`collection-admin-list__item${collection.id === activeId ? ' is-active' : ''}`}
                key={collection.id}
                onClick={() => editCollection(collection)}
              >
                <strong>{collection.title || 'Untitled'}</strong>
                <span>{collection.status} / {collection.pieceSlugs.length} pieces</span>
              </button>
            )) : <p className="description">No collections yet.</p>}
          </aside>

          <section className="collection-editor">
            <section className="wp-meta-box">
              <h2>Collection Details</h2>
              <label className="native-content-editor__field">
                <span>Title</span>
                <input value={draft.title || ''} onChange={(event) => patchDraft({
                  title: event.target.value,
                  slug: draft.slug ? draft.slug : slugifyCollection(event.target.value),
                })} />
              </label>
              <label className="native-content-editor__field">
                <span>Slug</span>
                <input value={draft.slug || ''} onChange={(event) => patchDraft({ slug: slugifyCollection(event.target.value) })} />
              </label>
              <label className="native-content-editor__field">
                <span>Status</span>
                <select value={draft.status || 'published'} onChange={(event) => patchDraft({ status: event.target.value })}>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="native-content-editor__field">
                <span>Subtitle</span>
                <input value={draft.subtitle || ''} onChange={(event) => patchDraft({ subtitle: event.target.value })} />
              </label>
              <label className="native-content-editor__field">
                <span>Overview</span>
                <textarea value={draft.overview || ''} onChange={(event) => patchDraft({ overview: event.target.value })} />
              </label>
              <label className="native-content-editor__field">
                <span>Featured quote</span>
                <textarea value={draft.featuredQuote || ''} onChange={(event) => patchDraft({ featuredQuote: event.target.value })} />
              </label>
              <label className="native-content-editor__field">
                <span>Cover image URL</span>
                <input value={draft.coverImage || ''} onChange={(event) => patchDraft({ coverImage: event.target.value })} />
              </label>
              {draft.coverImage ? <img className="collection-editor__cover-preview" src={draft.coverImage} alt="" /> : null}
              <button type="button" className="button" onClick={() => setOpenMediaFor('cover')}>Choose Cover</button>
              <label className="native-content-editor__field">
                <span>Cover alt text</span>
                <input value={draft.coverAlt || ''} onChange={(event) => patchDraft({ coverAlt: event.target.value })} />
              </label>
            </section>

            <section className="wp-meta-box">
              <div className="collection-editor__section-header">
                <h2>Assigned Pieces</h2>
                {draft.slug ? <Link className="button" to={`/collections/${draft.slug}`}>View Collection</Link> : null}
              </div>
              <input className="collection-piece-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pieces" />
              <div className="collection-piece-assignment">
                <div>
                  <h3>Available</h3>
                  {filteredPieces.slice(0, 80).map((piece) => {
                    const slug = resolvePieceSlug(piece)
                    const checked = normalizeTermList(draft.pieceSlugs).includes(slug)
                    return (
                      <label className="native-content-editor__check" key={piece.id || slug}>
                        <input type="checkbox" checked={checked} onChange={() => togglePiece(piece)} />
                        <span>{piece.title || slug} <small>{piece.contentType || piece.type} / {formatDate(piece.publishedAt || piece.updatedAt)}</small></span>
                      </label>
                    )
                  })}
                </div>
                <div>
                  <h3>Order</h3>
                  {assignedPieces.length ? assignedPieces.map((piece) => {
                    const slug = resolvePieceSlug(piece)
                    const featured = normalizeTermList(draft.featuredPieceSlugs).includes(slug)
                    return (
                      <div className="collection-assigned-piece" key={slug}>
                        <strong>{piece.title || slug}</strong>
                        <div>
                          <button type="button" className="button" onClick={() => movePiece(slug, -1)}>Up</button>
                          <button type="button" className="button" onClick={() => movePiece(slug, 1)}>Down</button>
                          <button type="button" className={`button${featured ? ' button--primary' : ''}`} onClick={() => toggleFeaturedPiece(piece)}>Feature</button>
                        </div>
                      </div>
                    )
                  }) : <p className="description">Assign pieces to set collection order.</p>}
                </div>
              </div>
            </section>

            <label className="native-content-editor__field wp-meta-box">
              <span>Related collections</span>
              <input value={(draft.relatedCollections || []).join(', ')} onChange={(event) => patchDraft({ relatedCollections: normalizeTermList(event.target.value) })} placeholder="collection-slug, another-collection" />
            </label>
            <label className="native-content-editor__field wp-meta-box">
              <span>Related piece slugs</span>
              <input value={(draft.relatedPieces || []).join(', ')} onChange={(event) => patchDraft({ relatedPieces: normalizeTermList(event.target.value) })} placeholder="post-slug, another-post" />
            </label>

            <RowEditor title="Timeline" section="timeline" rows={draft.timeline || []} onChange={(rows) => patchDraft({ timeline: rows })} />
            <RowEditor title="Downloads" section="downloads" rows={draft.downloads || []} onChange={(rows) => patchDraft({ downloads: rows })} />
            <RowEditor title="Gallery" section="gallery" rows={draft.gallery || []} onChange={(rows) => patchDraft({ gallery: rows })} />
            <RowEditor title="Updates" section="updates" rows={draft.updates || []} onChange={(rows) => patchDraft({ updates: rows })} />
            <RowEditor title="External Links" section="externalLinks" rows={draft.externalLinks || []} onChange={(rows) => patchDraft({ externalLinks: rows })} />

            <section className="wp-meta-box collection-editor__actions">
              <button type="button" className="button button--primary" onClick={saveDraft}>Save Collection</button>
              <button type="button" className="button" onClick={() => loadCollectionsAsync({ includeDrafts: 1 }).then(setCollections)}>Reload Saved</button>
              {collections.some((collection) => collection.id === activeId) ? (
                <button type="button" className="button button-link-delete" onClick={removeActiveCollection}>Delete Collection</button>
              ) : null}
            </section>
          </section>
        </div>

        <MediaPickerModal
          open={Boolean(openMediaFor)}
          onClose={() => setOpenMediaFor('')}
          onPick={(item) => {
            const url = item?.url || item?.dataUrl || ''
            if (openMediaFor === 'cover') patchDraft({ coverImage: url, coverAlt: item?.alt || draft.coverAlt || '' })
            setOpenMediaFor('')
          }}
        />
      </main>
    </AdminFrame>
  )
}
