import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PublishingModulesCard } from './PublishingModulesCard'
import { getPublishingSetup, hydratePublishingSetup } from '../lib/publishingModules'

export function DesktopWelcomePage() {
  const navigate = useNavigate()
  const [setup, setSetup] = useState(() => getPublishingSetup())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    hydratePublishingSetup().then((next) => {
      setSetup(next)
      setLoading(false)
      if (next.firstRunComplete) navigate('/wp-admin', { replace: true })
    }).catch(() => setLoading(false))
  }, [navigate])

  if (loading) {
    return <main className="desktop-welcome"><section className="desktop-welcome__panel"><p className="desktop-welcome__eyebrow">SabotPress</p><h1>Getting things ready…</h1></section></main>
  }

  return (
    <main className="desktop-welcome">
      <section className="desktop-welcome__hero">
        <div className="desktop-welcome__mark" aria-hidden="true">S*</div>
        <p className="desktop-welcome__eyebrow">free publishing software</p>
        <h1>Build the publication first. Put it online when you’re ready.</h1>
        <p>SabotPress works on this computer without a domain, paid hosting, GitHub, or a terminal. Choose what kind of publication you want and we’ll keep the rest of the interface out of your way.</p>
      </section>

      <section className="desktop-welcome__steps" aria-label="How setup works">
        <div><strong>1</strong><span>Name your publication</span></div>
        <div><strong>2</strong><span>Choose the tools you need</span></div>
        <div><strong>3</strong><span>Start publishing locally</span></div>
        <div><strong>4</strong><span>Publish online for $0 or connect your domain</span></div>
      </section>

      <PublishingModulesCard onboarding onComplete={(next) => {
        setSetup(next)
        navigate('/publish-online', { replace: true })
      }} />

      <p className="desktop-welcome__footnote">Nothing is uploaded just by finishing this screen. Your publication stays on this computer until you choose a Publish Online option.</p>
    </main>
  )
}
