import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

const sections = [
  ['getting-started', 'Getting started'],
  ['publishing', 'Publishing basics'],
  ['free-hosting', '$0 hosting'],
  ['community-hosting', 'Collective hosting'],
  ['server', 'Server setup'],
  ['noblogs', 'Noblogs / WordPress migration'],
  ['backups', 'Backups'],
  ['desktop-data', 'Desktop data and updates'],
  ['browser-data', 'Browser data'],
]

export function HelpPage() {
  const location = useLocation()

  useEffect(() => {
    const id = location.hash.replace(/^#/, '')
    if (!id) return
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }))
  }, [location.hash])

  return (
    <main className="page wp-admin-screen sabotpress-help-page">
      <div className="wp-screen-header">
        <div>
          <div className="review-summary-card__eyebrow">SabotPress help</div>
          <h1>Help without leaving the app</h1>
          <p className="description">Start here for normal use. Repository docs are maintainer reference material, not required reading for somebody trying to publish.</p>
        </div>
        <Link className="button" to="/wp-admin">Back to newsroom</Link>
      </div>

      <nav className="wp-meta-box" aria-label="Help topics">
        <h2>Topics</h2>
        <div className="review-card__actions">
          {sections.map(([id, label]) => <a key={id} className="button" href={`#${id}`}>{label}</a>)}
        </div>
      </nav>

      <section className="wp-meta-box" id="getting-started">
        <h2>Getting started</h2>
        <p>SabotPress has three first-class ways to work. The browser edition is quickest, the desktop edition is best for heavier local work, and the server edition is for a shared or public installation.</p>
        <h3>Browser / PWA</h3>
        <p>Open the browser edition, choose <strong>Start on this device</strong>, name the publication, choose modules, and enter the newsroom. No account is required for browser-local use. Work stays in that browser until you explicitly export or publish it.</p>
        <h3>Desktop</h3>
        <p>Install SabotPress and work locally with SQLite plus local media storage. Desktop is the better choice for large media libraries, AudioLab/PrintLab work, filesystem access, and long offline sessions.</p>
        <h3>Self-hosted web</h3>
        <p>Use the server edition when several editors need to share one publication or when the public website should run on infrastructure you or a collective controls.</p>
      </section>

      <section className="wp-meta-box" id="publishing">
        <h2>Publishing basics</h2>
        <ol>
          <li>Create a post from <strong>New</strong> or <strong>Posts</strong>.</li>
          <li>Add media from the editor or Media Library.</li>
          <li>Save drafts freely. Local editions save into their local data store.</li>
          <li>Preview the public site before publishing.</li>
          <li>Use <strong>Publish Online</strong> only when you are ready to move a local publication to a public host.</li>
        </ol>
        <p>Enabling or disabling modules changes which publishing tools appear. It does not delete existing publication data.</p>
      </section>

      <section className="wp-meta-box" id="free-hosting">
        <h2>$0 public hosting</h2>
        <p>A local SabotPress publication is not automatically a public website. To put it online for free, you need a compatible host with persistent database and media storage. The currently tested no-cost model is Cloudflare Pages/Workers-style hosting with D1/R2-compatible storage.</p>
        <ol>
          <li>Export a complete <code>.sabotpress</code> backup from Publish Online.</li>
          <li>Create a compatible SabotPress web deployment.</li>
          <li>Attach persistent database and media storage.</li>
          <li>Import the backup into that hosted instance.</li>
          <li>Use the host-provided public address immediately. A custom domain is optional.</li>
        </ol>
        <p>SabotPress does not silently create a cloud account, buy a domain, or upload your local work merely because you opened the publishing screen.</p>
      </section>

      <section className="wp-meta-box" id="community-hosting">
        <h2>What to ask a community or collective host</h2>
        <p>A collective host does not need a special SabotPress account. They need to be able to run the open web edition and provide:</p>
        <ul>
          <li>persistent SQL-compatible database storage</li>
          <li>persistent media/object storage</li>
          <li>HTTPS</li>
          <li>a stable public address</li>
          <li>backups of both database and media</li>
          <li>a safe application update path that does not replace publication data</li>
        </ul>
        <p>A useful plain-language question is: <em>Can you run this web app with persistent database and media storage, HTTPS, and backups?</em></p>
      </section>

      <section className="wp-meta-box" id="server">
        <h2>Server setup</h2>
        <p>This is the advanced route. A server installation needs the SabotPress web build, a persistent database adapter, persistent media storage, HTTPS, admin/session secrets, and the database schema initialized.</p>
        <ol>
          <li>Deploy the web application.</li>
          <li>Attach database storage.</li>
          <li>Attach media storage.</li>
          <li>Configure admin/session secrets.</li>
          <li>Run schema setup.</li>
          <li>Check Site Health.</li>
          <li>Import a <code>.sabotpress</code> backup if migrating from browser or desktop.</li>
        </ol>
        <p>Provider-specific deployment details still live in repository documentation for maintainers, but ordinary desktop/browser use should not require GitHub.</p>
      </section>

      <section className="wp-meta-box" id="noblogs">
        <h2>Noblogs / WordPress migration</h2>
        <ol>
          <li>Export the old WordPress/Noblogs site before it disappears.</li>
          <li>Keep the original export untouched somewhere safe.</li>
          <li>Save a separate copy of the old media/uploads if possible.</li>
          <li>Create the new SabotPress publication and enable the modules you need.</li>
          <li>Import posts and media.</li>
          <li>Check titles, dates, authors, categories/projects, links, and featured images.</li>
          <li>Preview the archive and important pages.</li>
          <li>Only then connect a domain or redirect visitors.</li>
        </ol>
        <p><strong>Do not delete the old export after import.</strong> Treat it as the source archive until you are satisfied the migration is complete.</p>
      </section>

      <section className="wp-meta-box" id="backups">
        <h2>Backups</h2>
        <h3>Desktop</h3>
        <p>Desktop SabotPress now makes automatic local backups by default. The default schedule is <strong>daily</strong> with the most recent <strong>7</strong> backups retained. Each desktop backup contains a safe SQLite backup plus the local media directory. You can change the frequency, retention, turn automatic backups off, create one immediately, or open the backup folder from the Backups screen.</p>
        <h3>Portable backup</h3>
        <p><strong>Publish Online → Export complete backup</strong> creates a <code>.sabotpress</code> file intended for moving work between browser, desktop, and server editions. Keep at least one portable backup somewhere outside the device running SabotPress.</p>
        <h3>Browser</h3>
        <p>Browsers do not allow a web app to silently write backup files to arbitrary folders in the background. SabotPress therefore reminds browser-local users to export a portable backup. Browser storage persistence helps, but clearing site data can still remove the local publication.</p>
        <h3>Server</h3>
        <p>A server host should schedule infrastructure backups for both database and media. SabotPress also provides a manual verified server snapshot. The application cannot truthfully promise a server backup schedule unless the host has actually configured one.</p>
      </section>

      <section className="wp-meta-box" id="desktop-data">
        <h2>Desktop data and updates</h2>
        <p>The application files and publication data are separate. Reinstalling or upgrading SabotPress normally leaves the publication database, media, backup settings, and automatic backup folder in the operating system's SabotPress application-data directory.</p>
        <p><strong>That is intentional.</strong> Updating the program should never erase somebody's publication. A truly fresh test install requires removing the application-data folder separately after exporting anything you want to keep.</p>
      </section>

      <section className="wp-meta-box" id="browser-data">
        <h2>Browser data</h2>
        <p>Browser-local SabotPress uses IndexedDB for publication records and media rather than miscellaneous content in localStorage. That data normally survives page reloads and browser restarts on the same browser profile.</p>
        <p>It is still local browser storage. Clearing site data, resetting the browser profile, or some device-cleanup tools can remove it. Portable backups are the protection against that class of loss.</p>
      </section>
    </main>
  )
}
