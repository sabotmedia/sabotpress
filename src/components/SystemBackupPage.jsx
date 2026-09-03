import { downloadSnapshot, exportSystemSnapshot, summarizeSnapshot } from '../lib/systemBackup'
import { useState } from 'react'
import { AdminFrame } from './AdminRail'

export function SystemBackupPage() {
  const [state, setState] = useState('idle')
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)

  async function handleExport() {
    try {
      setState('loading')
      setError('')
      setSummary(null)
      const snapshot = await exportSystemSnapshot()
      const nextSummary = summarizeSnapshot(snapshot)
      if (!nextSummary.complete) throw new Error('Backup manifest is incomplete')
      if (!nextSummary.feedSettingsIncluded || !nextSummary.podcastSettingsIncluded || !nextSummary.publicConfigIncluded) throw new Error('Backup manifest is missing required settings datasets')
      setSummary(nextSummary)
      downloadSnapshot(snapshot)
      setState('done')
    } catch (err) {
      setError(String(err?.message || err))
      setState('error')
    }
  }

  return (
    <AdminFrame>
      <main className="page wp-admin-screen system-backup-page">
        <div className="wp-screen-header">
          <div>
            <h1>System Backup</h1>
            <p className="description">Export a verified server snapshot of SabotPress data. The download is withheld if any required dataset fails to load.</p>
          </div>
          <span className="description" role="status">status: {state}</span>
        </div>

        {error ? <div className="notice notice-error" role="alert"><p><strong>Backup failed:</strong> {error}</p><p>No incomplete snapshot was downloaded. Check Site Health and retry after the reported backend problem is fixed.</p></div> : null}

        <section className="wp-meta-box">
          <h2>Verified server export</h2>
          <p className="description">Includes native content and D1 revision history, taxonomy, safe user identity/role metadata, legacy editor-role records, audit events, media metadata, collections, campaigns and campaign revisions, the campaign coverage archive, publications, Sites &amp; Domains, persisted feed and podcast settings, and public-site configuration.</p>
          <p className="description"><strong>Password hashes and salts are deliberately excluded.</strong> The snapshot also contains media metadata and public asset URLs, not duplicate copies of R2 binary objects.</p>
          <div className="review-card__actions"><button className="button button--primary" type="button" onClick={handleExport} disabled={state === 'loading'}>{state === 'loading' ? 'Building verified snapshot…' : 'Export server snapshot'}</button></div>
        </section>

        {summary ? (
          <section className="newsroom-stat-grid">
            <article className="review-summary-card"><div className="review-summary-card__eyebrow">native content</div><strong>{summary.nativeCount}</strong><span>records</span></article>
            <article className="review-summary-card"><div className="review-summary-card__eyebrow">revisions</div><strong>{summary.revisionCount}</strong><span>D1 snapshots</span></article>
            <article className="review-summary-card"><div className="review-summary-card__eyebrow">users</div><strong>{summary.userCount}</strong><span>safe identity records</span></article>
            <article className="review-summary-card"><div className="review-summary-card__eyebrow">media</div><strong>{summary.mediaCount}</strong><span>metadata records</span></article>
            <article className="review-summary-card"><div className="review-summary-card__eyebrow">sites</div><strong>{summary.siteCount}</strong><span>domain records</span></article>
            <article className="review-summary-card">
              <div className="review-summary-card__eyebrow">remaining datasets</div>
              <ul>
                <li><span>taxonomy terms</span><strong>{summary.taxonomyCount}</strong></li>
                <li><span>legacy editor roles</span><strong>{summary.roleCount}</strong></li>
                <li><span>audit events</span><strong>{summary.auditCount}</strong></li>
                <li><span>collections</span><strong>{summary.collectionCount}</strong></li>
                <li><span>campaigns</span><strong>{summary.campaignCount}</strong></li>
                <li><span>campaign revisions</span><strong>{summary.campaignRevisionCount}</strong></li>
                <li><span>campaign coverage</span><strong>{summary.campaignCoverageCount}</strong></li>
                <li><span>publications</span><strong>{summary.publicationCount}</strong></li>
                <li><span>feed settings</span><strong>{summary.feedSettingsIncluded ? 'included' : 'missing'}</strong></li>
                <li><span>podcast settings</span><strong>{summary.podcastSettingsIncluded ? 'included' : 'missing'}</strong></li>
                <li><span>public config</span><strong>{summary.publicConfigIncluded ? 'included' : 'missing'}</strong></li>
                <li><span>manifest</span><strong>{summary.complete ? 'complete' : 'incomplete'}</strong></li>
              </ul>
            </article>
          </section>
        ) : null}
      </main>
    </AdminFrame>
  )
}
