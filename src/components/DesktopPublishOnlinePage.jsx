import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { downloadPortableBackup, importPortableBackupFile } from '../lib/portableBackup'
import { isBrowserLocalRuntime, runtimeLabel } from '../lib/runtime'

export function DesktopPublishOnlinePage() {
  const browserLocal = isBrowserLocalRuntime()
  const importRef = useRef(null)
  const [backupState, setBackupState] = useState('')

  async function exportBackup() {
    try {
      setBackupState('Building complete backup…')
      await downloadPortableBackup()
      setBackupState('Backup saved. Keep it somewhere you control.')
    } catch (error) {
      setBackupState(`Backup failed: ${error?.message || error}`)
    }
  }

  async function importBackup(file) {
    if (!file) return
    try {
      setBackupState('Importing publication…')
      const result = await importPortableBackupFile(file)
      setBackupState(`Import complete. ${Object.values(result.imported || {}).reduce((sum, value) => sum + Number(value || 0), 0)} records/files restored${result.warnings?.length ? `, with ${result.warnings.length} warning(s)` : ''}.`)
    } catch (error) {
      setBackupState(`Import failed: ${error?.message || error}`)
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  return (
    <main className="desktop-welcome desktop-publish-online">
      <section className="desktop-welcome__hero">
        <div className="desktop-welcome__mark" aria-hidden="true">S*</div>
        <p className="desktop-welcome__eyebrow">publish / move / back up</p>
        <h1>Your publication is yours before it is online.</h1>
        <p>{runtimeLabel()}. Export a complete portable copy first, then choose whether to keep working locally, move to desktop, or put a hosted copy on the public web.</p>
      </section>

      <section className="desktop-publish-grid">
        <article className="desktop-publish-card desktop-publish-card--recommended">
          <span className="desktop-publish-card__tag">do this first</span>
          <h2>Export publication</h2>
          <p>Creates a portable <code>.sabotpress</code> backup containing publication setup, posts, collections, publications, podcasts, campaigns, translations, public settings, media metadata and local media files.</p>
          <div className="review-card__actions">
            <button className="button button--primary" type="button" onClick={exportBackup}>Export complete backup</button>
            <button className="button" type="button" onClick={() => importRef.current?.click()}>Import backup</button>
            <input ref={importRef} hidden type="file" accept=".sabotpress,application/json,application/vnd.sabotpress+json" onChange={(event) => importBackup(event.target.files?.[0])} />
          </div>
          {backupState ? <p className="description" role="status">{backupState}</p> : null}
          {browserLocal ? <p><strong>Browser storage warning:</strong> clearing this site’s browser data can remove the local copy. The exported file is what makes it portable.</p> : null}
        </article>

        <article className="desktop-publish-card">
          <h2>Publish to a supported host</h2>
          <p>The tested no-cost route uses a compatible free host and its provided public address. SabotPress does not pretend this build can create a cloud account or silently deploy for you.</p>
          <ol>
            <li>Export the publication above.</li>
            <li>Set up a SabotPress web instance on a compatible host.</li>
            <li>Import the portable backup into that instance.</li>
            <li>Use the host-provided public address immediately.</li>
          </ol>
          <details className="desktop-publish-details"><summary>Current hosting model</summary><p>Cloudflare Pages/Workers-style Functions with D1/R2-compatible storage is the currently tested no-cost web path. Free tiers can change. A community host or your own server can provide the same SabotPress web edition.</p></details>
        </article>

        <article className="desktop-publish-card">
          <h2>I already own a domain</h2>
          <p>A domain points at a public deployment. It does not replace hosting. Create or choose the public SabotPress instance first, then connect the domain.</p>
          {!browserLocal ? <Link className="button" to="/sites">Domain setup</Link> : <span className="description">Domain controls become relevant after you move this publication to a hosted SabotPress instance.</span>}
        </article>

        <article className="desktop-publish-card">
          <h2>Community or collective hosting</h2>
          <p>A compatible community host can run the server edition for you. They need the SabotPress web app, persistent database storage, persistent media storage, HTTPS and a way to back both stores up.</p>
          <p>This is the closest model to the old bundled Noblogs experience without making SabotPress itself a central hosting service.</p>
        </article>

        <article className="desktop-publish-card">
          <h2>Move between browser and desktop</h2>
          <p>The same portable backup format is used by both local editions. Export here, open SabotPress desktop, and import the file. No rebuilding the publication by hand.</p>
          {browserLocal ? <a className="button" href="https://github.com/sabotmedia/sabotpress/releases" target="_blank" rel="noreferrer">Desktop downloads</a> : null}
        </article>

        <article className="desktop-publish-card">
          <h2>I have a server</h2>
          <p>Run the self-hosted web edition with a supported database/media adapter. This is the advanced path and keeps infrastructure under your control.</p>
          <a className="button" href="https://github.com/sabotmedia/sabotpress/blob/main/docs/INSTALL.md" target="_blank" rel="noreferrer">Server guide</a>
        </article>
      </section>

      <section className="desktop-publish-online__actions">
        <Link className="button button--primary" to="/wp-admin">Go to my newsroom</Link>
        <Link className="button" to="/">Preview my site</Link>
        <p>No publication data is uploaded merely by opening this screen.</p>
      </section>
    </main>
  )
}
