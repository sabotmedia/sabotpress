import { Link } from 'react-router-dom'

export function DesktopPublishOnlinePage() {
  return (
    <main className="desktop-welcome desktop-publish-online">
      <section className="desktop-welcome__hero">
        <div className="desktop-welcome__mark" aria-hidden="true">S*</div>
        <p className="desktop-welcome__eyebrow">publish online</p>
        <h1>Your publication is ready. Putting it online can still cost $0.</h1>
        <p>You do not need a custom domain to publish. Start with a free hosting address, connect a domain you already own later, or deploy to a server you control.</p>
      </section>

      <section className="desktop-publish-grid">
        <article className="desktop-publish-card desktop-publish-card--recommended">
          <span className="desktop-publish-card__tag">recommended first</span>
          <h2>Publish for $0</h2>
          <p>The current tested no-cost route uses a free web host with a provided public address. A custom domain is optional.</p>
          <ol>
            <li>Create a free account with a compatible host. Cloudflare Pages/Workers with D1/R2-compatible storage is the currently tested route.</li>
            <li>Create a new SabotPress web deployment from this project.</li>
            <li>Use the host-provided address immediately. You do not need to buy a domain.</li>
            <li>If you already own a domain, connect it later from Sites &amp; Domains.</li>
          </ol>
          <details className="desktop-publish-details">
            <summary>What this does and does not do</summary>
            <p>SabotPress desktop keeps your working copy on this computer. Publishing online creates a separate hosted copy. The desktop app does not silently upload your work, and this version does not yet provide one-click account creation or cloud deployment.</p>
          </details>
        </article>

        <article className="desktop-publish-card">
          <h2>I already own a domain</h2>
          <p>Keep the hosting free and point your existing domain at it. SabotPress will show the DNS record your host expects.</p>
          <Link className="button" to="/sites">Connect my domain</Link>
        </article>

        <article className="desktop-publish-card">
          <h2>Community or collective hosting</h2>
          <p>A compatible community host can run SabotPress for you. This is the closest model to the old bundled Noblogs experience.</p>
          <details className="desktop-publish-details">
            <summary>Hosting requirements</summary>
            <p>A host needs the SabotPress web app plus persistent database and media storage. The current web edition supports D1/R2-compatible storage, and server deployments can use the documented adapters.</p>
          </details>
        </article>

        <article className="desktop-publish-card">
          <h2>I have a server</h2>
          <p>Use Docker/VPS or another supported deployment adapter while keeping this desktop copy as your local working installation.</p>
          <details className="desktop-publish-details">
            <summary>Server route</summary>
            <p>This is the advanced option. It is intended for people already comfortable managing a server. Ordinary desktop users do not need it.</p>
          </details>
        </article>
      </section>

      <section className="desktop-publish-online__actions">
        <Link className="button button--primary" to="/wp-admin">Go to my newsroom</Link>
        <Link className="button" to="/">Preview my site</Link>
        <p>Your local copy remains local until you explicitly deploy or upload it.</p>
      </section>
    </main>
  )
}
