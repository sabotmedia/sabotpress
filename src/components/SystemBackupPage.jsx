import { downloadSnapshot, exportSystemSnapshot, summarizeSnapshot } from '../lib/systemBackup'
import { useEffect, useState } from 'react'
import { AdminFrame } from './AdminRail'

export function SystemBackupPage() {
  const desktop = typeof window !== 'undefined' && Boolean(window.sabotDesktop?.isDesktop)
  const [state, setState] = useState('idle')
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)
  const [desktopSettings, setDesktopSettings] = useState(null)
  const [desktopBackupState, setDesktopBackupState] = useState('')

  useEffect(() => {
    if (!desktop) return
    window.sabotDesktop.getBackupSettings().then(setDesktopSettings).catch(() => setDesktopSettings(null))
  }, [desktop])

  async function saveDesktopSettings(patch) {
    if (!desktopSettings) return
    const next = await window.sabotDesktop.setBackupSettings({ ...desktopSettings, ...patch })
    setDesktopSettings(next)
  }

  async function runDesktopBackup() {
    try {
      setDesktopBackupState('Creating backup…')
      const result = await window.sabotDesktop.backupNow()
      setDesktopBackupState(result?.createdAt ? `Backup created ${new Date(result.createdAt).toLocaleString()}.` : 'Backup created.')
      const next = await window.sabotDesktop.getBackupSettings()
      setDesktopSettings(next)
    } catch (err) {
      setDesktopBackupState(`Backup failed: ${err?.message || err}`)
    }
  }

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
            <h1>Backups</h1>
            <p className="description">Keep recoverable copies of publication data and media, and export portable copies when you want them somewhere else.</p>
          </div>
          <span className="description" role="status">status: {state}</span>
        </div>

        {error ? <div className="notice notice-error" role="alert"><p><strong>Backup failed:</strong> {error}</p><p>No incomplete snapshot was downloaded. Check Site Health and retry after the reported backend problem is fixed.</p></div> : null}

        {desktop ? (
          <section className="wp-meta-box">
            <h2>Automatic desktop backups</h2>
            <p className="description">Automatic backups are on by default. SabotPress checks the schedule while the desktop app is running and keeps rotating local copies of both the SQLite database and media folder.</p>
            {desktopSettings ? (
              <div className="form-table">
                <label>
                  <span>Automatic backups</span>
                  <select value={desktopSettings.enabled ? 'on' : 'off'} onChange={(event) => saveDesktopSettings({ enabled: event.target.value === 'on' })}>
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </label>
                <label>
                  <span>Frequency</span>
                  <select value={desktopSettings.frequency} disabled={!desktopSettings.enabled} onChange={(event) => saveDesktopSettings({ frequency: event.target.value })}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
                <label>
                  <span>Backups to keep</span>
                  <select value={String(desktopSettings.retention)} disabled={!desktopSettings.enabled} onChange={(event) => saveDesktopSettings({ retention: Number(event.target.value) })}>
                    {[3, 7, 14, 30].map((count) => <option key={count} value={count}>{count}</option>)}
                  </select>
                </label>
              </div>
            ) : <p className="description">Loading desktop backup settings…</p>}
            <p className="description">Last automatic/manual desktop backup: <strong>{desktopSettings?.lastRunAt ? new Date(desktopSettings.lastRunAt).toLocaleString() : 'none yet'}</strong></p>
            <div className="review-card__actions">
              <button className="button button--primary" type="button" onClick={runDesktopBackup}>Back up now</button>
              <button className="button" type="button" onClick={() => window.sabotDesktop.openBackupFolder()}>Open backup folder</button>
              <a className="button" href="/help.html#backups">Backup help</a>
            </div>
            {desktopBackupState ? <p className="description" role="status">{desktopBackupState}</p> : null}
            <p className="description"><strong>Important:</strong> these copies are on the same computer. For protection against disk loss, theft, or a dead machine, periodically export a portable <code>.sabotpress</code> backup to another drive or location you control.</p>
          </section>
        ) : (
          <section className="wp-meta-box">
            <h2>Backup schedule</h2>
            <p className="description">Browser-local editions cannot silently write backup files into arbitrary folders, so they remind you to export portable backups. Server installations should also have host-level scheduled backups for both database and media storage.</p>
            <div className="review-card__actions"><a className="button" href="/help.html#backups">Backup help</a></div>
          </section>
        )}

        <section className="wp-meta-box">
          <h2>Verified server export</h2>
          <p className="description">Creates a verified data snapshot containing native content and revision history, taxonomy, safe user identity/role metadata, audit events, media metadata, collections, campaigns, publications, Sites &amp; Domains, feed and podcast settings, and public-site configuration.</p>
          <p className="description"><strong>Password hashes and salts are deliberately excluded.</strong> This snapshot contains media metadata and public asset URLs, not duplicate binary media files. For a complete movable copy including local media, use <strong>Publish Online → Export complete backup</strong>.</p>
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
