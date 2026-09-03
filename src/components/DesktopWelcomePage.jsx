import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PublishingModulesCard } from './PublishingModulesCard'
import { getPublishingSetup, hydratePublishingSetup } from '../lib/publishingModules'
import { isBrowserLocalRuntime, isDesktopRuntime } from '../lib/runtime'
import { canPromptPwaInstall, isPwaStandalone, promptPwaInstall, PWA_INSTALL_EVENT } from '../lib/pwaRuntime'
import { requestPersistentBrowserStorage } from '../lib/browserLocalDb'

export function DesktopWelcomePage() {
  const navigate = useNavigate()
  const browserLocal = isBrowserLocalRuntime()
  const desktop = isDesktopRuntime()
  const [setup, setSetup] = useState(() => getPublishingSetup())
  const [loading, setLoading] = useState(true)
  const [installAvailable, setInstallAvailable] = useState(() => canPromptPwaInstall())
  const [showSetup, setShowSetup] = useState(() => desktop)

  useEffect(() => {
    hydratePublishingSetup().then((next) => {
      setSetup(next)
      setLoading(false)
      if (next.firstRunComplete) navigate('/wp-admin', { replace: true })
    }).catch(() => setLoading(false))
  }, [navigate])

  useEffect(() => {
    if (!browserLocal) return undefined
    const update = (event) => setInstallAvailable(Boolean(event?.detail?.available || canPromptPwaInstall()))
    window.addEventListener(PWA_INSTALL_EVENT, update)
    return () => window.removeEventListener(PWA_INSTALL_EVENT, update)
  }, [browserLocal])

  if (loading) {
    return <main className="desktop-welcome"><section className="desktop-welcome__panel"><p className="desktop-welcome__eyebrow">SabotPress</p><h1>Getting things ready…</h1></section></main>
  }

  return (
    <main className="desktop-welcome">
      <section className="desktop-welcome__hero">
        <div className="desktop-welcome__mark" aria-hidden="true">S*</div>
        <p className="desktop-welcome__eyebrow">free publishing software</p>
        <h1>Build the publication first. Put it online when you’re ready.</h1>
        <p>{browserLocal ? 'Start in this browser without an account, domain, download, or paid hosting. Your work stays on this device until you explicitly export or publish it.' : 'SabotPress works on this computer without a domain, paid hosting, GitHub, or a terminal. Choose what kind of publication you want and we’ll keep the rest of the interface out of your way.'}</p>
      </section>

      {browserLocal && !showSetup ? (
        <section className="browser-start-grid" aria-label="Ways to use SabotPress">
          <article className="browser-start-card browser-start-card--primary">
            <h2>Start on this device</h2>
            <p>Free. No account. No install. Publication data and media are stored in this browser.</p>
            <button className="button button--primary" type="button" onClick={async () => { await requestPersistentBrowserStorage(); setShowSetup(true) }}>Start a publication</button>
          </article>
          <article className="browser-start-card">
            <h2>Install SabotPress</h2>
            <p>Install the same local-first web app from your browser. It still stores the publication on this device.</p>
            {isPwaStandalone() ? <span className="description">SabotPress is already running as an installed app.</span> : <button className="button" type="button" disabled={!installAvailable} onClick={() => promptPwaInstall()}>{installAvailable ? 'Install app' : 'Install option appears when your browser supports it'}</button>}
          </article>
          <article className="browser-start-card">
            <h2>Use the desktop app</h2>
            <p>Better for large local media libraries, heavier AudioLab or PrintLab work, filesystem access, and offline-heavy use.</p>
            <a className="button" href="https://github.com/sabotmedia/sabotpress/releases" target="_blank" rel="noreferrer">Desktop downloads</a>
          </article>
          <article className="browser-start-card">
            <h2>Run SabotPress on a server</h2>
            <p>Self-host the web edition when you want a shared multi-user publication and server-backed storage.</p>
            <a className="button" href="/help.html#server">Self-hosting guide</a>
          </article>
        </section>
      ) : null}

      {showSetup ? (
        <>
          <section className="desktop-welcome__steps" aria-label="How setup works">
            <div><strong>1</strong><span>Name your publication</span></div>
            <div><strong>2</strong><span>Choose the tools you need</span></div>
            <div><strong>3</strong><span>Start publishing locally</span></div>
            <div><strong>4</strong><span>Export, install, or publish when ready</span></div>
          </section>
          <PublishingModulesCard onboarding onComplete={(next) => {
            setSetup(next)
            navigate(browserLocal ? '/wp-admin' : '/publish-online', { replace: true })
          }} />
          <p className="desktop-welcome__footnote">Nothing is uploaded by finishing setup. {browserLocal ? 'Clearing this browser’s site data can remove your publication, so SabotPress will remind you to export backups.' : 'Your publication stays on this computer until you choose a Publish Online option.'}</p>
        </>
      ) : null}
    </main>
  )
}
