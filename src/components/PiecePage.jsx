import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { PublicationTopbar } from './PublicationTopbar'
import { PublicationFooter } from './PublicationFooter'
import { getImportedImage } from '../lib/getImportedImage'
import { loadPublishedNativePieces, mergeNativeAndImportedPieces } from '../lib/nativePublicFeed'
import { useWordPressPieces } from '../lib/useWordPressPieces'
import { renderImportedBody } from '../lib/renderImportedBody'
import { splitDisplayTitle } from '../lib/content'
import { getPieceDisplaySettings, resolveFirstReadableMode } from '../lib/publicDisplayModes'
import { attachPostAssets } from '../assets/assetSystem'
import { normalizePost } from '../models/publication'
import { renderPost } from '../renderers'
import { resolveFeaturedTitleDisplay } from '../lib/featuredTitleDisplay'
import { buildPostMeta, setDocumentMeta } from '../lib/documentMeta'
import { loadCollectionsAsync } from '../lib/collections'
import { loadPublicationsAsync } from '../lib/publications'
import { EditableText } from './EditableText'
import { EditableLink } from './EditableLink'
import {
  estimateReadingTimeFromHtml,
  extractArticleEnhancements,
  getPodcastAudioUrl,
  getRelatedArticles,
  getRelatedCollections,
  getRelatedPublications,
  setStructuredArticleData,
} from '../lib/publicExperience'

const MODE_STORAGE_KEY = 'sabot.postMode'
const PREVIEW_STORAGE_PREFIX = 'sabot-native-preview-v1:'

function getPreferredMode(searchParams) {
  const explicit = searchParams.get('mode')
  if (explicit === 'read') return 'read'
  return ''
}

function getPieceBySlug(pieces, slug) {
  return (Array.isArray(pieces) ? pieces : []).find((piece) => piece?.slug === slug) || null
}

function getOrderedPieces(pieces) {
  return (Array.isArray(pieces) ? pieces : [])
    .filter((piece) => isPublicPiece(piece))
    .filter((piece) => piece?.slug)
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a?.publishedAt || a?.updatedAt || 0).getTime()
      const bTime = new Date(b?.publishedAt || b?.updatedAt || 0).getTime()
      return bTime - aTime
    })
}

function isPublicPiece(piece) {
  if (!piece) return false
  if (piece.isPreviewSnapshot === true) return true
  const status = String(piece.status || '').toLowerCase()
  if (['draft', 'pending', 'private', 'trash', 'auto-draft'].includes(status)) return false
  if (piece.hidden === true) return false
  return true
}

function loadPreviewPiece(previewId = '', routeSlug = '') {
  if (typeof window === 'undefined') return null
  const id = String(previewId || '').trim()
  if (!id) return null

  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${PREVIEW_STORAGE_PREFIX}${id}`) || 'null')
    if (!parsed || typeof parsed !== 'object') return null

    const slug = String(routeSlug || parsed.slug || parsed.id || id).trim()
    const type =
      parsed.contentType === 'podcast'
        ? 'podcast'
        : parsed.contentType === 'print'
          ? 'print'
          : 'article'
    const primaryProject =
      (Array.isArray(parsed.categories) && parsed.categories[0]) ||
      (Array.isArray(parsed.projects) && parsed.projects[0]) ||
      parsed.primaryProject ||
      'Preview'
    const bodyHtml = String(parsed.bodyHtml || parsed.body || '')
    const publishedAt = parsed.publishedAt || parsed.updatedAt || new Date().toISOString()

    return {
      ...parsed,
      id: parsed.id || id,
      sourcePostId: parsed.id || id,
      slug,
      title: parsed.title || 'Untitled draft',
      excerpt: parsed.excerpt || '',
      subtitle: '',
      author: parsed.author || 'SabotPress',
      status: parsed.status || 'draft',
      workflowState: parsed.workflowState || 'draft',
      type,
      contentType: type,
      target: parsed.target || 'general',
      primaryProject,
      primaryProjectSlug: String(primaryProject || 'preview').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'preview',
      collections: Array.isArray(parsed.collections) ? parsed.collections : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : Array.isArray(parsed.categories) ? parsed.categories : [],
      categories: Array.isArray(parsed.categories) ? parsed.categories : Array.isArray(parsed.projects) ? parsed.projects : [],
      bodyHtml,
      body: bodyHtml,
      richBody: [],
      sourceKind: 'preview',
      sourcePostType: 'preview',
      featuredImage: parsed.featuredImage || parsed.heroImage || parsed.imageUrl || '',
      heroImage: parsed.heroImage || parsed.featuredImage || parsed.imageUrl || '',
      imageUrl: parsed.imageUrl || parsed.featuredImage || parsed.heroImage || '',
      featuredImageAlt: parsed.featuredImageAlt || parsed.title || '',
      featuredTitleDisplay: parsed.featuredTitleDisplay || '',
      href: `/post/${slug}?preview=${encodeURIComponent(id)}&mode=read`,
      relatedAssets: Array.isArray(parsed.relatedAssets) ? parsed.relatedAssets : [],
      relatedPrintLinks: Array.isArray(parsed.relatedPrintLinks) ? parsed.relatedPrintLinks : [],
      hasPrintAssets: Boolean(parsed.hasPrintAssets || type === 'print'),
      publishedAt,
      updatedAt: parsed.updatedAt || publishedAt,
      publishedDateLabel: 'Preview',
      hidden: false,
      reviewFlags: [],
      isPreviewSnapshot: true,
    }
  } catch {
    return null
  }
}

function stripHtmlForPreview(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeRawHtml(value) {
  const raw = String(value || '')
  return /<\s*\/?\s*(p|br|img|div|figure|h1|h2|h3|ul|ol|li|blockquote|a)\b/i.test(raw) || raw.includes('&nbsp;')
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

export function PiecePage({ pieces = [] }) {
  const { slug = '' } = useParams()
  const [searchParams] = useSearchParams()
  const [nativePieces, setNativePieces] = useState(null)
  const [collections, setCollections] = useState([])
  const [publications, setPublications] = useState([])
  const [readingProgress, setReadingProgress] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        const loaded = await loadPublishedNativePieces()
        if (!cancelled) setNativePieces(Array.isArray(loaded) ? loaded : [])
      } catch {
        if (!cancelled) setNativePieces([])
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadCollectionsAsync().then((loaded) => {
      if (!cancelled) setCollections(loaded)
    })
    loadPublicationsAsync().then((loaded) => {
      if (!cancelled) setPublications(loaded)
    })
    return () => { cancelled = true }
  }, [])

  const wordpressFeed = useWordPressPieces(pieces)
  const livePieces = wordpressFeed.pieces || pieces
  const previewPiece = useMemo(
    () => loadPreviewPiece(searchParams.get('preview'), slug),
    [searchParams, slug]
  )

  const mergedPieces = useMemo(
    () => mergeNativeAndImportedPieces(
      Array.isArray(livePieces) ? livePieces : [],
      [
        ...(Array.isArray(nativePieces) ? nativePieces : []),
        ...(previewPiece ? [previewPiece] : []),
      ]
    ),
    [livePieces, nativePieces, previewPiece]
  )

  const orderedPieces = useMemo(() => getOrderedPieces(mergedPieces), [mergedPieces])
  const piece = useMemo(() => getPieceBySlug(orderedPieces, slug), [orderedPieces, slug])
  const displaySettings = useMemo(() => getPieceDisplaySettings(piece), [piece])
  const mode = useMemo(() => {
    if (!piece) return 'read'
    const explicit = getPreferredMode(searchParams)
    if (explicit === 'read' && displaySettings.enableReadMode) return 'read'
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(MODE_STORAGE_KEY) : ''
    if (stored === 'read' && displaySettings.enableReadMode) return 'read'
    if (displaySettings.defaultMode === 'print' && displaySettings.enablePrintMode) return 'print'
    return resolveFirstReadableMode(displaySettings)
  }, [piece, searchParams, displaySettings])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode)
    }
  }, [mode])

  const index = useMemo(
    () => orderedPieces.findIndex((item) => item?.slug === slug),
    [orderedPieces, slug]
  )

  const previous = index >= 0 ? orderedPieces[index + 1] || null : null
  const next = index > 0 ? orderedPieces[index - 1] || null : null

  const display = useMemo(
    () =>
      piece
        ? splitDisplayTitle(piece)
        : {
            title: '',
            subtitle: '',
          },
    [piece]
  )
  const renderData = useMemo(
    () => (piece ? renderPost(attachPostAssets(normalizePost(piece)), { mode }) : null),
    [piece, mode]
  )

  const heroImage = useMemo(() => {
    if (!piece) return ''
    return renderData?.hero?.url || piece.featuredImage || getImportedImage(piece) || ''
  }, [piece, renderData])

  const bodyNodes = useMemo(
    () => renderImportedBody(renderData?.bodyHtml || piece?.bodyHtml || '', mode),
    [piece?.bodyHtml, renderData, mode]
  )
  const articleHtml = renderData?.bodyHtml || piece?.bodyHtml || piece?.body || ''
  const readingTime = useMemo(() => estimateReadingTimeFromHtml(articleHtml, piece?.excerpt || ''), [articleHtml, piece?.excerpt])
  const enhancements = useMemo(() => extractArticleEnhancements(articleHtml), [articleHtml])
  const podcastAudioUrl = useMemo(() => getPodcastAudioUrl(piece || {}), [piece])
  const relatedArticles = useMemo(() => getRelatedArticles(piece || {}, orderedPieces.filter((item) => !item.isPreviewSnapshot), 4), [piece, orderedPieces])
  const relatedCollections = useMemo(() => getRelatedCollections(piece || {}, collections, orderedPieces.filter((item) => !item.isPreviewSnapshot), 3), [piece, collections, orderedPieces])
  const relatedPublications = useMemo(() => getRelatedPublications(piece || {}, publications, 3), [piece, publications])
  const categoryLabel = renderData?.eyebrow || piece?.primaryProject || piece?.type || 'general'
  const headerMetaItems = useMemo(() => {
    if (!piece) return []
    return [piece.isPreviewSnapshot ? 'Preview' : categoryLabel, 'SabotPress', formatMetaType(piece.type), piece.publishedDateLabel]
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  }, [piece, categoryLabel])
  const titleText = display.title || piece?.title || piece?.slug || ''
  const titleLengthClass = getTitleLengthClass(titleText)
  const featuredTitleDisplay = useMemo(() => resolveFeaturedTitleDisplay(piece || {}), [piece])

  useEffect(() => {
    if (!piece || !titleText) return
    setDocumentMeta(buildPostMeta({ ...piece, title: titleText, featuredImage: heroImage || piece.featuredImage }, { path: `/post/${piece.slug}` }))
    setStructuredArticleData({ ...piece, title: titleText }, { url: `/post/${piece.slug}`, image: heroImage || piece.featuredImage })
  }, [piece, titleText, heroImage])

  useEffect(() => {
    function updateProgress() {
      const article = document.querySelector('.piece-body-wrap--public-post')
      if (!article) {
        setReadingProgress(0)
        return
      }
      const rect = article.getBoundingClientRect()
      const total = Math.max(1, rect.height - window.innerHeight)
      const read = Math.min(total, Math.max(0, -rect.top))
      setReadingProgress(Math.round((read / total) * 100))
    }
    updateProgress()
    window.addEventListener('scroll', updateProgress, { passive: true })
    window.addEventListener('resize', updateProgress)
    return () => {
      window.removeEventListener('scroll', updateProgress)
      window.removeEventListener('resize', updateProgress)
    }
  }, [piece?.slug])

  if (!piece && nativePieces === null && !previewPiece) {
    return (
      <main className="page piece-page piece-page--loading">
        <PublicationTopbar />
        <section className="piece-header">
          <EditableText as="p" field="post.template.loading">Loading post…</EditableText>
        </section>
      </main>
    )
  }

  const rawExcerpt = piece?.excerpt || piece?.subtitle || ''
  const displayExcerpt = looksLikeRawHtml(rawExcerpt) ? '' : stripHtmlForPreview(rawExcerpt)

  if (!piece) {
    return (
      <main className="page piece-page piece-page--not-found">
        <PublicationTopbar />
        <section className="piece-header">
          <EditableText as="h1" field="post.template.not-found.title">Post not found</EditableText>
          <EditableText as="p" field="post.template.not-found.body" multiline>This post is not published, does not exist, or is still saving.</EditableText>
          <EditableLink className="button" labelField="post.template.not-found.back.label" hrefField="post.template.not-found.back.href" defaultLabel="Back to archive" defaultHref="/archive" />
        </section>
        <PublicationFooter />
      </main>
    )
  }
  if (mode === 'print') {
    return <Navigate to={`/post/${piece.slug}/print`} replace />
  }

  return (
    <main className={`page piece-page${mode === 'experience' ? ' piece-page--experience' : ' piece-page--reading'}${piece.isPreviewSnapshot ? ' piece-page--preview' : ''}`}>
      <div className="reading-progress" aria-hidden="true">
        <span style={{ width: `${readingProgress}%` }} />
      </div>
      <PublicationTopbar />

      <section className={`piece-article-lead piece-article-lead--${featuredTitleDisplay} piece-article-lead--${titleLengthClass}${heroImage ? ' piece-article-lead--image' : ' piece-article-lead--fallback'}`} aria-label={titleText}>
        {featuredTitleDisplay === 'hidden' && heroImage ? <h1 className="screen-reader-only">{titleText}</h1> : null}
        {heroImage ? (
          <figure className="piece-article-lead__figure">
            <img className="piece-article-lead__image" src={heroImage} alt={piece.featuredImageAlt || titleText} />
            {featuredTitleDisplay === 'overlay' ? (
              <figcaption className="piece-article-lead__overlay">
                <h1>{titleText}</h1>
              </figcaption>
            ) : null}
          </figure>
        ) : (
          <div className="piece-article-lead__fallback">
            <div className="piece-article-lead__eyebrow">{categoryLabel}</div>
            <h1>{titleText}</h1>
          </div>
        )}

        {heroImage && featuredTitleDisplay === 'below' ? (
          <div className="piece-article-lead__title-below">
            <div className="piece-article-lead__eyebrow">{categoryLabel}</div>
            <h1>{titleText}</h1>
          </div>
        ) : null}

        <div className="piece-article-lead__below">
          {headerMetaItems.length ? (
            <div className="piece-article-lead__meta">
              {headerMetaItems.map((item) => (
                <span key={item}>{item}</span>
              ))}
              <span>{readingTime} min read</span>
            </div>
          ) : null}

          {displaySettings.enablePrintMode ? (
            <EditableLink className="piece-article-lead__print-link" labelField={`post.${piece.slug}.actions.print.label`} hrefField={`post.${piece.slug}.actions.print.href`} defaultLabel="Print" defaultHref={`/post/${piece.slug}/print`} />
          ) : null}
        </div>
      </section>

      <section className="piece-layout">
        <aside className="public-reading-tools" aria-label="Article tools">
          {enhancements.headings.length ? (
            <nav className="public-reading-card public-reading-toc" aria-label="Table of contents">
              <EditableText as="h2" field="post.template.tools.contents">Contents</EditableText>
              {enhancements.headings.slice(0, 8).map((heading) => (
                <a className={`public-reading-toc__item public-reading-toc__item--${heading.level}`} href={`#${heading.id}`} key={`${heading.id}-${heading.text}`}>
                  {heading.text}
                </a>
              ))}
            </nav>
          ) : null}
          {podcastAudioUrl ? (
            <section className="public-reading-card public-podcast-player" aria-label="Podcast player">
              <EditableText as="h2" field="post.template.tools.listen">Listen</EditableText>
              <audio controls preload="metadata" src={podcastAudioUrl} />
              <EditableLink labelField={`post.${piece.slug}.actions.audio.label`} hrefField={`post.${piece.slug}.actions.audio.href`} defaultLabel="Download audio" defaultHref={podcastAudioUrl} />
            </section>
          ) : null}
        </aside>
        <article className="piece-body-wrap piece-body-wrap--public-post">
          <div className="piece-body__content">
            {bodyNodes.length ? bodyNodes : <p className="post-body__paragraph">{displayExcerpt || ''}</p>}
          </div>
        </article>
      </section>

      <ArticleEnhancementSections
        piece={piece}
        enhancements={enhancements}
        relatedArticles={relatedArticles}
        relatedCollections={relatedCollections}
        relatedPublications={relatedPublications}
      />

      <section className="piece-nav">
        <div className="piece-nav-grid">
          {previous && !previous.isPreviewSnapshot ? (
            <Link className="piece-nav-card publication-piece-nav-card" to={`/post/${previous.slug}`}>
              <div className="piece-nav-card__eyebrow">Previous</div>
              <strong>{splitDisplayTitle(previous).title || previous.title}</strong>
            </Link>
          ) : null}

          {next && !next.isPreviewSnapshot ? (
            <Link className="piece-nav-card piece-nav-card--next publication-piece-nav-card" to={`/post/${next.slug}`}>
              <div className="piece-nav-card__eyebrow">Next</div>
              <strong>{splitDisplayTitle(next).title || next.title}</strong>
            </Link>
          ) : null}
        </div>
      </section>

      <PublicationFooter />
    </main>
  )
}

function ArticleEnhancementSections({ piece, enhancements, relatedArticles, relatedCollections, relatedPublications }) {
  const relatedPrintLinks = Array.isArray(piece?.relatedPrintLinks) ? piece.relatedPrintLinks : []
  const assetDownloads = (piece?.relatedAssets || []).filter((asset) => asset?.url && /download|pdf|audio|image|asset/i.test(`${asset.kind || ''} ${asset.type || ''}`))
  const downloads = [
    ...enhancements.downloads,
    ...relatedPrintLinks.map((item, index) => ({ id: `print-${index}`, title: item.title || item.label || 'Print asset', url: item.url || item.href || '', type: item.type || 'Print' })),
    ...assetDownloads.map((item, index) => ({ id: `asset-${index}`, title: item.title || 'Download', url: item.url, type: item.kind || item.type || 'Asset' })),
  ].filter((item) => item.url)
  const transcript = piece?.podcastTranscript || piece?.fullTranscript || ''
  const showAny =
    downloads.length ||
    enhancements.footnotes.length ||
    enhancements.sources.length ||
    enhancements.timeline.length ||
    enhancements.locations.length ||
    transcript ||
    relatedArticles.length ||
    relatedCollections.length ||
    relatedPublications.length

  if (!showAny) return null

  return (
    <section className="public-experience-sections" aria-label="Article extras">
      {transcript ? (
        <details className="public-experience-panel public-transcript">
          <summary>Transcript</summary>
          <div className="public-transcript__body">{transcript}</div>
        </details>
      ) : null}

      {downloads.length ? (
        <section className="public-experience-panel">
          <EditableText as="h2" field="post.template.sections.downloads">Downloads</EditableText>
          <div className="public-download-grid">
            {downloads.map((download) => (
              <a className="public-download-card" href={download.url} key={`${download.id}-${download.url}`} target="_blank" rel="noopener noreferrer">
                <strong>{download.title || 'Download'}</strong>
                <span>{download.type || 'File'}</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {enhancements.timeline.length ? (
        <section className="public-experience-panel">
          <EditableText as="h2" field="post.template.sections.timeline">Timeline</EditableText>
          <div className="public-timeline-block">
            {enhancements.timeline.map((item) => (
              <article key={item.id}>
                <time>{item.date}</time>
                <h3>{item.title || item.text}</h3>
                {item.title ? <p>{item.text}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {enhancements.locations.length ? (
        <section className="public-experience-panel">
          <EditableText as="h2" field="post.template.sections.locations">Locations</EditableText>
          <div className="public-map-grid">
            {enhancements.locations.map((location) => (
              <article className="public-location-card" key={location.id}>
                <h3>{location.title}</h3>
                <p>{location.location}</p>
                {location.lat && location.lng ? (
                  <a href={`https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=12/${location.lat}/${location.lng}`} target="_blank" rel="noopener noreferrer">
                    Open map
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {enhancements.sources.length ? (
        <section className="public-experience-panel">
          <EditableText as="h2" field="post.template.sections.sources">Sources</EditableText>
          <div className="public-source-list">
            {enhancements.sources.map((source) => (
              <article className="public-source-block" key={source.id}>
                <h3>{source.title}</h3>
                <p>{source.text}</p>
                {source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">Source link</a> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {enhancements.footnotes.length ? (
        <section className="public-experience-panel">
          <EditableText as="h2" field="post.template.sections.footnotes">Footnotes</EditableText>
          <ol className="public-footnotes">
            {enhancements.footnotes.map((note) => <li key={note.id}>{note.text}</li>)}
          </ol>
        </section>
      ) : null}

      {(relatedArticles.length || relatedCollections.length || relatedPublications.length) ? (
        <section className="public-experience-panel">
          <EditableText as="h2" field="post.template.sections.related">Related</EditableText>
          <div className="public-related-grid">
            {relatedArticles.map((item) => (
              <Link className="public-related-card" to={`/post/${item.slug}`} key={`article-${item.slug}`}>
                <span>Article</span>
                <strong>{splitDisplayTitle(item).title || item.title}</strong>
              </Link>
            ))}
            {relatedCollections.map((collection) => (
              <Link className="public-related-card" to={`/collections/${collection.slug}`} key={`collection-${collection.id}`}>
                <span>Collection</span>
                <strong>{collection.title}</strong>
              </Link>
            ))}
            {relatedPublications.map((publication) => (
              <Link className="public-related-card" to={`/publications/${publication.slug}`} key={`publication-${publication.id}`}>
                <span>Publication</span>
                <strong>{publication.title}</strong>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  )
}
