import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AdminFrame } from './AdminRail'
import { adminRoutes } from '../routing/routes'

const CORE_ROUTES = [
  ['Home', '/'],
  ['Archive', '/archive'],
  ['Archive project filter', '/archive?project=The%20Communique'],
  ['About', '/about'],
  ['Contact', '/contact'],
  ['Submit', '/submit'],
  ['Support', '/support'],
  ['Security', '/security'],
  ['Missing page', '/qa-missing-route'],
  ['Admin dashboard', '/wp-admin'],
  ['Posts admin', '/wp-admin/posts'],
  ['Media admin', '/wp-admin/media'],
  ['Printlab admin', '/wp-admin/printlab'],
]

const MANUAL_STEPS = [
  'Open the site in a fresh incognito window and confirm no admin toolbar appears.',
  'Visit /wp-admin while logged out and confirm it redirects to /login.',
  'Log in, reload, and confirm the editor session survives refresh.',
  'Open /archive, click a post, and confirm the page starts at the top.',
  'Open /piece/{known-slug} and confirm it redirects to /post/{known-slug}.',
  'Open a missing /post/{bad-slug} and confirm the friendly not-found page appears.',
  'Open /project/{known-slug} and confirm it redirects to the Archive project filter.',
  'Run a keyboard pass: Tab reaches skip link, nav, cards, buttons, and forms with visible focus.',
  'Print a public article and confirm controls are hidden in browser print preview.',
  'Save an editable public page change, reload, and confirm it persists.',
  'Log out and confirm write actions reject missing session.',
]

export function AdminQaPage() {
  const routeRows = useMemo(() => CORE_ROUTES, [])

  return (
    <AdminFrame>
      <main className="page wp-admin-screen admin-qa-page">
        <div className="wp-screen-header">
          <h1>QA Checklist</h1>
          <span className="description">Manual release verification</span>
        </div>

        <section className="wp-meta-box admin-qa-card">
          <h2>Core Routes</h2>
          <div className="admin-qa-route-grid">
            {routeRows.map(([label, path]) => (
              <a key={path} href={path} target="_blank" rel="noreferrer">
                <span>{label}</span>
                <code>{path}</code>
              </a>
            ))}
          </div>
        </section>

        <section className="wp-meta-box admin-qa-card">
          <h2>Manual Test Steps</h2>
          <ol className="admin-qa-steps">
            {MANUAL_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="wp-meta-box admin-qa-card">
          <h2>Pre-release snapshot</h2>
          <p>Use the canonical server-backed backup before a release. It includes the datasets that the former partial QA exports omitted.</p>
          <div className="wp-meta-actions">
            <Link className="button button--primary" to={adminRoutes.backup}>Open System Backup</Link>
          </div>
        </section>
      </main>
    </AdminFrame>
  )
}
