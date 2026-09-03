import { Link, useLocation } from 'react-router-dom'
import sabotPressMasthead from '../assets/sabotpress-masthead.svg'
import { EditableLink } from './EditableLink'
import { editableContentRegistry } from '../lib/editableContentRegistry'
import { publicRoutes } from '../routing/routes'
import { SHOW_AI_CAMPAIGN_LINKS } from '../config/campaignVisibility'
import { useResolvedConfig } from '../lib/useResolvedConfig'
import { getConfiguredBlock, getConfiguredText } from '../lib/publicConfig'

export function PublicationTopbar() {
  const location = useLocation()
  const resolvedConfig = useResolvedConfig()
  const masthead = getConfiguredBlock(resolvedConfig, 'site.masthead') || {}

  const siteTitle = String(getConfiguredText(resolvedConfig, 'site.identity.title', 'SabotPress')).trim() || 'SabotPress'
  const configuredLogo = String(
    masthead.logoUrl ||
    getConfiguredText(resolvedConfig, 'site.identity.logoUrl', '') ||
    ''
  ).trim()
  const logoUrl = configuredLogo || sabotPressMasthead
  const mastheadSize = ['compact', 'medium', 'large'].includes(masthead.size)
    ? masthead.size
    : 'medium'

  const isHome = location.pathname === '/'
  const resolvedMastheadSize = isHome ? mastheadSize : 'compact'

  return (
    <header className={`publication-topbar publication-topbar--masthead publication-topbar--${resolvedMastheadSize}${isHome ? ' publication-topbar--home' : ' publication-topbar--inner'}`}>
      <div className="publication-topbar__inner">
        <div className="publication-topbar__brand">
          <Link
            to="/"
            className="publication-topbar__brand-link publication-topbar__brand-link--isolated"
            aria-label={`${siteTitle} home`}
            title={siteTitle}
          >
            <img
              className="publication-topbar__brand-image publication-topbar__brand-image--isolated"
              src={logoUrl}
              alt={configuredLogo ? siteTitle : 'SabotPress'}
            />
          </Link>

          <nav className="publication-topbar__nav" aria-label="Primary">
            {editableContentRegistry.nav.map((item) => (
              <EditableLink
                defaultHref={item.defaultHref}
                defaultLabel={item.defaultLabel}
                hrefField={item.hrefField}
                key={item.id}
                labelField={item.labelField}
              />
            ))}
            {SHOW_AI_CAMPAIGN_LINKS ? <EditableLink className="publication-topbar__campaign-link" labelField="nav.campaign.label" hrefField="nav.campaign.href" defaultLabel="Campaign" defaultHref={publicRoutes.aiCampaign} /> : null}
            <EditableLink className="publication-topbar__campaigns-link" labelField="nav.campaigns.label" hrefField="nav.campaigns.href" defaultLabel="Campaigns" defaultHref={publicRoutes.campaigns} />
          </nav>
        </div>
      </div>
    </header>
  )
}
