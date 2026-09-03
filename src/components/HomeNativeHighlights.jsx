import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchNativeEntries } from '../lib/nativePublicContentApi'
import { useResolvedConfig } from '../lib/useResolvedConfig'
import { getConfiguredText } from '../lib/publicConfig'
import { EditableText } from './EditableText'

export function HomeNativeHighlights() {
  const resolvedConfig = useResolvedConfig()
  const [items, setItems] = useState([])
  const [state, setState] = useState('loading')

  const eyebrow = getConfiguredText(resolvedConfig, 'home.native.eyebrow', 'native dispatches')
  const title = getConfiguredText(resolvedConfig, 'home.native.title', 'Published from inside Sabot')
  const actionLabel = getConfiguredText(resolvedConfig, 'home.native.actionLabel', 'view updates')

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        const data = await fetchNativeEntries({ status: 'published' })
        if (cancelled) return
        const next = Array.isArray(data?.items) ? data.items : []
        setItems(next.filter((item) => item.target === 'home' || item.target === 'general' || item.target === 'press').slice(0, 3))
        setState('loaded')
      } catch {
        if (cancelled) return
        setItems([])
        setState('error')
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [])

  const visible = useMemo(() => items.slice(0, 3), [items])

  if (!visible.length) return null

  return (
    <>
      <section className="section-heading">
        <EditableText as="p" field="home.native.eyebrow">
          {eyebrow}
        </EditableText>
        <EditableText as="h2" field="home.native.title">
          {title}
        </EditableText>
      </section>

      <section className="piece-grid">
        {visible.map((item) => (
          <article className="piece-card" key={item.id}>
            <div className="piece-card__meta">
              <span>{item.target}</span>
              <span>{item.contentType}</span>
            </div>
            <h3>
              <Link to={`/updates/${item.slug}`}>{item.title || item.slug}</Link>
            </h3>
            {item.excerpt ? <p>{item.excerpt}</p> : null}
            <div className="piece-card__footer">
              <span>{item.publishedAt || item.updatedAt}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="archive-results-bar">
        <Link className="button button--primary" to="/updates">{actionLabel}</Link>
        <span>status: {state}</span>
      </section>
    </>
  )
}
