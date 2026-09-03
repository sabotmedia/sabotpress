import { useMemo, useState, useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getProjectMeta, splitDisplayTitle, isPublicProjectSlug, buildTypeOptions } from '../lib/content'
import { getProjectTheme } from '../lib/projectTheme'
import { getFeaturedPieceForProject } from '../lib/projectFeatured'
import { EditableText } from './EditableText'
import { useResolvedConfig } from '../lib/useResolvedConfig'
import { getConfiguredBlock, getConfiguredText } from '../lib/publicConfig'
import { getProjectTitleField, getProjectDescriptionField } from '../lib/projectConfigFields'
import { PublicationTopbar } from './PublicationTopbar'
import { PublicationFooter } from './PublicationFooter'
import { NotFoundPage } from './NotFoundPage'

const PAGE_SIZE = 24

function ProjectPieceCard({ piece }) {
  const display = splitDisplayTitle(piece)

  return (
    <article className="piece-card">
      <div className="piece-card__meta">
        <span>{piece.primaryProject}</span>
        <span>{piece.type}</span>
      </div>
      <h3>
        <Link to={`/post/${piece.slug}`}>{display.title}</Link>
      </h3>
      {display.subtitle ? <p className="piece-card__subtitle">{display.subtitle}</p> : null}
      {piece.excerpt ? <p>{piece.excerpt}</p> : null}
      <div className="piece-card__footer">
        <span>{piece.publishedDateLabel}</span>
        {piece.hasPrintAssets ? <span>print</span> : null}
      </div>
    </article>
  )
}

export function ProjectPage({ pieces }) {
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const resolvedConfig = useResolvedConfig()

  const heroBlock = getConfiguredBlock(resolvedConfig, 'projectPage.hero')
  const featuredBlock = getConfiguredBlock(resolvedConfig, 'projectPage.featured')
  const archiveBlock = getConfiguredBlock(resolvedConfig, 'projectPage.archive')
  const filtersBlock = getConfiguredBlock(resolvedConfig, 'projectPage.filters')

  const projectTitleField = getProjectTitleField(slug)
  const projectDescriptionField = getProjectDescriptionField(slug)

  const searchLabel = getConfiguredText(resolvedConfig, filtersBlock?.searchLabelField || 'projectPage.filters.searchLabel', 'search')
  const searchPlaceholder = getConfiguredText(resolvedConfig, filtersBlock?.searchPlaceholderField || 'projectPage.filters.searchPlaceholder', 'title, excerpt, tag...')
  const typeLabel = getConfiguredText(resolvedConfig, filtersBlock?.typeLabelField || 'projectPage.filters.typeLabel', 'type')
  const sortLabel = getConfiguredText(resolvedConfig, filtersBlock?.sortLabelField || 'projectPage.filters.sortLabel', 'sort')
  const allLabel = getConfiguredText(resolvedConfig, filtersBlock?.allLabelField || 'projectPage.filters.allLabel', 'all')
  const newestLabel = getConfiguredText(resolvedConfig, filtersBlock?.newestLabelField || 'projectPage.filters.newestLabel', 'newest')
  const oldestLabel = getConfiguredText(resolvedConfig, filtersBlock?.oldestLabelField || 'projectPage.filters.oldestLabel', 'oldest')
  const titleLabel = getConfiguredText(resolvedConfig, filtersBlock?.titleLabelField || 'projectPage.filters.titleLabel', 'title')
  const loadMoreLabel = getConfiguredText(resolvedConfig, filtersBlock?.loadMoreLabelField || 'projectPage.filters.loadMoreLabel', 'load more')
  const noMatchesTitle = getConfiguredText(resolvedConfig, filtersBlock?.noMatchesTitleField || 'projectPage.filters.noMatchesTitle', 'No matching pieces')
  const noMatchesBody = getConfiguredText(resolvedConfig, filtersBlock?.noMatchesBodyField || 'projectPage.filters.noMatchesBody', 'Try changing the search or filters.')
  const resultsPrefix = getConfiguredText(resolvedConfig, filtersBlock?.resultsPrefixField || 'projectPage.filters.resultsPrefix', 'showing')
  const featuredEmptyTitle = getConfiguredText(resolvedConfig, featuredBlock?.emptyTitleField || 'projectPage.featured.emptyTitle', 'No featured piece selected')
  const featuredEmptyBody = getConfiguredText(resolvedConfig, featuredBlock?.emptyBodyField || 'projectPage.featured.emptyBody', 'This lane is using archive fallback rules until an explicit featured piece is chosen.')
  const featuredReadLabel = getConfiguredText(resolvedConfig, featuredBlock?.readLabelField || 'projectPage.featured.readLabel', 'read featured')

  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || 'all')
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'newest')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const projectExists = Array.isArray(pieces) && pieces.some((piece) => (piece.primaryProjectSlug || '') === slug)

  if (!isPublicProjectSlug(slug) || !projectExists) {
    return (
      <NotFoundPage
        kind="project"
        backTo="/projects"
        backLabel="Back to projects"
      />
    )
  }

  const meta = getProjectMeta(slug)
  const theme = getProjectTheme(slug)

  const basePieces = useMemo(
    () => pieces.filter((piece) => (piece.primaryProjectSlug || '') === slug),
    [pieces, slug]
  )
  const featuredResult = useMemo(() => getFeaturedPieceForProject(pieces, slug), [pieces, slug])

  const typeOptions = useMemo(() => buildTypeOptions(basePieces), [basePieces])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()

    const out = [...basePieces].filter((piece) => {
      if (typeFilter !== 'all' && piece.type !== typeFilter) return false
      if (!q) return true

      const haystack = [
        piece.title,
        piece.subtitle,
        piece.excerpt,
        ...(piece.tags || []),
      ].join(' ').toLowerCase()

      return haystack.includes(q)
    })

    out.sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.publishedAt) - new Date(b.publishedAt)
      if (sortBy === 'title') return String(a.title || '').localeCompare(String(b.title || ''))
      return new Date(b.publishedAt) - new Date(a.publishedAt)
    })

    return out
  }, [basePieces, query, typeFilter, sortBy])

  useEffect(() => {
    const next = {}
    if (query.trim()) next.q = query.trim()
    if (typeFilter !== 'all') next.type = typeFilter
    if (sortBy !== 'newest') next.sort = sortBy
    setSearchParams(next, { replace: true })
  }, [query, typeFilter, sortBy, setSearchParams])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [query, typeFilter, sortBy, slug])

  const visiblePieces = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  return (
    <main className={`page project-page ${theme.className}`}>
      <PublicationTopbar />
      <section className="project-hero">
        <EditableText as="div" className="project-hero__eyebrow" field={heroBlock?.eyebrowField || 'projectPage.hero.eyebrow'}>
          project archive
        </EditableText>

        <EditableText as="h1" field={projectTitleField}>
          {meta.name}
        </EditableText>

        <EditableText as="div" className="project-hero__description" field={projectDescriptionField} multiline>
          {meta.description}
        </EditableText>

        <div className="project-hero__meta">
          <span>{filtered.length} pieces</span>
        </div>
      </section>

      {featuredResult?.piece ? (
        <section className="project-featured-callout">
          <EditableText as="div" className="project-featured-callout__eyebrow" field={featuredBlock?.eyebrowField || 'projectPage.featured.eyebrow'}>
            featured in this lane
          </EditableText>
          <h2><Link to={`/post/${featuredResult.piece.slug}`}>{splitDisplayTitle(featuredResult.piece).title}</Link></h2>
          {featuredResult.piece.excerpt ? <p>{featuredResult.piece.excerpt}</p> : null}
          <div className="project-featured-callout__actions">
            <Link className="button button--primary" to={`/post/${featuredResult.piece.slug}`}>{featuredReadLabel}</Link>
          </div>
        </section>
      ) : (
        <section className="project-featured-callout project-featured-callout--empty">
          <EditableText as="div" className="project-featured-callout__eyebrow" field={featuredBlock?.eyebrowField || 'projectPage.featured.eyebrow'}>
            featured in this lane
          </EditableText>
          <h2>{featuredEmptyTitle}</h2>
          <p>{featuredEmptyBody}</p>
        </section>
      )}

      <section className="section-heading">
        <EditableText as="p" field={archiveBlock?.eyebrowField || 'projectPage.archive.eyebrow'}>
          Project archive
        </EditableText>
        <EditableText as="h2" field={archiveBlock?.titleField || 'projectPage.archive.title'}>
          Browse pieces
        </EditableText>
      </section>

      <section className="archive-controls">
        <label className="archive-control">
          <span>{searchLabel}</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
          />
        </label>

        <label className="archive-control">
          <span>{typeLabel}</span>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">{allLabel}</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>

        <label className="archive-control">
          <span>{sortLabel}</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="newest">{newestLabel}</option>
            <option value="oldest">{oldestLabel}</option>
            <option value="title">{titleLabel}</option>
          </select>
        </label>
      </section>

      {filtered.length ? (
        <>
          <section className="piece-grid">
            {visiblePieces.map((piece) => (
              <ProjectPieceCard key={piece.id} piece={piece} />
            ))}
          </section>

          <section className="archive-results-bar">
            <span>{resultsPrefix} {visiblePieces.length} of {filtered.length}</span>
            {hasMore ? (
              <button className="button button--primary" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                {loadMoreLabel}
              </button>
            ) : null}
          </section>
        </>
      ) : (
        <section className="missing-state">
          <h2>{noMatchesTitle}</h2>
          <p>{noMatchesBody}</p>
        </section>
      )}
      <PublicationFooter />
    </main>
  )
}
