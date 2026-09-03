import { Link } from 'react-router-dom'

function openExternal(url) {
  if (window.sabotDesktop?.openExternal) return window.sabotDesktop.openExternal(url)
  window.open(url, '_blank', 'noopener,noreferrer')
}

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
          <p>Use a supported free hosting tier and its provided address. No domain purchase is required.</p>
          <ol>
            <li>Create a free hosting account.</li>
            <li>Deploy the SabotPress web edition.</li>
            <li>Use the provided public address immediately.</li>
            <li>Connect your own domain later if you ever want one.</li>
          </ol>
          <button className="button button--primary" type="button" onClick={() => openExternal('https://github.com/sabotmedia/sabotpress/blob/main/docs/INSTALL.md')}>Open free setup instructions</button>
        </article>

        <article className="desktop-publish-card">
          <h2>I already own a domain</h2>
          <p>Keep the hosting free and point your existing domain at it. SabotPress will show the DNS record your host expects.</p>
          <Link className="button" to="/sites">Connect my domain</Link>
        </article>

        <article className="desktop-publish-card">
          <h2>Community or collective hosting</h2>
          <p>A compatible community host can run SabotPress for you. This is the closest model to the old bundled Noblogs experience.</p>
          <button className="button" type="button" onClick={() => openExternal('https://github.com/sabotmedia/sabotpress/blob/main/docs/INSTALL.md')}>Hosting requirements</button>
        </article>

        <article className="desktop-publish-card">
          <h2>I have a server</h2>
          <p>Use Docker/VPS or another supported deployment adapter while keeping this desktop copy as your local working installation.</p>
          <button className="button" type="button" onClick={() => openExternal('https://github.com/sabotmedia/sabotpress/blob/main/docs/INSTALL.md')}>Server instructions</button>
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
