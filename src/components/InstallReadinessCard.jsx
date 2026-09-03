import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSiteHealth } from '../lib/siteHealthApi'
import { loadSites } from '../lib/siteDomains'
import { adminRoutes } from '../routing/routes'

function ReadinessRow({ ready, title, detail, action }) {
  return (
    <li className="install-readiness-card__row">
      <span className={`install-readiness-card__status${ready ? ' is-ready' : ''}`} aria-hidden="true">{ready ? '✓' : '○'}</span>
      <div><strong>{title}</strong><small>{detail}</small></div>
      {action || null}
    </li>
  )
}

export function InstallReadinessCard() {
  const [health, setHealth] = useState(null)
  const [sites, setSites] = useState([])
  const [state, setState] = useState('loading')

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchSiteHealth(), loadSites().catch(() => [])])
      .then(([nextHealth, nextSites]) => {
        if (cancelled) return
        setHealth(nextHealth)
        setSites(Array.isArray(nextSites) ? nextSites : [])
        setState('ready')
      })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [])

  const connectedDomain = useMemo(() => sites.find((site) => site.status === 'connected') || null, [sites])
  const appReady = state === 'ready'
  const databaseReady = Boolean(health?.bindings?.BF_DB) && !(health?.summary?.missingTables || []).length
  const mediaReady = Boolean(health?.bindings?.mediaStorage)
  const httpsReady = health?.summary?.https === true

  return (
    <section className="wp-meta-box install-readiness-card">
      <div><h2>Setup status</h2><p className="description">Normal publishing stays simple. Technical details live in Site Health when somebody actually needs them.</p></div>
      <ul className="install-readiness-card__list">
        <ReadinessRow ready={appReady} title="SabotPress is running" detail={appReady ? 'The application responded normally.' : 'The application health check has not completed.'} />
        <ReadinessRow ready={databaseReady} title="Publication data is persistent" detail={databaseReady ? 'The database is available.' : 'The database still needs attention.'} action={<Link className="button" to={adminRoutes.siteHealth}>Details</Link>} />
        <ReadinessRow ready={mediaReady} title="Uploads are persistent" detail={mediaReady ? 'Media storage is connected.' : 'Persistent media storage is not confirmed.'} action={<Link className="button" to={adminRoutes.siteHealth}>Details</Link>} />
        <ReadinessRow ready={Boolean(connectedDomain)} title="Public address is connected" detail={connectedDomain?.domain || 'You can publish first and connect a domain later.'} action={<Link className="button" to={adminRoutes.sites}>Domain setup</Link>} />
        <ReadinessRow ready={httpsReady} title="HTTPS is active" detail={httpsReady ? 'Visitors are using an encrypted connection.' : 'HTTPS is not confirmed yet.'} />
      </ul>
    </section>
  )
}
