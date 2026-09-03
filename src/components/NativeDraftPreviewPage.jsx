import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { loadNativeCollection } from '../lib/nativePublicContent'
import { PublicationTopbar } from './PublicationTopbar'
import { PublicationFooter } from './PublicationFooter'
import { renderImportedBody } from '../lib/renderImportedBody'
import { resolveNativeBodyHtml } from '../lib/nativePublicFeed'
import { adminRoutes } from '../routing/routes'

const PREVIEW_STORAGE_PREFIX = 'sabot-native-preview-v1:'

function loadPreviewSnapshot(id = '') {
  if (typeof window === 'undefined' || !id) return null
  try {
    const raw = window.localStorage.getItem(`${PREVIEW_STORAGE_PREFIX}${id}`)
    const parsed = JSON.parse(raw || 'null')
    if (!parsed || typeof parsed !== 'object') return null
    return {
      ...parsed,
      id: String(parsed.id || id),
      title: String(parsed.title || 'Untitled draft'),
      status: String(parsed.status || 'draft'),
      workflowState: String(parsed.workflowState || 'draft'),
      contentType: String(parsed.contentType || 'dispatch'),
      body: String(parsed.body || parsed.bodyHtml || ''),
      bodyHtml: String(parsed.bodyHtml || parsed.body || ''),
    }
  } catch {
    return null
  }
}

export function NativeDraftPreviewPage() {
  const { id = '' } = useParams()
  const [items, setItems] = useState([])
  const [state, setState] = useState('loading')
  const [snapshot, setSnapshot] = useState(() => loadPreviewSnapshot(id))

  useEffect(() => {
    setSnapshot(loadPreviewSnapshot(id))
  }, [id])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        const loaded = await loadNativeCollection({ includeFuture: 1 })
        if (cancelled) return
        setItems(Array.isArray(loaded) ? loaded : [])
        setState('loaded')
      } catch {
        if (!cancelled) setState('error')
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [])

  const collectionEntry = useMemo(
    () => items.find((item) => item.id === id),
    [items, id]
  )

  const entry = snapshot || collectionEntry
  const image = entry?.featuredImage || entry?.heroImage || ''
  const bodyNodes = useMemo(() => renderImportedBody(resolveNativeBodyHtml(entry || {}), 'read'), [entry])

  if (!snapshot && collectionEntry?.status === 'published' && collectionEntry?.slug) {
    return <Navigate to={`/post/${collectionEntry.slug}`} replace />
  }

  if (state === 'loaded' && !entry) return <Navigate to={adminRoutes.posts} replace />

  return (
    <main className="page native-draft-preview-page">
      <PublicationTopbar />

      <section className="piece-header">
        <div className="piece-header__eyebrow">
          {snapshot ? 'live editor preview' : 'draft preview'} / {entry?.contentType || 'entry'}
        </div>
        <h1>{entry?.title || 'Untitled draft'}</h1>
        {entry?.excerpt ? <p className="piece-header__subtitle">{entry.excerpt}</p> : null}
        <div className="piece-header__meta">
          <span>{entry?.status || state}</span>
          <span>{entry?.workflowState || 'draft'}</span>
          <span>{entry?.target || 'general'}</span>
        </div>
        <div className="review-card__actions">
          <Link className="button button--primary" to={`${adminRoutes.nativeBridge}?edit=${entry?.id || id}`}>
            Back to editor
          </Link>
          {entry?.slug && entry?.status === 'published' ? (
            <Link className="button" to={`/post/${entry.slug}`}>Public URL</Link>
          ) : null}
        </div>
      </section>

      {image ? (
        <section className="piece-hero">
          <img className="piece-hero__image" src={image} alt="" />
        </section>
      ) : null}

      <section className="piece-layout">
        <article className="piece-body-wrap">
          <div className="piece-body__content">
            {bodyNodes.length ? bodyNodes : <p>No body content yet.</p>}
          </div>
        </article>
      </section>

      <PublicationFooter />
    </main>
  )
}
