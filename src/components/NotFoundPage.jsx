import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { PublicationTopbar } from './PublicationTopbar'
import { PublicationFooter } from './PublicationFooter'
import { setDocumentMeta } from '../lib/documentMeta'
import { EditableText } from './EditableText'
import { editableContentRegistry } from '../lib/editableContentRegistry'
import { getConfiguredText } from '../lib/publicConfig'
import { useResolvedConfig } from '../lib/useResolvedConfig'

const COPY = {
  page: {
    titleField: editableContentRegistry.notFound.pageTitle.field,
    bodyField: editableContentRegistry.notFound.pageBody.field,
    title: 'Page not found',
    body: 'That page does not exist, moved, or was never published.',
  },
  post: {
    titleField: editableContentRegistry.notFound.postTitle.field,
    bodyField: editableContentRegistry.notFound.postBody.field,
    title: 'Post not found',
    body: 'This post is not published, does not exist, or is still saving.',
  },
  project: {
    titleField: editableContentRegistry.notFound.projectTitle.field,
    bodyField: editableContentRegistry.notFound.projectBody.field,
    title: 'Project not found',
    body: 'That project archive does not exist or is not public.',
  },
}

export function NotFoundPage({ kind = 'page', title = '', body = '', backTo = '/archive', backLabel = 'Back to archive' }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const resolvedConfig = useResolvedConfig()
  const notFoundCopy = editableContentRegistry.notFound
  const copy = COPY[kind] || COPY.page
  const configuredTitle = getConfiguredText(resolvedConfig, copy.titleField, copy.title)
  const configuredBody = getConfiguredText(resolvedConfig, copy.bodyField, copy.body)
  const heading = title || configuredTitle
  const message = body || configuredBody
  const resolvedBackLabel = getConfiguredText(
    resolvedConfig,
    backTo === '/projects' ? notFoundCopy.projectsLabel.field : notFoundCopy.archiveLabel.field,
    backLabel
  )
  const homeLabel = getConfiguredText(resolvedConfig, notFoundCopy.homeLabel.field, notFoundCopy.homeLabel.defaultText)

  useEffect(() => {
    setDocumentMeta({
      title: heading,
      description: message,
      canonicalPath: window.location.pathname,
    })
  }, [heading, message])

  return (
    <main className="page not-found-page">
      <PublicationTopbar />
      <section className="missing-state not-found-page__body">
        <EditableText as="p" className="project-hero__eyebrow" field={notFoundCopy.eyebrow.field}>
          {notFoundCopy.eyebrow.defaultText}
        </EditableText>
        <EditableText as="h1" field={copy.titleField}>
          {heading}
        </EditableText>
        <EditableText as="p" field={copy.bodyField}>
          {message}
        </EditableText>
        <div className="not-found-page__actions">
          <Link className="button button--primary" to={backTo}>{resolvedBackLabel}</Link>
          <Link className="button" to="/">{homeLabel}</Link>
        </div>
        <form className="not-found-search" role="search" onSubmit={(event) => {
          event.preventDefault()
          navigate(query.trim() ? `/archive?q=${encodeURIComponent(query.trim())}` : '/archive')
        }}>
          <label>
            <span>Search the archive</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search SabotPress" />
          </label>
          <button className="button" type="submit">Search</button>
        </form>
        <nav className="not-found-useful-links" aria-label="Useful links">
          <Link to="/archive">Archive</Link>
          <Link to="/collections">Collections</Link>
          <Link to="/publications">Publications</Link>
          <Link to="/about">About</Link>
        </nav>
      </section>
      <PublicationFooter />
    </main>
  )
}
