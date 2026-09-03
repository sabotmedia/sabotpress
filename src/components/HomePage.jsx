import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { splitDisplayTitle, buildTypeOptions } from '../lib/content'
import { EditableText } from './EditableText'
import { getConfiguredBlock, getConfiguredText } from '../lib/publicConfig'
import { useResolvedConfig } from '../lib/useResolvedConfig'

const PAGE_SIZE = 24

function PieceCard({ piece }) {
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

export function HomePage({ featured, latest, projectMap, allPieces }) {
  const featuredDisplay = splitDisplayTitle(featured?.piece)
  const [searchParams, setSearchParams] = useSearchParams()
  const resolvedConfig = useResolvedConfig()

  const featuredBlock = getConfiguredBlock(resolvedConfig, 'home.featured')
  const projectsBlock = getConfiguredBlock(resolvedConfig, 'home.projects')
  const archiveBlock = getConfiguredBlock(resolvedConfig, 'home.archive')
  const filtersBlock = getConfiguredBlock(resolvedConfig, 'home.filters')

  const searchLabel = getConfiguredText(resolvedConfig, filtersBlock?.searchLabelField || 'home.filters.searchLabel', 'search')
  const searchPlaceholder = getConfiguredText(resolvedConfig, filtersBlock?.searchPlaceholderField || 'home.filters.searchPlaceholder', 'title, excerpt, tag...')
  const typeLabel = getConfiguredText(resolvedConfig, filtersBlock?.typeLabelField || 'home.filters.typeLabel', 'type')
  const projectLabel = getConfiguredText(resolvedConfig, filtersBlock?.projectLabelField || 'home.filters.projectLabel', 'project')
  const allLabel = getConfiguredText(resolvedConfig, filtersBlock?.allLabelField || 'home.filters.allLabel', 'all')
  const loadMoreLabel = getConfiguredText(resolvedConfig, filtersBlock?.loadMoreLabelField || 'home.filters.loadMoreLabel', 'load more')
  const noMatchesTitle = getConfiguredText(resolvedConfig, filtersBlock?.noMatchesTitleField || 'home.filters.noMatchesTitle', 'No matching pieces')
  const noMatchesBody = getConfiguredText(resolvedConfig, filtersBlock?.noMatchesBodyField || 'home.filters.noMatchesBody', 'Try changing the search or filters.')
  const resultsPrefix = getConfiguredText(resolvedConfig, filtersBlock?.resultsPrefixField || 'home.filters.resultsPrefix', 'showing')
  const readLabel = getConfiguredText(resolvedConfig, featuredBlock?.readLabelField || 'home.featured.readLabel', 'read')
  const printLabel = getConfiguredText(resolvedConfig, featuredBlock?.printLabelField || 'home.featured.printLabel', 'print')

  const initialQuery = searchParams.get('q') || ''
  const initialType = searchParams.get('type') || 'all'
  const initialProject = searchParams.get('project') || 'all'

  const [query, setQuery] = useState(initialQuery)
  const [typeFilter, setTypeFilter] = useState(initialType)
  const [projectFilter, setProjectFilter] = useState(initialProject)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const typeOptions = useMemo(() => buildTypeOptions(allPieces || []), [allPieces])

  const filteredPieces = useMemo(() => {
    const q = query.trim().toLowerCase()

    return [...(allPieces || [])]
      .filter((piece) => {
        if (typeFilter !== 'all' && piece.type !== typeFilter) return false
        if (projectFilter !== 'all' && piece.primaryProjectSlug !== projectFilter) return false

        if (!q) return true

        const haystack = [
          piece.title,
          piece.subtitle,
          piece.excerpt,
          piece.primaryProject,
          ...(piece.tags || []),
        ]
          .join(' ')
          .toLowerCase()

        return haystack.includes(q)
      })
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
  }, [allPieces, query, typeFilter, projectFilter])

  useEffect(() => {
    const next = {}
    if (query.trim()) next.q = query.trim()
    if (typeFilter !== 'all') next.type = typeFilter
    if (projectFilter !== 'all') next.project = projectFilter
    setSearchParams(next, { replace: true })
  }, [query, typeFilter, projectFilter, setSearchParams])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [query, typeFilter, projectFilter])

  const visiblePieces = filteredPieces.slice(0, visibleCount)
  const hasMore = visibleCount < filteredPieces.length

  return (
    <main className="page page-home">
      <section
        className="hero hero--featured"
        style={featured?.piece?.heroImage ? {
          backgroundImage: `linear-gradient(180deg, rgba(8,8,8,0.55), rgba(8,8,8,0.82)), url(${featured.piece.heroImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : undefined}
      >
        <div className="hero__content">
          <EditableText
            as="div"
            className="hero__eyebrow"
            field={featuredBlock?.eyebrowField || 'home.featured.eyebrow'}
          >
            Featured drop
          </EditableText>

          <EditableText
            as="h1"
            field={featuredBlock?.titleField || 'home.featured.title'}
          >
            {featuredDisplay.title || 'SabotPress'}
          </EditableText>

          {featuredDisplay.subtitle ? (
            <EditableText
              as="div"
              className="hero__subtitle"
              field={featuredBlock?.subtitleField || 'home.featured.subtitle'}
              multiline
            >
              {featuredDisplay.subtitle}
            </EditableText>
          ) : null}

          <div className="hero__meta">
            <span>{featured?.piece?.primaryProject}</span>
            <span>{featured?.piece?.type}</span>
            <span>{featured?.piece?.publishedDateLabel}</span>
            <span>{featured?.source === 'explicit' ? 'explicit feature' : featured?.source === 'fallback' ? 'fallback feature' : 'no feature'}</span>
          </div>

          {featured?.piece?.excerpt ? (
            <EditableText
              as="div"
              className="hero__excerpt"
              field={featuredBlock?.excerptField || 'home.featured.excerpt'}
              multiline
            >
              {featured.piece.excerpt}
            </EditableText>
          ) : null}

          {featured?.piece ? (
            <div className="hero__actions">
              <Link className="button button--primary" to={`/post/${featured.piece.slug}`}>{readLabel}</Link>
              <Link className="button" to={`/post/${featured.piece.slug}/print`}>{printLabel}</Link>
            </div>
          ) : null}
        </div>

        <aside className="hero__rail">
          <div className="manifesto-card">
            <EditableText
              as="div"
              className="manifesto-card__eyebrow"
              field={projectsBlock?.eyebrowField || 'home.projects.eyebrow'}
            >
              Browse by project
            </EditableText>
            <ul className="project-list">
              {projectMap.map((project) => (
                <li key={project.slug}>
                  <div>
                    <strong><Link to={`/archive?project=${encodeURIComponent(project.name)}`}>{project.name}</Link></strong>
                    <span>{project.count} pieces</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>

      <section className="section-heading">
        <EditableText as="p" field={archiveBlock?.eyebrowField || 'home.archive.eyebrow'}>
          Archive flow
        </EditableText>
        <EditableText as="h2" field={archiveBlock?.titleField || 'home.archive.title'}>
          Browse imported pieces
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
          <span>{projectLabel}</span>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="all">{allLabel}</option>
            {projectMap.map((project) => (
              <option key={project.slug} value={project.slug}>{project.name}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="piece-grid">
        {visiblePieces.map((piece) => (
          <PieceCard key={piece.id} piece={piece} />
        ))}
      </section>

      {filteredPieces.length ? (
        <section className="archive-results-bar">
          <span>{resultsPrefix} {visiblePieces.length} of {filteredPieces.length}</span>
          {hasMore ? (
            <button className="button button--primary" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
              {loadMoreLabel}
            </button>
          ) : null}
        </section>
      ) : (
        <section className="missing-state">
          <h2>{noMatchesTitle}</h2>
          <p>{noMatchesBody}</p>
        </section>
      )}
    </main>
  )
}
