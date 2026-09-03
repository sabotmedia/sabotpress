import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicationTopbar } from './PublicationTopbar'
import { PublicationFooter } from './PublicationFooter'
import { loadPublishedNativePieces, mergeNativeAndImportedPieces } from '../lib/nativePublicFeed'
import { loadCollections, loadCollectionsAsync, getCollectionPieces } from '../lib/collections'
import { getImportedImage } from '../lib/getImportedImage'
import { EditableText } from './EditableText'

function resolvePieceImage(piece) {
  return piece?.featuredImage || piece?.heroImage || piece?.imageUrl || getImportedImage(piece) || ''
}

function CollectionCard({ collection, pieces = [] }) {
  const collectionPieces = getCollectionPieces(collection, pieces)
  const fallbackImage = resolvePieceImage(collectionPieces[0])
  const image = collection.coverImage || fallbackImage

  return (
    <article className="collection-card">
      <Link className="collection-card__media" to={`/collections/${collection.slug}`} aria-label={collection.title}>
        {image ? <img src={image} alt={collection.coverAlt || collection.title} loading="lazy" /> : <span className="collection-card__fallback" />}
      </Link>
      <div className="collection-card__body">
        <p className="collection-card__kicker">{collectionPieces.length} pieces</p>
        <h2><Link to={`/collections/${collection.slug}`}>{collection.title || 'Untitled collection'}</Link></h2>
        {collection.subtitle ? <p className="collection-card__subtitle">{collection.subtitle}</p> : null}
        {collection.overview ? <p>{collection.overview}</p> : null}
      </div>
    </article>
  )
}

export function CollectionsIndexPage({ pieces = [] }) {
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
  }, [])

  const publicPieces = useMemo(() => mergeNativeAndImportedPieces(pieces, nativePieces), [pieces, nativePieces])
  const visibleCollections = useMemo(() => collections.filter((collection) => collection.status === 'published'), [collections])

  return (
    <main className="page collections-page">
      <PublicationTopbar />
      <section className="collections-hero">
        <EditableText as="p" className="collections-hero__eyebrow" field="collections.index.eyebrow">Collections</EditableText>
        <EditableText as="h1" field="collections.index.title">Bodies of work</EditableText>
        <EditableText as="p" field="collections.index.description" multiline>Browse SabotPress collections by project, timeline, downloads, gallery, and related reading.</EditableText>
      </section>

      <section className="collections-grid" aria-label="Collections">
        {visibleCollections.length ? (
          visibleCollections.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} pieces={publicPieces} />
          ))
        ) : (
          <div className="collections-empty">
            <EditableText as="h2" field="collections.index.empty.title">No public collections yet</EditableText>
            <EditableText as="p" field="collections.index.empty.body" multiline>Collections created in the newsroom will appear here once published.</EditableText>
          </div>
        )}
      </section>
      <PublicationFooter />
    </main>
  )
}
