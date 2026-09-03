import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminFrame } from './AdminRail'
import { loadNativeCollection } from '../lib/nativePublicContent'
import { getPieces } from '../lib/pieces'
import { loadMediaLibraryItems } from './MediaLibraryPage'
import { fetchMediaAssets } from '../lib/mediaAssetsApi'
import { fetchSiteHealth } from '../lib/siteHealthApi'
import { adminRoutes } from '../routing/routes'

function extractUrls(value = '') {
  return [...String(value || '').matchAll(/\b(?:https?:\/\/|\/)[^\s"'<>)]*/gi)].map((match) => match[0])
}

function linkStatus(url = '') {
  if (!url || url === '#') return 'empty'
  if (/^javascript:/i.test(url)) return 'unsafe'
  if (/^\/(wp-admin|login|logout|archive|post|print|about|contact|submit|support|security|updates|press|publications|reader|pgp\.asc)/.test(url)) return 'internal ok'
  if (/^https?:\/\//i.test(url)) return 'external queued'
  if (url.startsWith('/')) return 'review internal'
  return 'review'
}

function titleFor(item) {
  return item.title || item.slug || item.id || 'Untitled'
}

function statusWord(value) {
  return value ? 'ready' : 'missing'
}

export function SiteHealthPage({ pieces = [] }) {
  const [nativeItems, setNativeItems] = useState([])
  const [health, setHealth] = useState(null)
  const [registryItems, setRegistryItems] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        setState('loading')
        setError('')
        const [items, diagnostics, mediaRegistry] = await Promise.all([
          loadNativeCollection({ includeFuture: 1 }),
          fetchSiteHealth(),
          fetchMediaAssets(),
        ])
        if (cancelled) return
        setNativeItems(Array.isArray(items) ? items : [])
        setHealth(diagnostics)
        setRegistryItems(Array.isArray(mediaRegistry?.items) ? mediaRegistry.items : [])
        setState('ready')
      } catch (nextError) {
        if (cancelled) return
        setError(String(nextError?.message || nextError))
        setState('error')
      }
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [])

  const allItems = useMemo(() => [...nativeItems, ...(pieces.length ? pieces : getPieces())], [nativeItems, pieces])
  const mediaItems = useMemo(() => loadMediaLibraryItems(nativeItems, registryItems), [nativeItems, registryItems])

  const missingFeatured = allItems.filter((item) => !String(item.featuredImage || item.heroImage || '').trim()).slice(0, 25)
  const missingAlt = mediaItems.filter((item) => !String(item.alt || '').trim()).slice(0, 25)
  const nativeJson = JSON.stringify(nativeItems)
  const orphanedMedia = mediaItems.filter((item) => item.url && !nativeJson.includes(item.url)).slice(0, 25)
  const linkRows = allItems.flatMap((item) => extractUrls(`${item.body || ''} ${item.bodyHtml || ''} ${item.excerpt || ''} ${item.featuredImage || ''}`).map((url) => ({
    id: `${item.id || item.slug}-${url}`,
    title: titleFor(item),
    url,
    status: linkStatus(url),
  }))).filter((row) => row.status !== 'internal ok').slice(0, 80)

  const missingTables = health?.summary?.missingTables || []
  const mediaStorageReady = Boolean(health?.bindings?.mediaStorage)
  const dbRecordCount = (health?.tables || []).reduce((sum, table) => sum + (Number.isFinite(Number(table.count)) ? Number(table.count) : 0), 0)

  return (
    <AdminFrame>
      <main className="page wp-admin-screen">
        <div className="wp-screen-header">
          <div>
            <h1>Site Health</h1>
            <p className="description">Production diagnostics plus editorial QA for content, links, media, storage, and deployment readiness.</p>
          </div>
          <Link className="button" to={adminRoutes.dashboard}>Back to newsroom</Link>
        </div>

        {error ? (
          <div className="notice notice-error" role="alert">
            <p><strong>Health check failed:</strong> {error}</p>
          </div>
        ) : null}

        <section className="newsroom-stat-grid">
          <article className="review-summary-card"><div className="review-summary-card__eyebrow">database</div><strong>{health?.bindings?.BF_DB ? 'D1 ready' : 'unavailable'}</strong><span>{dbRecordCount} records across checked tables</span></article>
          <article className="review-summary-card"><div className="review-summary-card__eyebrow">schema</div><strong>{missingTables.length}</strong><span>missing expected tables</span></article>
          <article className="review-summary-card"><div className="review-summary-card__eyebrow">media storage</div><strong>{mediaStorageReady ? 'ready' : 'missing'}</strong><span>{health?.bindings?.mediaBinding || 'R2 binding required for uploads'}</span></article>
          <article className="review-summary-card"><div className="review-summary-card__eyebrow">content QA</div><strong>{linkRows.length}</strong><span>references needing manual review</span></article>
        </section>

        <section className="newsroom-grid">
          <article className="wp-meta-box newsroom-panel">
            <h2>Production bindings</h2>
            <ul className="wp-checklist">
              <li>BF_DB: {statusWord(health?.bindings?.BF_DB)}</li>
              <li>Static ASSETS binding: {statusWord(health?.bindings?.ASSETS)}</li>
              <li>Media/R2 binding: {mediaStorageReady ? `ready (${health.bindings.mediaBinding})` : 'missing'}</li>
              <li>Session secret: {statusWord(health?.auth?.sessionSecretConfigured)}</li>
              <li>Admin token: {statusWord(health?.auth?.adminTokenConfigured)}</li>
              <li>Canonical request host: {health?.canonicalHost ? 'sabot.media' : health?.requestHost || 'unknown'}</li>
              <li>Health generated: {health?.generatedAt ? new Date(health.generatedAt).toLocaleString() : state}</li>
            </ul>
          </article>

          <article className="wp-meta-box newsroom-panel">
            <h2>D1 schema and counts</h2>
            <table className="content-table wp-posts-table">
              <thead><tr><th>Table</th><th>Status</th><th>Records</th></tr></thead>
              <tbody>
                {(health?.tables || []).map((table) => (
                  <tr key={table.name}>
                    <td><code>{table.name}</code></td>
                    <td>{table.error ? `error: ${table.error}` : table.exists ? 'ready' : 'missing'}</td>
                    <td>{table.count == null ? '—' : Number(table.count).toLocaleString()}</td>
                  </tr>
                ))}
                {!health?.tables?.length ? <tr><td colSpan={3}>{state === 'loading' ? 'Loading diagnostics…' : 'No diagnostics available.'}</td></tr> : null}
              </tbody>
            </table>
          </article>

          <article className="wp-meta-box newsroom-panel">
            <h2>Editorial content checks</h2>
            <ul className="wp-checklist">
              <li>Searchable records: {allItems.length}</li>
              <li>Feed-ready records: {allItems.filter((item) => item.publishedAt || item.status === 'published').length}</li>
              <li>Deduplicated media references and registry assets: {mediaItems.length}</li>
              <li>Missing featured images: {missingFeatured.length}</li>
              <li>Missing alt text: {missingAlt.length}</li>
              <li>Possible orphaned media: {orphanedMedia.length}</li>
            </ul>
          </article>

          <article className="wp-meta-box newsroom-panel">
            <h2>Link Reference Review</h2>
            <p className="description">This classifies stored references; it does not claim that external URLs were fetched successfully.</p>
            <table className="content-table wp-posts-table">
              <thead><tr><th>Source</th><th>Reference</th><th>Status</th></tr></thead>
              <tbody>
                {linkRows.map((row) => <tr key={row.id}><td>{row.title}</td><td>{row.url}</td><td>{row.status}</td></tr>)}
                {!linkRows.length ? <tr><td colSpan={3}>No questionable links found in the sampled content.</td></tr> : null}
              </tbody>
            </table>
          </article>

          <article className="wp-meta-box newsroom-panel">
            <h2>Missing Featured Images</h2>
            <ul className="newsroom-list">{missingFeatured.map((item) => <li key={item.id || item.slug}><div><strong>{titleFor(item)}</strong><span>{item.status || 'imported'}</span></div></li>)}</ul>
          </article>

          <article className="wp-meta-box newsroom-panel">
            <h2>Missing Alt Text</h2>
            <ul className="newsroom-list">{missingAlt.map((item) => <li key={item.id}><div><strong>{item.title || item.filename || 'Media item'}</strong><span>{item.url}</span></div></li>)}</ul>
          </article>

          <article className="wp-meta-box newsroom-panel">
            <h2>Orphaned Media</h2>
            <ul className="newsroom-list">{orphanedMedia.map((item) => <li key={item.id}><div><strong>{item.title || item.filename || 'Media item'}</strong><span>{item.source || 'media'}</span></div></li>)}</ul>
          </article>
        </section>
      </main>
    </AdminFrame>
  )
}
