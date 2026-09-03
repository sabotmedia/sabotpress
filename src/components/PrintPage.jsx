import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { renderImportedBody } from '../lib/renderImportedBody'
import { loadPublishedNativePieces, mergeNativeAndImportedPieces } from '../lib/nativePublicFeed'
import { useWordPressPieces } from '../lib/useWordPressPieces'
import { getPieceDisplaySettings, resolveFirstReadableMode } from '../lib/publicDisplayModes'
import { attachPostAssets } from '../assets/assetSystem'
import { normalizePost } from '../models/publication'
import { DEFAULT_PRINT_OPTIONS, PrintLayouts, printEngine } from '../print/printEngine'
import { resolveFeaturedTitleDisplay } from '../lib/featuredTitleDisplay'
import mastheadLogo from '../assets/sabotpress-masthead.svg'
import { EditableText } from './EditableText'
import { EditableLink } from './EditableLink'

function getPieceBySlug(pieces, slug) {
  return (Array.isArray(pieces) ? pieces : []).find((piece) => piece?.slug === slug) || null
}

function formatMetaType(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function getTitleLengthClass(value) {
  const title = String(value || '').trim()
  const wordCount = title.split(/\s+/).filter(Boolean).length
  if (title.length > 72 || wordCount > 10) return 'title-length-xl'
  if (title.length > 48 || wordCount > 7) return 'title-length-long'
  if (title.length > 28 || wordCount > 4) return 'title-length-medium'
  return 'title-length-short'
}

export function PrintPage({ pieces = [] }) {
  const { slug = '' } = useParams()
  const [nativePieces, setNativePieces] = useState([])
  const [printOptions, setPrintOptions] = useState(DEFAULT_PRINT_OPTIONS)
  const printLayout = PrintLayouts.ARTICLE

  useEffect(() => {
    let cancelled = false
    async function boot() {
      const loaded = await loadPublishedNativePieces()
      if (!cancelled) setNativePieces(loaded)
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [])

  const wordpressFeed = useWordPressPieces(pieces)
  const livePieces = wordpressFeed.pieces || pieces
  const mergedPieces = useMemo(
    () => mergeNativeAndImportedPieces(Array.isArray(livePieces) ? livePieces : [], nativePieces),
    [livePieces, nativePieces]
  )

  const piece = getPieceBySlug(mergedPieces, slug)
  const pageTitle = piece?.title || piece?.slug || ''

  useEffect(() => {
    if (!pageTitle) return
    document.title = `${pageTitle} | SabotPress Print`
  }, [pageTitle])

  if (!piece) {
    return <Navigate to="/archive" replace />
  }

  const displaySettings = getPieceDisplaySettings(piece)
  if (!displaySettings.enablePrintMode) {
    const nextMode = displaySettings.defaultMode === 'experience' && displaySettings.enableExperienceMode
      ? 'experience'
      : resolveFirstReadableMode(displaySettings)
    return <Navigate to={nextMode === 'experience' ? `/post/${piece.slug}?mode=experience` : `/post/${piece.slug}`} replace />
  }

  const post = attachPostAssets(normalizePost(piece))
  const printDocument = printEngine.render(post, { layout: printLayout, options: printOptions })
  const bodyNodes = renderImportedBody(printDocument.bodyHtml || '', 'print')
  const titleText = printDocument.title || piece.title || piece.slug
  const titleLengthClass = getTitleLengthClass(titleText)
  const featuredTitleDisplay = resolveFeaturedTitleDisplay(piece)
  const printMetaItems = [
    printDocument.eyebrow,
    'SabotPress',
    formatMetaType(piece.type || post.kind),
    printDocument.publishedDateLabel,
  ].map((item) => String(item || '').trim()).filter(Boolean)

  const handleToggle = (key) => (event) => {
    const checked = Boolean(event?.target?.checked)
    setPrintOptions((current) => ({ ...current, [key]: checked }))
  }

  return (
    <main className="page print-page">
      <header className="print-header">
        <div className="print-header__actions">
          <EditableLink className="print-header__back-link" labelField={`print.${piece.slug}.actions.back.label`} hrefField={`print.${piece.slug}.actions.back.href`} defaultLabel="Back to article" defaultHref={`/post/${piece.slug}`} />
          <button type="button" onClick={() => window.print()}><EditableText as="span" field="print.template.actions.print">Print / Save PDF</EditableText></button>
        </div>
        <fieldset className="print-header__controls" aria-label="print layout options">
          <label><input type="checkbox" checked={printOptions.showMetadata} onChange={handleToggle('showMetadata')} /> <EditableText as="span" field="print.template.controls.metadata">Show metadata</EditableText></label>
          <label><input type="checkbox" checked={printOptions.showFeaturedImage} onChange={handleToggle('showFeaturedImage')} /> <EditableText as="span" field="print.template.controls.image">Show featured image</EditableText></label>
          <label><input type="checkbox" checked={printOptions.showColophon} onChange={handleToggle('showColophon')} /> <EditableText as="span" field="print.template.controls.colophon">Show colophon</EditableText></label>
        </fieldset>
      </header>

      <section className={`print-article-lead print-article-lead--${featuredTitleDisplay} print-article-lead--${titleLengthClass}${printDocument.hero?.url ? ' print-article-lead--image' : ' print-article-lead--fallback'}`} aria-label={titleText}>
        {featuredTitleDisplay === 'hidden' && printDocument.hero?.url ? <h1 className="screen-reader-only">{titleText}</h1> : null}
        {printDocument.hero?.url ? (
          <figure className="print-article-lead__figure">
            <img className="print-article-lead__image" src={printDocument.hero.url} alt="" />
            {featuredTitleDisplay === 'overlay' ? (
              <figcaption className="print-article-lead__overlay">
                <h1>{titleText}</h1>
              </figcaption>
            ) : null}
          </figure>
        ) : (
          <div className="print-article-lead__fallback">
            <div className="print-article-lead__eyebrow">{printDocument.eyebrow}</div>
            <h1>{titleText}</h1>
          </div>
        )}

        {printDocument.hero?.url && featuredTitleDisplay === 'below' ? (
          <div className="print-article-lead__title-below">
            <div className="print-article-lead__eyebrow">{printDocument.eyebrow}</div>
            <h1>{titleText}</h1>
          </div>
        ) : null}

        {printOptions.showMetadata && printMetaItems.length ? (
          <div className="print-article-lead__meta">
            {printMetaItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="print-wrap">
        <div className="piece-body__content">
          {bodyNodes.length ? bodyNodes : <p className="post-body__paragraph">{printDocument.excerpt || ''}</p>}
        </div>
      </section>

      {printOptions.showColophon ? (
        <footer className="print-colophon">
          <img src={mastheadLogo} alt="SabotPress" className="print-colophon__logo" />
          <span>{piece.slug ? `/post/${piece.slug}` : ''}</span>
        </footer>
      ) : null}
    </main>
  )
}
