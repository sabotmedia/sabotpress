import { useEffect, useMemo, useState } from 'react'
import { fetchAuditLog } from '../lib/editorRolesApi'
import { AdminFrame } from './AdminRail'

export function AuditLogPage() {
  const [items, setItems] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  async function reload() {
    try {
      setState('loading')
      setError('')
      const data = await fetchAuditLog()
      setItems(Array.isArray(data?.items) ? data.items : [])
      setState('loaded')
    } catch (err) {
      setError(String(err?.message || err))
      setItems([])
      setState('error')
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) =>
      [
        item.action,
        item.entityType,
        item.entityId,
        item.actor,
        JSON.stringify(item.detail || {}),
      ].join(' ').toLowerCase().includes(q)
    )
  }, [items, query])

  return (
    <AdminFrame>
    <main className="page wp-admin-screen audit-log-page">
      <section className="project-hero">
        <div className="project-hero__eyebrow">audit / history / operations</div>
        <h1>Audit Log</h1>
        <p className="project-hero__description">
          See recent operational changes across the editorial system. A deeply unromantic feature, which is exactly why it matters.
        </p>
        <div className="project-hero__meta">
          <span>{visible.length} visible events</span>
          <span>status: {state}</span>
        </div>
        {error ? <p className="review-card__excerpt">{error}</p> : null}
      </section>

      <section className="archive-controls">
        <label className="archive-control">
          <span>search log</span>
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </section>

      <section className="review-queue">
        {visible.map((item) => (
          <article className="review-card" key={item.id}>
            <div className="review-card__meta">
              <span>{item.action}</span>
              <span>{item.entityType}</span>
              <span>{item.entityId || 'no-id'}</span>
            </div>
            <h2>{item.actor || 'unknown actor'}</h2>
            <p className="review-card__excerpt">{item.createdAt}</p>
            <pre className="review-card__snippet">{JSON.stringify(item.detail || {}, null, 2)}</pre>
          </article>
        ))}
      </section>
    </main>
    </AdminFrame>
  )
}
