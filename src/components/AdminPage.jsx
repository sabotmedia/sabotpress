import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadNativeCollection } from '../lib/nativePublicContent'
import { fetchNativeRevisions } from '../lib/nativePublicContentApi'
import { fetchMediaAssets } from '../lib/mediaAssetsApi'
import { getPublishingModulePrefs, hydratePublishingSetup, isFirstRunComplete, isPublishingModuleEnabled, publishingModulesChangeEvent } from '../lib/publishingModules'
import { loadMediaLibraryItems } from './MediaLibraryPage'
import { adminRoutes } from '../routing/routes'
import { AdminFrame } from './AdminRail'
import { PublishingModulesCard } from './PublishingModulesCard'
import { WpAnalyticsWidgets } from './WpAnalyticsWidgets'

function byNewest(field = 'updatedAt') {
  return (a, b) => new Date(b?.[field] || b?.publishedAt || 0) - new Date(a?.[field] || a?.publishedAt || 0)
}

function statusLabel(item) {
  if (item?.status === 'scheduled' || item?.workflowState === 'scheduled') return 'Scheduled'
  if (item?.status === 'published' || item?.workflowState === 'published') return 'Published'
  if (item?.workflowState === 'review' || item?.workflowState === 'in_review') return 'Review'
  if (item?.status === 'archived' || item?.workflowState === 'archived') return 'Archived'
  return 'Draft'
}

function formatDate(value) {
  const d = new Date(String(value || ''))
  if (!Number.isFinite(d.getTime())) return 'No date'
  return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function WorkflowList({ title, items, empty = 'Nothing here yet.' }) {
  return (
    <section className="wp-meta-box newsroom-panel">
      <h2>{title}</h2>
      {items.length ? (
        <ul className="newsroom-list">
          {items.slice(0, 6).map((item) => (
            <li key={item.id || item.slug || item.title}>
              <div>
                <strong>{item.title || 'Untitled'}</strong>
                <span>{statusLabel(item)} / {formatDate(item.scheduledFor || item.updatedAt || item.publishedAt)}</span>
              </div>
              <Link to={item.id ? `${adminRoutes.nativeBridge}?edit=${item.id}` : adminRoutes.posts}>Edit</Link>
            </li>
          ))}
        </ul>
      ) : <p className="description">{empty}</p>}
    </section>
  )
}

export function AdminPage({ pieces = [] }) {
  const [nativeItems, setNativeItems] = useState([])
  const [mediaItems, setMediaItems] = useState([])
  const [recentRevisions, setRecentRevisions] = useState([])
  const [dashboardState, setDashboardState] = useState('loading')
  const [setupComplete, setSetupComplete] = useState(() => isFirstRunComplete())
  const [modulePrefs, setModulePrefs] = useState(() => getPublishingModulePrefs())

  useEffect(() => {
    const eventName = publishingModulesChangeEvent()
    const refresh = (event) => {
      const setup = event?.detail || getPublishingModulePrefs()
      setModulePrefs(setup)
      setSetupComplete(Boolean(setup.firstRunComplete))
    }
    window.addEventListener(eventName, refresh)
    hydratePublishingSetup().then((setup) => {
      setModulePrefs(setup)
      setSetupComplete(Boolean(setup.firstRunComplete))
    }).catch(() => {})
    return () => window.removeEventListener(eventName, refresh)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      setDashboardState('loading')
      const [loaded, mediaRegistry] = await Promise.all([
        loadNativeCollection({ includeFuture: 1 }).catch(() => []),
        fetchMediaAssets().catch(() => ({ items: [] })),
      ])
      if (cancelled) return
      const safeItems = Array.isArray(loaded) ? loaded : []
      setNativeItems(safeItems)
      setMediaItems(loadMediaLibraryItems(safeItems, Array.isArray(mediaRegistry?.items) ? mediaRegistry.items : []))

      const revisions = []
      for (const item of safeItems.slice(0, 12)) {
        const data = await fetchNativeRevisions({ nativeId: item.id }).catch(() => ({ items: [] }))
        revisions.push(...(Array.isArray(data?.items) ? data.items : []))
      }
      if (!cancelled) {
        setRecentRevisions(revisions.sort(byNewest('createdAt')).slice(0, 8))
        setDashboardState('ready')
      }
    }

    boot()
    return () => { cancelled = true }
  }, [])

  const importedAsPublished = useMemo(() => pieces.map((piece) => ({
    id: piece.id || piece.slug,
    slug: piece.slug,
    title: piece.title,
    status: 'published',
    workflowState: 'published',
    publishedAt: piece.publishedAt,
    updatedAt: piece.updatedAt || piece.publishedAt,
  })), [pieces])

  const allEditorial = useMemo(() => [...nativeItems, ...importedAsPublished], [nativeItems, importedAsPublished])
  const recentDrafts = useMemo(() => nativeItems.filter((item) => item.status === 'draft' || statusLabel(item) === 'Draft').sort(byNewest()), [nativeItems])
  const scheduled = useMemo(() => nativeItems.filter((item) => item.status === 'scheduled' || item.workflowState === 'scheduled' || item.scheduledFor).sort(byNewest('scheduledFor')), [nativeItems])
  const published = useMemo(() => allEditorial.filter((item) => item.status === 'published' || item.workflowState === 'published').sort(byNewest('publishedAt')), [allEditorial])
  const recentEdits = useMemo(() => nativeItems.filter((item) => item.updatedAt).sort(byNewest()), [nativeItems])
  const submissions = useMemo(() => nativeItems.filter((item) => item.status === 'draft' && (item.target === 'submit' || item.workflowState === 'review' || item.workflowState === 'in_review')), [nativeItems])
  const recentMedia = useMemo(() => [...mediaItems].sort(byNewest('uploadedAt')).slice(0, 6), [mediaItems])
  const registeredMediaCount = useMemo(() => mediaItems.filter((item) => ['server-upload', 'registry', 'media-registry'].includes(item.source) || item.storageKey).length, [mediaItems])
  const missingFeaturedCount = useMemo(() => nativeItems.filter((item) => !String(item.featuredImage || item.heroImage || '').trim()).length, [nativeItems])
  const articlesEnabled = isPublishingModuleEnabled('articles', modulePrefs)
  const podcastsEnabled = isPublishingModuleEnabled('podcasts', modulePrefs)

  return (
    <AdminFrame>
      <main className="page wp-admin-screen newsroom-dashboard">
        <div className="wp-screen-header">
          <div>
            <h1>Newsroom</h1>
            <p className="description">Write, publish, manage media, and keep the publication running from one place.</p>
          </div>
          <div className="review-card__actions">
            {articlesEnabled ? <Link className="button button--primary" to={adminRoutes.addNew}>Quick Create</Link> : null}
            <Link className="button" to={adminRoutes.backup}>Backups</Link>
          </div>
        </div>

        {!setupComplete ? <PublishingModulesCard onboarding onComplete={() => setSetupComplete(true)} /> : null}

        <section className="newsroom-stat-grid">
          <article className="review-summary-card"><div className="review-summary-card__eyebrow">drafts</div><strong>{recentDrafts.length}</strong><span>active draft queue</span></article>
          <article className="review-summary-card"><div className="review-summary-card__eyebrow">scheduled</div><strong>{scheduled.length}</strong><span>future publications</span></article>
          <article className="review-summary-card"><div className="review-summary-card__eyebrow">published</div><strong>{published.length}</strong><span>public records</span></article>
          <article className="review-summary-card"><div className="review-summary-card__eyebrow">media</div><strong>{mediaItems.length}</strong><span>{registeredMediaCount} registered assets</span></article>
        </section>

        <section className="newsroom-grid">
          {articlesEnabled ? <WorkflowList title="Recent Drafts" items={recentDrafts} /> : null}
          {articlesEnabled ? <WorkflowList title="Scheduled Publications" items={scheduled} /> : null}
          {articlesEnabled ? <WorkflowList title="Recently Published" items={published} /> : null}
          {articlesEnabled ? <WorkflowList title="Recent Edits" items={recentEdits} /> : null}

          {articlesEnabled ? <section className="wp-meta-box newsroom-panel"><h2>Pending Submissions</h2>{submissions.length ? <WorkflowList title="" items={submissions} /> : <p className="description">No submissions are waiting for review.</p>}</section> : null}

          <section className="wp-meta-box newsroom-panel">
            <h2>Recently Uploaded Media</h2>
            {recentMedia.length ? <ul className="newsroom-list">{recentMedia.map((item) => <li key={item.id}><div><strong>{item.title || item.filename || 'Media item'}</strong><span>{item.source || 'library'} / {item.alt ? 'alt ok' : 'missing alt'}</span></div><Link to={adminRoutes.media}>Open</Link></li>)}</ul> : <p className="description">No media in the library yet.</p>}
          </section>

          {articlesEnabled ? <section className="wp-meta-box newsroom-panel"><h2>Recent Revisions</h2>{recentRevisions.length ? <ul className="newsroom-list">{recentRevisions.map((revision) => <li key={revision.id}><div><strong>{revision.snapshot?.title || 'Untitled revision'}</strong><span>{revision.revisionNote || revision.note || 'save'} / {formatDate(revision.createdAt)}</span></div><Link to={`${adminRoutes.nativeBridge}?edit=${revision.nativeContentId}`}>History</Link></li>)}</ul> : <p className="description">Revision history appears after synced saves.</p>}</section> : null}

          <section className="wp-meta-box newsroom-panel">
            <h2>Quick Create</h2>
            <p className="description">Start a new piece of work using the publishing tools enabled for this site.</p>
            <div className="review-card__actions">
              {articlesEnabled ? <Link className="button button--primary" to={adminRoutes.addNew}>New Article</Link> : null}
              {podcastsEnabled ? <Link className="button" to={`${adminRoutes.nativeBridge}?new=podcast`}>New Podcast Episode</Link> : null}
              <Link className="button" to={adminRoutes.media}>Add Media</Link>
            </div>
          </section>
        </section>

        <section className="wp-dashboard-section">
          <div className="wp-dashboard-section__header"><h2>Analytics Overview</h2><span className="description">Dashboard status: {dashboardState}</span></div>
          <WpAnalyticsWidgets pieces={pieces} compact />
        </section>
      </main>
    </AdminFrame>
  )
}
