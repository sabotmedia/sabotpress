import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PublicationTopbar } from './PublicationTopbar'
import { PublicationFooter } from './PublicationFooter'
import { getImportedImage } from '../lib/getImportedImage'
import { loadPublishedNativePieces, mergeNativeAndImportedPieces } from '../lib/nativePublicFeed'
import { useWordPressPieces } from '../lib/useWordPressPieces'
import { slugifyProject, splitDisplayTitle } from '../lib/content'
import { buildPublicPostPath } from '../lib/publicSiteRouting'
import { EditableText } from './EditableText'
import { editableContentRegistry } from '../lib/editableContentRegistry'
import { getConfiguredText } from '../lib/publicConfig'
import { useResolvedConfig } from '../lib/useResolvedConfig'
import {
  buildArchiveProjectOptions,
  findPublicProject,
  resolveArchiveProject,
} from '../lib/projectCatalog'

const INITIAL_VISIBLE = 24
const LOAD_STEP = 18
const PROJECT_PREVIEW_SIZE = 4

function resolveCanonicalSlug(piece) {
  return String(
    piece?.slug ||
    piece?.nativeSlug ||
    piece?.canonicalSlug ||
    piece?.id ||
    ''
  ).trim()
}

function normalizeType(piece) {
  const raw = String(piece?.type || piece?.contentType || '').toLowerCase()
  if (raw.includes('podcast') || raw.includes('audio')) return 'podcast'
  if (raw.includes('comic')) return 'comic'
  if (raw.includes('zine')) return 'zine'
  if (raw.includes('newsletter')) return 'newsletter'
  if (raw.includes('print') || piece?.hasPrintAssets) return 'print'
  return 'article'
}

function formatLabel(type) {
  switch (type) {
    case 'podcast': return 'Podcast'
    case 'comic': return 'Comic'
    case 'zine': return 'Zine'
    case 'newsletter': return 'Newsletter'
    case 'print': return 'Print'
    default: return 'Article'
  }
}

function normalizeCardImageUrl(rawUrl) {
  const url = String(rawUrl || '').trim()
  if (!url) return ''
  if (url.startsWith('#')) return ''
  if (/^javascript:/i.test(url)) return ''
  return url
}

function normalizeProjectParam(value) {
  const raw = String(value || '').trim()
  if (!raw || raw === 'all') return 'all'
  return findPublicProject(raw)?.slug || slugifyProject(raw)
}

function normalizePiece(piece) {
  const display = typeof splitDisplayTitle === 'function'
    ? splitDisplayTitle(piece)
    : {
        title: piece?.title || piece?.slug || 'Untitled',
        subtitle: piece?.subtitle || '',
      }

  const title = display?.title || piece?.title || piece?.slug || 'Untitled'
  const subtitle = display?.subtitle || piece?.subtitle || ''
  const excerpt = piece?.excerpt || subtitle || ''
  const type = normalizeType(piece)
  const projectMeta = resolveArchiveProject(piece, type)
  const slug = resolveCanonicalSlug(piece)
  const imageUrl = normalizeCardImageUrl(piece?.featuredImage || getImportedImage(piece) || '')

  return {
    id: piece?.id || slug || title,
    slug,
    title,
    excerpt,
    type,
    format: formatLabel(type),
    rawType: piece?.type || '',
    project: projectMeta?.name || 'The Example Project',
    projectSlug: projectMeta?.slug || 'the-harbor-rat-report',
    projectMeta,
    publishedAt: piece?.publishedAt || '',
    publishedDateLabel: piece?.publishedDateLabel || '',
    imageUrl,
    href: slug ? buildPublicPostPath(slug) : '/archive',
    hasPrintAssets: !!piece?.hasPrintAssets,
    sourceKind: piece?.sourceKind || 'archive',
  }
}

function HighlightText({ text, query }) {
  const value = String(text || '')
  const needle = String(query || '').trim()
  if (!needle) return value

  const lower = value.toLowerCase()
  const lowerNeedle = needle.toLowerCase()
  const parts = []
  let index = 0
  let matchIndex = lower.indexOf(lowerNeedle, index)

  while (matchIndex >= 0) {
    if (matchIndex > index) parts.push(value.slice(index, matchIndex))
    parts.push(<mark key={`${matchIndex}-${lowerNeedle}`}>{value.slice(matchIndex, matchIndex + needle.length)}</mark>)
    index = matchIndex + needle.length
    matchIndex = lower.indexOf(lowerNeedle, index)
  }

  if (index < value.length) parts.push(value.slice(index))
  return parts
}

function scoreSearchResult(item, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return 0
  const title = String(item.title || '').toLowerCase()
  const project = String(item.project || '').toLowerCase()
  const format = String(item.format || '').toLowerCase()
  const excerpt = String(item.excerpt || '').toLowerCase()
  let score = 0
  if (title === q) score += 100
  if (title.startsWith(q)) score += 60
  if (title.includes(q)) score += 40
  if (project.includes(q)) score += 25
  if (format.includes(q)) score += 12
  if (excerpt.includes(q)) score += 8
  return score
}

function ProjectLogo({ project, compact = false }) {
  if (!project?.logoUrl) return null

  return (
    <div className={`archive-project-logo${compact ? ' archive-project-logo--compact' : ''}`} aria-hidden="true">
      <img src={project.logoUrl} alt="" loading="lazy" />
    </div>
  )
}

function ArchiveCard({ item, query = '', readLabel = 'Read', printLabel = 'Print' }) {
  const [hideImage, setHideImage] = useState(false)
  const hasImage = item.imageUrl && !hideImage

  return (
    <article className="archive-card">
      <Link className="archive-card__media" to={item.href} aria-label={item.title}>
        {hasImage ? (
          <div className="archive-card__image">
            <img
              className="archive-card__image-el"
              src={item.imageUrl}
              alt=""
              loading="lazy"
              onError={() => setHideImage(true)}
            />
          </div>
        ) : (
          <div className="archive-card__image archive-card__image--fallback" aria-hidden="true" />
        )}
        <div className="archive-card__overlay">
          <span className="archive-card__project-kicker">{item.project}</span>
          <h3 className="archive-card__title"><HighlightText text={item.title} query={query} /></h3>
        </div>
      </Link>

      <div className="archive-card__body">
        <div className="archive-card__meta">
          <Link className="archive-card__project-link" to={`/archive?project=${encodeURIComponent(item.projectSlug)}`}>
            {item.project}
          </Link>
          <span aria-hidden="true">·</span>
          <span>{item.format}</span>
          {item.publishedDateLabel ? <><span aria-hidden="true">·</span><span>{item.publishedDateLabel}</span></> : null}
        </div>

        {item.excerpt ? (
          <p className="archive-card__excerpt"><HighlightText text={item.excerpt} query={query} /></p>
        ) : null}

        <div className="archive-card__actions">
          <Link className="button button--primary" to={item.href}>{readLabel}</Link>
          <Link className="button" to={`${item.href}/print`}>{printLabel}</Link>
        </div>
      </div>
    </article>
  )
}

function ProjectBrowse({ groups, readLabel, printLabel }) {
  return (
    <section className="archive-project-browse" aria-labelledby="archive-project-browse-title">
      <header className="archive-project-browse__intro">
        <div>
          <p className="archive-results__eyebrow">Browse by project</p>
          <h2 id="archive-project-browse-title">Everything has a home.</h2>
        </div>
        <p>Projects are the archive’s primary shelves. Format stays useful as metadata, but it no longer fights the project taxonomy for control of the same material.</p>
      </header>

      <div className="archive-project-groups">
        {groups.map(({ project, items }) => (
          <section className="archive-project-group" id={`project-${project.slug}`} key={project.slug}>
            <header className="archive-project-group__header">
              <div className="archive-project-group__identity-row">
                <ProjectLogo project={project} />
                <div className="archive-project-group__identity">
                  <p className="archive-project-group__format">{project.format}</p>
                  <h2>{project.name}</h2>
                  <p>{project.description}</p>
                </div>
              </div>
              <div className="archive-project-group__tools">
                <span><strong>{project.count}</strong> {project.count === 1 ? 'piece' : 'pieces'}</span>
                <Link className="button" to={`/archive?project=${encodeURIComponent(project.slug)}`}>View project</Link>
              </div>
            </header>

            <div className="archive-card-grid">
              {items.map((item) => (
                <ArchiveCard key={item.id} item={item} readLabel={readLabel} printLabel={printLabel} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}

export function PublicSearchPage({ pieces = [] }) {
  const archiveCopy = editableContentRegistry.archive
  const resolvedConfig = useResolvedConfig()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [projectFilter, setProjectFilter] = useState(normalizeProjectParam(searchParams.get('project')))
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  const [nativePieces, setNativePieces] = useState([])
  const searchInputRef = useRef(null)

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

  const normalized = useMemo(() => {
    return mergeNativeAndImportedPieces(Array.isArray(livePieces) ? livePieces : [], nativePieces)
      .map(normalizePiece)
      .filter((item) => item.slug)
      .sort((a, b) => {
        const aTime = new Date(a.publishedAt || 0).getTime()
        const bTime = new Date(b.publishedAt || 0).getTime()
        return bTime - aTime
      })
  }, [livePieces, nativePieces])

  const projectOptions = useMemo(() => buildArchiveProjectOptions(normalized), [normalized])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = normalized.filter((item) => {
      if (projectFilter !== 'all' && item.projectSlug !== projectFilter) return false
      if (!q) return true

      const haystack = [
        item.title,
        item.excerpt,
        item.project,
        item.format,
        item.rawType,
        item.publishedDateLabel,
      ].join(' ').toLowerCase()

      return haystack.includes(q)
    })

    if (!q) return matches
    return [...matches].sort((a, b) => (
      scoreSearchResult(b, q) - scoreSearchResult(a, q) ||
      new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
    ))
  }, [normalized, projectFilter, query])

  const visibleResults = filtered.slice(0, visibleCount)
  const isProjectBrowse = projectFilter === 'all' && !query.trim()
  const selectedProject = projectFilter === 'all'
    ? null
    : projectOptions.find((project) => project.slug === projectFilter) || findPublicProject(projectFilter)

  const projectGroups = useMemo(() => {
    if (!isProjectBrowse) return []
    return projectOptions
      .map((project) => ({
        project,
        items: normalized.filter((item) => item.projectSlug === project.slug).slice(0, PROJECT_PREVIEW_SIZE),
      }))
      .filter((group) => group.items.length)
  }, [isProjectBrowse, normalized, projectOptions])

  const readLabel = getConfiguredText(resolvedConfig, archiveCopy.readLabel.field, archiveCopy.readLabel.defaultText)
  const printLabel = getConfiguredText(resolvedConfig, archiveCopy.printLabel.field, archiveCopy.printLabel.defaultText)
  const loadMoreLabel = getConfiguredText(resolvedConfig, archiveCopy.loadMoreLabel.field, archiveCopy.loadMoreLabel.defaultText)
  const clearFiltersLabel = getConfiguredText(resolvedConfig, archiveCopy.clearFiltersLabel.field, archiveCopy.clearFiltersLabel.defaultText)
  const allProjectsLabel = getConfiguredText(resolvedConfig, archiveCopy.allProjectsLabel.field, archiveCopy.allProjectsLabel.defaultText)
  const countLabel = getConfiguredText(resolvedConfig, archiveCopy.countLabel.field, archiveCopy.countLabel.defaultText)

  useEffect(() => {
    const nextProject = normalizeProjectParam(searchParams.get('project'))
    if (nextProject !== projectFilter) {
      setProjectFilter(nextProject)
      setVisibleCount(INITIAL_VISIBLE)
    }

    const nextQuery = searchParams.get('q') || ''
    if (nextQuery !== query) {
      setQuery(nextQuery)
      setVisibleCount(INITIAL_VISIBLE)
    }
  }, [projectFilter, query, searchParams])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== '/') return
      const active = document.activeElement
      if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return
      event.preventDefault()
      searchInputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function updateProjectFilter(project) {
    setProjectFilter(project)
    setVisibleCount(INITIAL_VISIBLE)
    const next = new URLSearchParams(searchParams)
    next.delete('format')
    next.delete('type')
    if (project === 'all') next.delete('project')
    else next.set('project', project)
    setSearchParams(next, { replace: true })
  }

  function updateQuery(value) {
    setQuery(value)
    setVisibleCount(INITIAL_VISIBLE)
    const next = new URLSearchParams(searchParams)
    next.delete('format')
    next.delete('type')
    if (value.trim()) next.set('q', value)
    else next.delete('q')
    setSearchParams(next, { replace: true })
  }

  function clearArchiveFilters() {
    setQuery('')
    setProjectFilter('all')
    setVisibleCount(INITIAL_VISIBLE)
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  const summaryText = selectedProject
    ? `${filtered.length} ${filtered.length === 1 ? 'piece' : 'pieces'} in ${selectedProject.name}`
    : query.trim()
      ? `${filtered.length} ${filtered.length === 1 ? 'result' : 'results'} for “${query.trim()}”`
      : `${normalized.length} pieces across ${projectOptions.length} projects`

  return (
    <main className="page public-search-page archive-page">
      <PublicationTopbar />

      <section className="project-hero archive-page__hero">
        <EditableText as="div" className="project-hero__eyebrow" field={archiveCopy.eyebrow.field}>
          {archiveCopy.eyebrow.defaultText}
        </EditableText>
        <EditableText as="h1" field={archiveCopy.title.field}>
          {archiveCopy.title.defaultText}
        </EditableText>
        <EditableText as="p" className="project-hero__description" field={archiveCopy.body.field} multiline>
          Browse the full SabotPress archive by project, or search across everything.
        </EditableText>
        <div className="project-hero__meta">
          <span>{normalized.length} {countLabel}</span>
          <span>{projectOptions.length} projects</span>
        </div>
      </section>

      <section className="archive-filter-bar" aria-label="Archive controls">
        <label className="archive-search-control archive-search-control--search">
          <EditableText as="span" field={archiveCopy.searchLabel.field}>
            {archiveCopy.searchLabel.defaultText}
          </EditableText>
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder={getConfiguredText(
              resolvedConfig,
              archiveCopy.searchPlaceholder.field,
              'Title, project, excerpt...'
            )}
          />
        </label>

        <label className="archive-search-control archive-search-control--project">
          <EditableText as="span" field={archiveCopy.projectLabel.field}>
            {archiveCopy.projectLabel.defaultText}
          </EditableText>
          <select value={projectFilter} onChange={(event) => updateProjectFilter(event.target.value)}>
            <option value="all">{allProjectsLabel}</option>
            {projectOptions.map((project) => (
              <option key={project.slug} value={project.slug}>
                {project.name} ({project.count})
              </option>
            ))}
          </select>
        </label>

        {(query.trim() || projectFilter !== 'all') ? (
          <button className="button archive-filter-bar__clear" type="button" onClick={clearArchiveFilters}>
            {clearFiltersLabel}
          </button>
        ) : null}
      </section>

      {isProjectBrowse ? (
        <ProjectBrowse groups={projectGroups} readLabel={readLabel} printLabel={printLabel} />
      ) : (
        <section className="archive-results" aria-live="polite">
          <header className="archive-results__header">
            <div className="archive-results__identity-row">
              <ProjectLogo project={selectedProject} compact />
              <div>
                <p className="archive-results__eyebrow">{selectedProject ? selectedProject.format : 'Archive results'}</p>
                <h2>{selectedProject?.name || 'Search results'}</h2>
              </div>
            </div>
            <p className="archive-results__summary">{summaryText}</p>
          </header>

          {visibleResults.length ? (
            <div className="archive-card-grid">
              {visibleResults.map((item) => (
                <ArchiveCard
                  key={item.id}
                  item={item}
                  query={query}
                  readLabel={readLabel}
                  printLabel={printLabel}
                />
              ))}
            </div>
          ) : (
            <div className="archive-empty-state">
              <h3>Nothing is filed here yet.</h3>
              <p>Try another project or clear the search.</p>
              <button className="button" type="button" onClick={clearArchiveFilters}>{clearFiltersLabel}</button>
            </div>
          )}

          {visibleCount < filtered.length ? (
            <div className="archive-load-more">
              <button className="button" type="button" onClick={() => setVisibleCount((count) => count + LOAD_STEP)}>
                {loadMoreLabel}
              </button>
            </div>
          ) : null}
        </section>
      )}

      <PublicationFooter />
    </main>
  )
}
