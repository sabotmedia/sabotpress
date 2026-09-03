import { Link } from 'react-router-dom'
import { AdminFrame } from './AdminRail'
import { AdminPublicConfigCard } from './AdminPublicConfigCard'
import { RobotVoiceSettingsCard } from './RobotVoiceSettingsCard'
import { PublishingModulesCard } from './PublishingModulesCard'
import { InstallReadinessCard } from './InstallReadinessCard'
import { DesktopPublishOnlineCard } from './DesktopPublishOnlineCard'
import { getPieces } from '../lib/pieces'
import { adminRoutes } from '../routing/routes'
import { publicPageRegistry, withSiteEdit } from '../lib/publicPageRegistry'
import { helpUrl } from '../lib/helpUrl'

export { AdminUsersPage as UsersAdminPage } from './AdminUsersPage'

export function PagesAdminPage() {
  const samplePost = getPieces().find((piece) => piece?.slug)
  const samplePostPath = samplePost?.slug ? `/post/${samplePost.slug}` : '/archive'
  const pages = [
    ...publicPageRegistry.map((page) => ({ title: page.label, slug: page.id, path: page.path, type: page.family })),
    { title: 'Post template', slug: 'post-template', path: samplePostPath, type: 'template' },
  ]

  return (
    <AdminFrame>
      <main className="page wp-admin-screen">
        <div className="wp-screen-header">
          <div>
            <h1>Pages</h1>
            <p className="description">Public pages and the editor that controls each one.</p>
          </div>
        </div>
        <section className="wp-meta-box">
          <table className="content-table wp-posts-table">
            <thead><tr><th>Title</th><th>Slug</th><th>Type</th><th>Path</th></tr></thead>
            <tbody>
              {pages.map((page) => (
                <tr key={page.slug}>
                  <td><strong className="content-table__title">{page.title}</strong><div className="wp-row-actions"><Link to={page.path}>View</Link><Link to={withSiteEdit(page.path)}>Edit live</Link></div></td>
                  <td>{page.slug}</td><td>{page.type}</td><td><code>{page.path}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </AdminFrame>
  )
}

export function SettingsAdminPage() {
  return (
    <AdminFrame>
      <main className="page wp-admin-screen">
        <div className="wp-screen-header">
          <div><h1>Settings</h1><p className="description">Publication settings for normal editors. Advanced infrastructure diagnostics stay in Site Health.</p></div>
          <Link className="button button--primary" to={withSiteEdit('/')}>Edit Live</Link>
        </div>
        <DesktopPublishOnlineCard />
        <PublishingModulesCard />
        <InstallReadinessCard />
        <AdminPublicConfigCard />
        <RobotVoiceSettingsCard />
        <section className="wp-meta-box">
          <h2>More settings</h2>
          <p className="description">Open these only when you need them. Day-to-day publishing does not depend on understanding the underlying infrastructure.</p>
          <div className="review-card__actions">
            <Link className="button" to={adminRoutes.feeds}>Feeds / RSS</Link>
            <Link className="button" to={adminRoutes.podcasts}>Podcasts</Link>
            <Link className="button" to={adminRoutes.backup}>Backups</Link>
            <Link className="button" to={adminRoutes.sites}>Domain setup</Link>
            <Link className="button" to={adminRoutes.siteHealth}>Advanced / Site Health</Link>
            <a className="button" href={helpUrl('install')}>Help</a>
          </div>
        </section>
      </main>
    </AdminFrame>
  )
}
