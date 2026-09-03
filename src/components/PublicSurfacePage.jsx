import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchNativeEntries } from '../lib/nativePublicContentApi'
import { getSurfaceConfig, listSurfaceConfigs } from '../lib/publicSurfaceTargets'
import { PublicationTopbar } from './PublicationTopbar'
import { PublicationFooter } from './PublicationFooter'
import { EditableText } from './EditableText'
import { EditableLink } from './EditableLink'

function SurfaceCard({ item }) {
  return (
    <article className="piece-card">
      <div className="piece-card__meta">
        <span>{item.target}</span>
        <span>{item.contentType}</span>
      </div>
      <h3>
        <Link to={`/post/${item.slug}`}>{item.title || item.slug}</Link>
      </h3>
      {item.excerpt ? <p>{item.excerpt}</p> : null}
      <div className="piece-card__footer">
        <span>{item.publishedAt || item.updatedAt}</span>
      </div>
    </article>
  )
}

export function PublicSurfacePage({ target = 'general' }) {
  const surface = getSurfaceConfig(target)
  const [items, setItems] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        setState('loading')
        setError('')
        const data = await fetchNativeEntries({ status: 'published', target: surface.key })
        if (cancelled) return
        setItems(Array.isArray(data?.items) ? data.items : [])
        setState('loaded')
      } catch (err) {
        if (cancelled) return
        setItems([])
        setError(String(err?.message || err))
        setState('error')
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [surface.key])

  const navTargets = useMemo(
    () => listSurfaceConfigs().filter((entry) => entry.key !== surface.key),
    [surface.key]
  )
  const isPress = surface.key === 'press'

  return (
    <main className="page public-surface-page">
      <PublicationTopbar />
      <section className="project-hero">
        <EditableText as="div" className="project-hero__eyebrow" field={`surface.${surface.key}.eyebrow`}>{surface.eyebrow}</EditableText>
        <EditableText as="h1" field={`surface.${surface.key}.title`}>{surface.title}</EditableText>
        <EditableText as="p" className="project-hero__description" field={`surface.${surface.key}.description`} multiline>{surface.description}</EditableText>
        <div className="project-hero__meta">
          <span>{items.length} published entries</span>
          <span>status: {state}</span>
        </div>
        {error ? <p className="review-card__excerpt">{error}</p> : null}
      </section>

      <section className="archive-results-bar">
        <EditableLink className="button button--primary" labelField={`surface.${surface.key}.actions.search.label`} hrefField={`surface.${surface.key}.actions.search.href`} defaultLabel="search" defaultHref="/archive" />
        {navTargets.map((entry) => (
          <Link className="button" key={entry.key} to={entry.route}>{entry.title}</Link>
        ))}
      </section>

      {isPress ? (
        <section className="public-press-kit">
          <article className="wp-meta-box">
            <EditableText as="h2" field="surface.press.about.title">SabotPress</EditableText>
            <EditableText as="p" field="surface.press.about.body" multiline>
              SabotPress is an independent public-interest media project publishing reporting, essays,
              archive work, print material, and project-based dispatches.
            </EditableText>
          </article>
          <article className="wp-meta-box">
            <EditableText as="h2" field="surface.press.contact.title">Press contact</EditableText>
            <EditableText as="p" field="surface.press.contact.body" multiline>For press questions, statements, interviews, corrections, or background, use the public contact route.</EditableText>
            <EditableLink className="button button--primary" labelField="surface.press.actions.contact.label" hrefField="surface.press.actions.contact.href" defaultLabel="Contact" defaultHref="/contact" />
          </article>
          <article className="wp-meta-box">
            <EditableText as="h2" field="surface.press.routes.title">Routes</EditableText>
            <EditableText as="p" field="surface.press.routes.body">Browse the archive and public updates for current context.</EditableText>
            <div className="project-featured-callout__actions">
              <EditableLink className="button" labelField="surface.press.actions.archive.label" hrefField="surface.press.actions.archive.href" defaultLabel="Archive" defaultHref="/archive" />
              <EditableLink className="button" labelField="surface.press.actions.about.label" hrefField="surface.press.actions.about.href" defaultLabel="About" defaultHref="/about" />
            </div>
          </article>
        </section>
      ) : null}

      {items.length ? (
        <section className="piece-grid">
          {items.map((item) => (
            <SurfaceCard key={item.id} item={item} />
          ))}
        </section>
      ) : !isPress ? (
        <section className="missing-state">
          <EditableText as="h2" field={`surface.${surface.key}.empty.title`}>No published entries</EditableText>
          <EditableText as="p" field={`surface.${surface.key}.empty.body`}>This surface is live, but nothing has been published into it yet.</EditableText>
        </section>
      ) : null}
      <PublicationFooter />
    </main>
  )
}
