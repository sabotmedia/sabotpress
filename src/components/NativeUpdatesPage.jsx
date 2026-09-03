import { getImportedImage } from '../lib/getImportedImage'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadPublishedNativePieces, mergeNativeAndImportedPieces } from '../lib/nativePublicFeed'
import { useWordPressPieces } from '../lib/useWordPressPieces'
import { PublicationFooter } from './PublicationFooter'
import { splitDisplayTitle } from '../lib/content'
import { PublicationTopbar } from './PublicationTopbar'
import { EditableText } from './EditableText'
import { EditableLink } from './EditableLink'
import { HomeFeedCard } from './HomeFeedCard'
import { editableContentRegistry } from '../lib/editableContentRegistry'
import { getConfiguredBlock, getConfiguredText } from '../lib/publicConfig'
import { useResolvedConfig } from '../lib/useResolvedConfig'

function normalizeNativeItem(item) {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title || item.slug || 'Untitled',
    excerpt: item.excerpt || '',
    target: item.target || 'general',
    contentType: item.contentType || item.type || 'article',
    publishedAt: item.publishedAt || item.updatedAt || '',
    updatedAt: item.updatedAt || item.publishedAt || '',
    href: `/post/${item.slug}`,
    imageUrl:
      item.heroImage ||
      item.imageUrl ||
      item.image ||
      item.featuredImage ||
      getImportedImage(item) ||
      '',
    featuredTitleDisplay: item.featuredTitleDisplay || '',
    sourceKind: 'native',
  }
}

function normalizeArchivePiece(piece) {
  const display = typeof splitDisplayTitle === 'function'
    ? splitDisplayTitle(piece)
    : {
        title: piece?.title || piece?.slug || 'Untitled',
        subtitle: piece?.subtitle || '',
      }

  const title = display?.title || piece?.title || piece?.slug || 'Untitled'
  const subtitle = display?.subtitle || piece?.subtitle || ''
  const excerpt = piece?.excerpt || subtitle || ''
  const slug = piece?.slug || ''
  const type = piece?.type || piece?.contentType || 'article'
  const target = inferTargetFromPiece(piece)
  const publishedAt =
    piece?.publishedAt || piece?.date || piece?.createdAt || piece?.updatedAt || ''

  const imageUrl =
    getImportedImage(piece) ||
    piece?.heroImage ||
    piece?.hero_image ||
    piece?.image ||
    piece?.image_url ||
    piece?.coverImage ||
    piece?.cover_image ||
    piece?.featuredImage ||
    piece?.featured_image ||
    (Array.isArray(piece?.images) && piece.images[0]) ||
    ''

  return {
    id: piece?.id || slug || title,
    slug,
    title,
    excerpt,
    target,
    contentType: type,
    publishedAt,
    updatedAt: piece?.updatedAt || publishedAt || '',
    href: slug ? `/post/${slug}` : '/archive',
    imageUrl,
    featuredTitleDisplay: piece?.featuredTitleDisplay || '',
    sourceKind: piece?.sourceKind || 'archive',
  }
}

function inferTargetFromPiece(piece) {
  const project = String(piece?.primaryProject || '').toLowerCase()
  if (project.includes('press')) return 'press'
  if (project.includes('project')) return 'projects'
  return 'general'
}

function pickArchiveFeed({ pieces = [], featured = null, latest = [] }) {
  const latestList = Array.isArray(latest) && latest.length ? latest : pieces
  const normalizedLatest = latestList.map(normalizeArchivePiece)

  const featuredPiece = featured
    ? normalizeArchivePiece(featured)
    : normalizedLatest[0] || null

  const recent = normalizedLatest
    .filter((item) => item.id !== featuredPiece?.id)
    .slice(0, 6)

  return {
    featured: featuredPiece,
    recent,
  }
}

function getHomepageDisplaySettings(resolvedConfig) {
  const homepage = getConfiguredBlock(resolvedConfig, 'site.homepage') || {}
  const featuredLayout = ['grid', 'list', 'stack'].includes(homepage.featuredLayout)
    ? homepage.featuredLayout
    : 'grid'

  const rawCount = Number(homepage.postsPerPage)
  const postsPerPage = Number.isFinite(rawCount)
    ? Math.min(24, Math.max(1, Math.floor(rawCount)))
    : 12

  return { featuredLayout, postsPerPage }
}

export function NativeUpdatesPage({ pieces = [], featured = null, latest = [] }) {
  const homeCopy = editableContentRegistry.home
  const resolvedConfig = useResolvedConfig()
  const [nativeItems, setNativeItems] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')

  const homepageSettings = getHomepageDisplaySettings(resolvedConfig)

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        setState('loading')
        setError('')
        const visible = await loadPublishedNativePieces()
        if (cancelled) return

        setNativeItems((visible || []).filter((item) => item?.slug).map(normalizeNativeItem))
        setState(visible.length ? 'loaded' : 'archive-fallback')
      } catch (err) {
        if (cancelled) return
        setNativeItems([])
        setError(String(err?.message || err))
        setState('archive-fallback')
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [])

  const wordpressFeed = useWordPressPieces(pieces)
  const livePieces = wordpressFeed.pieces || pieces

  const archiveFeed = useMemo(
    () => pickArchiveFeed({
      pieces: livePieces,
      featured: wordpressFeed.usingWordPress ? livePieces[0] : featured,
      latest: wordpressFeed.usingWordPress ? livePieces.slice(0, 12) : latest,
    }),
    [livePieces, wordpressFeed.usingWordPress, featured, latest]
  )

  const mergedFeed = useMemo(() => {
    const archiveItems = [
      archiveFeed.featured,
      ...(archiveFeed.recent || []),
    ].filter(Boolean)

    return mergeNativeAndImportedPieces(archiveItems, nativeItems)
      .map((item) => item?.sourceKind === 'native' ? normalizeNativeItem(item) : item)
      .filter((item) => item?.slug)
  }, [nativeItems, archiveFeed])

  const featuredItem = mergedFeed[0] || archiveFeed.featured || null
  const recentItems = mergedFeed.filter((item) => item.id !== featuredItem?.id).slice(0, homepageSettings.postsPerPage)

  const usingArchiveFallback = !nativeItems.length && !!archiveFeed.featured
  const nextLabel = getConfiguredText(resolvedConfig, homeCopy.nextLabel.field, homeCopy.nextLabel.defaultText)

  return (
    <main className="page publication-homepage home-feed-v3" data-home-renderer="v3">
      <PublicationTopbar />

      {usingArchiveFallback ? null : null}

      {error && !usingArchiveFallback ? (
        <section className="missing-state">
          <EditableText as="h1" field={homeCopy.errorTitle.field}>
            {homeCopy.errorTitle.defaultText}
          </EditableText>
          <p>{error}</p>
        </section>
      ) : null}

      {featuredItem ? (
        <>
          <HomeFeedCard item={featuredItem} variant="hero" />

          {recentItems.length ? (
            <>
              <section className={`home-feed-grid home-feed-grid--${homepageSettings.featuredLayout}`} data-home-grid="v3">
                {recentItems.map((item) => (
                  <HomeFeedCard key={item.id} item={item} variant="recent" />
                ))}
              </section>

              <section className="publication-next-row">
                <EditableLink className="publication-next-link" labelField="home.next.link-label" hrefField="home.next.href" defaultLabel={`${nextLabel} →`} defaultHref="/archive" />
              </section>
            </>
          ) : null}
        </>
      ) : state === 'loading' ? (
        <section className="missing-state">
          <EditableText as="h1" field={homeCopy.loadingTitle.field}>
            {homeCopy.loadingTitle.defaultText}
          </EditableText>
          <EditableText as="p" field={homeCopy.loadingBody.field}>
            {homeCopy.loadingBody.defaultText}
          </EditableText>
        </section>
      ) : (
        <section className="missing-state">
          <EditableText as="h1" field={homeCopy.emptyTitle.field}>
            {homeCopy.emptyTitle.defaultText}
          </EditableText>
          <EditableText as="p" field={homeCopy.emptyBody.field}>
            {homeCopy.emptyBody.defaultText}
          </EditableText>
        </section>
      )}

      <PublicationFooter />
    </main>
  )
}
