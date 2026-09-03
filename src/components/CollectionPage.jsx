import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PublicationTopbar } from './PublicationTopbar'
import { PublicationFooter } from './PublicationFooter'
import { NotFoundPage } from './NotFoundPage'
import { loadPublishedNativePieces, mergeNativeAndImportedPieces } from '../lib/nativePublicFeed'
import { findCollection, getCollectionPieces, loadCollections, loadCollectionsAsync } from '../lib/collections'
import { getImportedImage } from '../lib/getImportedImage'
import { buildPublicPostPath } from '../lib/publicSiteRouting'
import { setDocumentMeta } from '../lib/documentMeta'
import { EditableText } from './EditableText'

function resolvePieceSlug(piece) {
  return String(piece?.slug || piece?.nativeSlug || piece?.id || '').trim()
}

function resolvePieceImage(piece) {
  return piece?.featuredImage || piece?.heroImage || piece?.imageUrl || getImportedImage(piece) || ''
}

function formatDate(value) {
  const date = new Date(String(value || ''))
  if (!Number.isFinite(date.getTime())) return String(value || '')
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(date)
}

function PieceTile({ piece, featured = false }) {
  const slug = resolvePieceSlug(piece)
  const image = resolvePieceImage(piece)
  return (
    <article className={`collection-piece-card${featured ? ' collection-piece-card--featured' : ''}`}>
      {image ? (
        <Link className="collection-piece-card__image" to={slug ? buildPublicPostPath(slug) : '/archive'}>
          <img src={image} alt={piece.title || ''} loading="lazy" />
        </Link>
      ) : null}
      <div>
        <p className="collection-piece-card__meta">{piece.type || piece.contentType || 'piece'}{piece.publishedAt ? ` / ${formatDate(piece.publishedAt)}` : ''}</p>
        <h3><Link to={slug ? buildPublicPostPath(slug) : '/archive'}>{piece.title || 'Untitled'}</Link></h3>
        {piece.excerpt ? <p>{piece.excerpt}</p> : null}
      </div>
    </article>
  )
}

export function CollectionPage({ pieces = [] }) {
  const { slug = '' } = useParams()
  const [nativePieces, setNativePieces] = useState([])
  const [collections, setCollections] = useState(() => loadCollections())

  useEffect(() => {
    let cancelled = false
    loadPublishedNativePieces().then((loaded) => {
      if (!cancelled) setNativePieces(Array.isArray(loaded) ? loaded : [])
    })
    loadCollectionsAsync().then((loaded) => {
      if (!cancelled) setCollections(loaded)
    })
    return () => { cancelled = true }
  }, [slug])

  const collection = useMemo(() => findCollection(collections, slug), [collections, slug])
  const publicPieces = useMemo(() => mergeNativeAndImportedPieces(pieces, nativePieces), [pieces, nativePieces])
  const collectionPieces = useMemo(() => (collection ? getCollectionPieces(collection, publicPieces) : []), [collection, publicPieces])
  const featuredSlugs = new Set(collection?.featuredPieceSlugs || [])
  const relatedCollections = useMemo(() => (collection?.relatedCollections || [])
    .map((relatedSlug) => findCollection(collections, relatedSlug))
    .filter(Boolean), [collection, collections])
  const relatedPieces = useMemo(() => {
    const wanted = new Set(collection?.relatedPieces || [])
    return publicPieces.filter((piece) => wanted.has(resolvePieceSlug(piece)))
  }, [collection, publicPieces])

  useEffect(() => {
    if (!collection) return
    setDocumentMeta({
      title: collection.title,
      description: collection.subtitle || collection.overview || `SabotPress collection: ${collection.title}`,
      canonicalPath: `/collections/${collection.slug}`,
      image: collection.coverImage,
    })
  }, [collection])

  if (!collection || collection.status !== 'published') {
    return <NotFoundPage kind="page" title="Collection not found" body="That collection does not exist or is not public." backTo="/collections" backLabel="Back to collections" />
  }

  const cover = collection.coverImage || resolvePieceImage(collectionPieces[0])

  return (
    <main className="page collection-page">
      <PublicationTopbar />
      <article>
        <header className="collection-lead">
          {cover ? (
            <div className="collection-lead__image">
              <img src={cover} alt={collection.coverAlt || collection.title} />
            </div>
          ) : null}
          <div className="collection-lead__copy">
            <EditableText as="p" className="collection-lead__eyebrow" field="collections.detail.eyebrow">Collection</EditableText>
            <h1>{collection.title}</h1>
            {collection.subtitle ? <p className="collection-lead__subtitle">{collection.subtitle}</p> : null}
            {collection.overview ? <p>{collection.overview}</p> : null}
          </div>
        </header>

        {collection.featuredQuote ? (
          <blockquote className="collection-quote">
            <p>{collection.featuredQuote}</p>
          </blockquote>
        ) : null}

        <section className="collection-section" aria-labelledby="collection-pieces-heading">
          <div className="collection-section__header">
            <EditableText as="h2" id="collection-pieces-heading" field="collections.detail.sections.pieces">Related pieces</EditableText>
            <span>{collectionPieces.length} pieces</span>
          </div>
          <div className="collection-piece-grid">
            {collectionPieces.map((piece) => (
              <PieceTile key={resolvePieceSlug(piece)} piece={piece} featured={featuredSlugs.has(resolvePieceSlug(piece))} />
            ))}
          </div>
        </section>

        {collection.timeline.length ? (
          <section className="collection-section collection-timeline" aria-labelledby="collection-timeline-heading">
            <EditableText as="h2" id="collection-timeline-heading" field="collections.detail.sections.timeline">Timeline</EditableText>
            {collection.timeline.map((item) => (
              <article className="collection-timeline__item" key={item.id}>
                <time>{formatDate(item.date)}</time>
                <h3>{item.title}</h3>
                {item.body ? <p>{item.body}</p> : null}
              </article>
            ))}
          </section>
        ) : null}

        {collection.downloads.length ? (
          <section className="collection-section" aria-labelledby="collection-downloads-heading">
            <EditableText as="h2" id="collection-downloads-heading" field="collections.detail.sections.downloads">Downloads</EditableText>
            <div className="collection-downloads">
              {collection.downloads.map((download) => (
                <a className="collection-download" href={download.url} key={download.id} target="_blank" rel="noopener noreferrer">
                  <strong>{download.title || download.url}</strong>
                  {download.type ? <span>{download.type}</span> : null}
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {collection.gallery.length ? (
          <section className="collection-section" aria-labelledby="collection-gallery-heading">
            <EditableText as="h2" id="collection-gallery-heading" field="collections.detail.sections.gallery">Gallery</EditableText>
            <div className="collection-gallery">
              {collection.gallery.map((image) => (
                <figure key={image.id}>
                  <img src={image.url} alt={image.alt || image.title || ''} loading="lazy" />
                  {(image.caption || image.title) ? <figcaption>{image.caption || image.title}</figcaption> : null}
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        {collection.updates.length ? (
          <section className="collection-section collection-updates" aria-labelledby="collection-updates-heading">
            <EditableText as="h2" id="collection-updates-heading" field="collections.detail.sections.updates">Updates</EditableText>
            {collection.updates.map((update) => (
              <article key={update.id}>
                <p>{formatDate(update.date)}</p>
                <h3>{update.url ? <a href={update.url}>{update.title}</a> : update.title}</h3>
                {update.body ? <p>{update.body}</p> : null}
              </article>
            ))}
          </section>
        ) : null}

        {(relatedCollections.length || relatedPieces.length || collection.externalLinks.length) ? (
          <section className="collection-section collection-related" aria-labelledby="collection-related-heading">
            <EditableText as="h2" id="collection-related-heading" field="collections.detail.sections.related">Related reading</EditableText>
            {relatedCollections.map((item) => (
              <Link key={item.id} to={`/collections/${item.slug}`}>{item.title}</Link>
            ))}
            {relatedPieces.map((piece) => (
              <Link key={resolvePieceSlug(piece)} to={buildPublicPostPath(resolvePieceSlug(piece))}>{piece.title}</Link>
            ))}
            {collection.externalLinks.map((link) => (
              <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer">{link.title || link.url}</a>
            ))}
          </section>
        ) : null}
      </article>
      <PublicationFooter />
    </main>
  )
}
