import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicationFooter } from './PublicationFooter'
import { PublicationTopbar } from './PublicationTopbar'
import { EditableText } from './EditableText'
import { EditableLink } from './EditableLink'
import './GalleryArchivePage.css'

const GALLERY_SLUG = 'aberdeen-local-1312'

export function GalleryArchivePage() {
  const [gallery, setGallery] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [activeIndex, setActiveIndex] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        setState('loading')
        setError('')
        const response = await fetch(`/api/galleries/${GALLERY_SLUG}`, { headers: { accept: 'application/json' } })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.ok || !payload?.gallery) {
          throw new Error(payload?.error || `Gallery request failed with status ${response.status}`)
        }
        if (cancelled) return
        setGallery(payload.gallery)
        setState('loaded')
      } catch (nextError) {
        if (cancelled) return
        setGallery(null)
        setError(String(nextError?.message || nextError))
        setState('error')
      }
    }
    boot()
    return () => { cancelled = true }
  }, [])

  const items = useMemo(() => (gallery?.items || []).filter((item) => item?.url), [gallery])
  const activeItem = activeIndex === null ? null : items[activeIndex] || null

  useEffect(() => {
    if (!activeItem) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') setActiveIndex(null)
      if (event.key === 'ArrowLeft') setActiveIndex((index) => (Number(index) - 1 + items.length) % items.length)
      if (event.key === 'ArrowRight') setActiveIndex((index) => (Number(index) + 1) % items.length)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [activeItem, items.length])

  return (
    <main className="page public-search-page archive-page publication-gallery-page">
      <PublicationTopbar />

      <section className="project-hero archive-page__hero publication-gallery-hero">
        <EditableText as="p" className="project-hero__eyebrow" field="gallery.aberdeen-local-1312.hero.eyebrow">archive / photography / Aberdeen Local 1312</EditableText>
        <EditableText as="h1" field="gallery.aberdeen-local-1312.hero.title">{gallery?.title || 'Aberdeen Local 1312 Gallery'}</EditableText>
        <EditableText as="p" className="project-hero__description" field="gallery.aberdeen-local-1312.hero.description" multiline>
          {gallery?.description || 'Historical image archive from Aberdeen Local 1312, preserved from the original SabotPress Noblogs site.'}
        </EditableText>
        <div className="project-hero__meta publication-gallery-hero__meta">
          <span>{items.length} image{items.length === 1 ? '' : 's'}</span>
          {gallery?.expectedItemCount ? <span>{gallery.complete ? 'migration complete' : `${gallery.expectedItemCount - items.length} still migrating`}</span> : null}
          <EditableLink labelField="gallery.aberdeen-local-1312.actions.archive.label" hrefField="gallery.aberdeen-local-1312.actions.archive.href" defaultLabel="Browse full archive" defaultHref="/archive" />
        </div>
      </section>

      {state === 'loading' ? (
        <section className="archive-results publication-gallery-state"><EditableText as="h2" field="gallery.state.loading.title">Loading gallery</EditableText><EditableText as="p" field="gallery.state.loading.body">Reading the preserved gallery from SabotPress storage.</EditableText></section>
      ) : null}

      {state === 'error' ? (
        <section className="archive-results publication-gallery-state"><EditableText as="h2" field="gallery.state.error.title">Gallery unavailable</EditableText><p>{error}</p><Link to="/archive">Return to archive</Link></section>
      ) : null}

      {state === 'loaded' && !items.length ? (
        <section className="archive-results publication-gallery-state"><EditableText as="h2" field="gallery.state.empty.title">No images available yet</EditableText><EditableText as="p" field="gallery.state.empty.body">The gallery record exists, but its media migration has not finished.</EditableText></section>
      ) : null}

      {items.length ? (
        <section className="archive-results publication-gallery-results" aria-label={gallery?.title || 'Aberdeen Local 1312 Gallery'}>
          <div className="archive-results__header publication-gallery-results__header">
            <div>
              <div className="archive-results__eyebrow">photography archive</div>
              <div className="archive-results__summary">Select any image to open the full-size viewer.</div>
            </div>
          </div>
          <div className="publication-gallery-grid">
            {items.map((item, index) => (
              <figure className="publication-gallery-card" key={`${item.mediaId || item.sourceAttachmentId || index}-${index}`}>
                <button
                  className="publication-gallery-card__button"
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-label={`Open ${item.altText || item.title || `image ${index + 1}`}`}
                >
                  <img loading="lazy" src={item.url} alt={item.altText || item.title || ''} />
                </button>
                {item.caption ? <figcaption>{item.caption}</figcaption> : null}
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {activeItem ? (
        <div className="publication-gallery-lightbox" role="dialog" aria-modal="true" aria-label={activeItem.altText || activeItem.title || 'Gallery image'} onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveIndex(null) }}>
          <button className="publication-gallery-lightbox__close" type="button" onClick={() => setActiveIndex(null)} aria-label="Close image">×</button>
          <button className="publication-gallery-lightbox__prev" type="button" onClick={() => setActiveIndex((activeIndex - 1 + items.length) % items.length)} aria-label="Previous image">‹</button>
          <figure>
            <img src={activeItem.url} alt={activeItem.altText || activeItem.title || ''} />
            <figcaption>{activeItem.caption || activeItem.altText || activeItem.title || `${activeIndex + 1} of ${items.length}`}</figcaption>
          </figure>
          <button className="publication-gallery-lightbox__next" type="button" onClick={() => setActiveIndex((activeIndex + 1) % items.length)} aria-label="Next image">›</button>
        </div>
      ) : null}

      <PublicationFooter />
    </main>
  )
}
