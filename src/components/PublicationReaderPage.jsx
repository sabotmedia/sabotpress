import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { PAGE_SIZES, loadPublicationsAsync } from '../lib/publications'
import { PublicationTopbar } from './PublicationTopbar'
import { PublicationFooter } from './PublicationFooter'
import { EditableText } from './EditableText'
import { EditableLink } from './EditableLink'
import '../publicationReader.css'

function RenderPage({ page, zoom = 1 }) {
  const size = PAGE_SIZES[page.orientation] || PAGE_SIZES.portrait
  return (
    <article className={`reader-page reader-page--${page.orientation}`} style={{ '--page-width': `${size.width}px`, '--page-height': `${size.height}px`, '--reader-zoom': zoom }}>
      {(page.blocks || []).map((block) => (
        <div className="reader-block reader-block--text" key={block.id} style={{ left: `${block.x}px`, top: `${block.y}px`, width: `${block.width}px`, minHeight: `${block.height}px`, fontSize: `${block.fontSize || 24}px` }}>
          {block.text}
        </div>
      ))}
    </article>
  )
}

function useSwipe(onPrevious, onNext) {
  const [startX, setStartX] = useState(null)
  return {
    onTouchStart: (event) => setStartX(event.touches?.[0]?.clientX ?? null),
    onTouchEnd: (event) => {
      if (startX == null) return
      const endX = event.changedTouches?.[0]?.clientX ?? startX
      const delta = endX - startX
      if (Math.abs(delta) > 42) delta > 0 ? onPrevious() : onNext()
      setStartX(null)
    },
  }
}

function usePublications() {
  const [publications, setPublications] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    loadPublicationsAsync()
      .then((loaded) => {
        if (!cancelled) {
          setPublications(loaded)
          setState('loaded')
          setError('')
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState('error')
          setError(String(err?.message || err))
        }
      })
    return () => { cancelled = true }
  }, [])
  return { publications, state, error }
}

function PublicPublicationStatus({ state, error }) {
  if (state === 'loading') return <section className="missing-state" role="status"><EditableText as="h2" field="publications.state.loading.title">Loading publication</EditableText><EditableText as="p" field="publications.state.loading.body">Reading the publication registry…</EditableText></section>
  if (state === 'error') return <section className="missing-state" role="alert"><EditableText as="h2" field="publications.state.error.title">Publication unavailable</EditableText><p>{error || 'The publication registry could not be loaded.'}</p></section>
  return null
}

export function PublicationReaderPage() {
  const { slug = '' } = useParams()
  const { publications, state, error } = usePublications()
  const publication = useMemo(() => publications.find((item) => item.id === slug || item.slug === slug) || null, [publications, slug])
  const [pageIndex, setPageIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [showThumbnails, setShowThumbnails] = useState(true)
  const [bookmarks, setBookmarks] = useState(() => loadBookmarks(slug))

  const pages = publication?.pages || []
  const currentPage = pages[pageIndex] || pages[0]
  const goPrevious = () => setPageIndex((index) => Math.max(0, index - 1))
  const goNext = () => setPageIndex((index) => Math.min(pages.length - 1, index + 1))
  const swipeHandlers = useSwipe(goPrevious, goNext)

  useEffect(() => {
    setBookmarks(loadBookmarks(slug))
    setPageIndex(0)
  }, [slug])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'ArrowLeft') goPrevious()
      if (event.key === 'ArrowRight') goNext()
      if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(2))))
      if (event.key === '-') setZoom((value) => Math.max(0.6, Number((value - 0.1).toFixed(2))))
      if (event.key.toLowerCase() === 'f') document.documentElement.requestFullscreen?.()
      if (event.key.toLowerCase() === 'b') toggleBookmark()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pages.length, pageIndex])

  if (state !== 'loaded') return <main className="page publication-reader"><PublicPublicationStatus state={state} error={error} /></main>
  if (!publication) return <Navigate to="/publications" replace />

  function toggleBookmark() {
    setBookmarks((current) => {
      const next = current.includes(pageIndex) ? current.filter((item) => item !== pageIndex) : [...current, pageIndex].sort((a, b) => a - b)
      saveBookmarks(slug, next)
      return next
    })
  }

  return (
    <main className="publication-reader" {...swipeHandlers}>
      <header className="publication-reader__bar">
        <Link to={`/publications/${publication.slug}`}>{publication.title}</Link>
        <div className="publication-reader__controls">
          <button type="button" onClick={() => setShowThumbnails((value) => !value)}><EditableText as="span" field="publications.reader.controls.thumbnails">Thumbnails</EditableText></button>
          <button type="button" onClick={toggleBookmark}><EditableText as="span" field={bookmarks.includes(pageIndex) ? 'publications.reader.controls.bookmarked' : 'publications.reader.controls.bookmark'}>{bookmarks.includes(pageIndex) ? 'Bookmarked' : 'Bookmark'}</EditableText></button>
          <button type="button" onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.1).toFixed(2))))} aria-label="Zoom out">-</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(2))))} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => document.documentElement.requestFullscreen?.()}><EditableText as="span" field="publications.reader.controls.fullscreen">Fullscreen</EditableText></button>
        </div>
      </header>
      <section className="publication-reader__body">
        {showThumbnails ? (
          <aside className="publication-reader__thumbs" aria-label="Page thumbnails">
            {pages.map((page, index) => (
              <button key={page.id} className={index === pageIndex ? 'is-active' : ''} type="button" onClick={() => setPageIndex(index)}>
                <span>{index + 1}</span><strong>{page.title}</strong>{bookmarks.includes(index) ? <em>Bookmark</em> : null}
              </button>
            ))}
          </aside>
        ) : null}
        <div className="publication-reader__stage">
          <button type="button" className="publication-reader__nav publication-reader__nav--prev" onClick={goPrevious} disabled={pageIndex === 0}><EditableText as="span" field="publications.reader.controls.previous">Prev</EditableText></button>
          {currentPage ? <RenderPage page={currentPage} zoom={zoom} /> : null}
          <button type="button" className="publication-reader__nav publication-reader__nav--next" onClick={goNext} disabled={pageIndex >= pages.length - 1}><EditableText as="span" field="publications.reader.controls.next">Next</EditableText></button>
        </div>
      </section>
      <footer className="publication-reader__footer"><span>Page {pageIndex + 1} of {pages.length}</span></footer>
    </main>
  )
}

export function PublicationsIndexPage() {
  const { publications, state, error } = usePublications()
  if (state !== 'loaded') {
    return <main className="page publications-index-page"><PublicationTopbar /><PublicPublicationStatus state={state} error={error} /><PublicationFooter /></main>
  }
  const visible = publications.filter((publication) => ['public', 'unlisted'].includes(publication.visibility) || publication.status === 'published')
  return (
    <main className="page publications-index-page">
      <PublicationTopbar />
      <section className="project-hero"><EditableText as="div" className="project-hero__eyebrow" field="publications.index.eyebrow">Publications</EditableText><EditableText as="h1" field="publications.index.title">Publications</EditableText><EditableText as="p" className="project-hero__description" field="publications.index.description" multiline>Books, magazines, zines, readers, pamphlets, poster packs, campaign kits, and booklets.</EditableText></section>
      {visible.length ? (
        <section className="piece-grid">
          {visible.map((publication) => (
            <article className="piece-card" key={publication.id}>
              <div className="piece-card__meta"><span>{publication.publicationType}</span><span>{publication.pages.length} pages</span><span>{publication.issueNumber ? `Issue ${publication.issueNumber}` : publication.visibility}</span></div>
              <h3><Link to={`/publications/${publication.slug}`}>{publication.title}</Link></h3>
              <p>{publication.description || publication.pages.map((page) => page.title).slice(0, 4).join(', ')}</p>
            </article>
          ))}
        </section>
      ) : <section className="missing-state"><EditableText as="h2" field="publications.index.empty.title">No publications</EditableText><EditableText as="p" field="publications.index.empty.body">No public publications have been prepared yet.</EditableText></section>}
      <PublicationFooter />
    </main>
  )
}

export function PublicationLandingPage() {
  const { slug = '' } = useParams()
  const { publications, state, error } = usePublications()
  const publication = publications.find((item) => item.id === slug || item.slug === slug) || null
  if (state !== 'loaded') return <main className="page publication-landing-page"><PublicationTopbar /><PublicPublicationStatus state={state} error={error} /><PublicationFooter /></main>
  if (!publication) return <Navigate to="/publications" replace />

  const readerPdf = publication.assets?.readerPdf || publication.digitalEditions?.[0]?.readerPdf || ''
  const printPdf = publication.assets?.printPdf || publication.printEditions?.[0]?.printPdf || ''
  const imposedPdf = publication.assets?.imposedPdf || publication.printEditions?.[0]?.imposedPdf || ''
  return (
    <main className="page publication-landing-page">
      <PublicationTopbar />
      <section className="project-hero">
        <div className="project-hero__eyebrow">{publication.publicationType || 'Publication'}{publication.issueNumber ? ` / Issue ${publication.issueNumber}` : ''}</div>
        <EditableText as="h1" field={`publications.${publication.slug}.hero.title`}>{publication.title}</EditableText>
        <EditableText as="p" className="project-hero__description" field={`publications.${publication.slug}.hero.description`} multiline>{publication.description || publication.subtitle || `${publication.pages.length} managed pages with reader and print editions.`}</EditableText>
        <div className="publication-actions">
          {publication.pages.length ? <EditableLink className="button button--primary" labelField={`publications.${publication.slug}.actions.read.label`} hrefField={`publications.${publication.slug}.actions.read.href`} defaultLabel="Read Online" defaultHref={`/reader/${publication.slug}`} /> : null}
          {publication.printlabProjectUrl ? <EditableLink className="button" labelField={`publications.${publication.slug}.actions.printlab.label`} hrefField={`publications.${publication.slug}.actions.printlab.href`} defaultLabel="Open Printlab Project" defaultHref={publication.printlabProjectUrl} /> : null}
          {printPdf ? <EditableLink className="button" labelField={`publications.${publication.slug}.actions.print.label`} hrefField={`publications.${publication.slug}.actions.print.href`} defaultLabel="Download Print Edition" defaultHref={printPdf} /> : null}
          {imposedPdf ? <EditableLink className="button" labelField={`publications.${publication.slug}.actions.imposed.label`} hrefField={`publications.${publication.slug}.actions.imposed.href`} defaultLabel="Download Imposed Booklet" defaultHref={imposedPdf} /> : null}
          {readerPdf ? <EditableLink className="button" labelField={`publications.${publication.slug}.actions.pdf.label`} hrefField={`publications.${publication.slug}.actions.pdf.href`} defaultLabel="Download Reader PDF" defaultHref={readerPdf} /> : null}
        </div>
      </section>
      <section className="publication-page-strip" aria-label="Publication pages">
        {(publication.tableOfContents || []).length ? <article className="publication-page-card publication-page-card--toc"><span>TOC</span><h2>Table of contents</h2><p>{publication.tableOfContents.map((item) => item.title).join(', ')}</p></article> : null}
        {publication.pages.map((page, index) => <article className="publication-page-card" key={page.id}><span>{index + 1}</span><h2>{page.title}</h2><p>{page.kind} / {page.orientation}</p></article>)}
      </section>
      {(publication.downloadAssets || []).length ? <section className="publication-page-strip" aria-label="Publication downloads">{publication.downloadAssets.map((asset) => <article className="publication-page-card" key={asset.id}><span>{asset.type || 'download'}</span><h2>{asset.title || 'Download'}</h2>{asset.url ? <a className="button" href={asset.url}>Download</a> : null}</article>)}</section> : null}
      <PublicationFooter />
    </main>
  )
}

function bookmarkKey(slug) { return `sabot-publication-bookmarks:${slug}` }
function loadBookmarks(slug) {
  try { const parsed = JSON.parse(window.localStorage.getItem(bookmarkKey(slug)) || '[]'); return Array.isArray(parsed) ? parsed.filter((item) => Number.isFinite(item)) : [] } catch { return [] }
}
function saveBookmarks(slug, bookmarks) {
  try { window.localStorage.setItem(bookmarkKey(slug), JSON.stringify(bookmarks)) } catch { /* Non-essential reader preference. */ }
}
