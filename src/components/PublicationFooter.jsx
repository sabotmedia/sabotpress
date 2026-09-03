import { Link } from 'react-router-dom'
import { EditableLink } from './EditableLink'
import { EditableText } from './EditableText'
import { editableContentRegistry } from '../lib/editableContentRegistry'
import { useAdminAuth } from './AdminAuthContext'
import { publicRoutes } from '../routing/routes'
import { SHOW_AI_CAMPAIGN_LINKS } from '../config/campaignVisibility'
import { getFeaturedPublicProjects } from '../lib/projectCatalog'

export function PublicationFooter() {
  const footer = editableContentRegistry.footer
  const { isAuthenticated, isChecking } = useAdminAuth()
  const projects = getFeaturedPublicProjects()

  return (
    <footer className="publication-footer">
      <div className="publication-footer__top">
        <div className="publication-footer__brand">
          <EditableText as="div" className="publication-footer__eyebrow" field={footer.eyebrow.field}>
            {footer.eyebrow.defaultText}
          </EditableText>
          <EditableText as="h2" field={footer.title.field}>
            {footer.title.defaultText}
          </EditableText>
          <EditableText as="div" className="publication-footer__body" field={footer.body.field} multiline>
            {footer.body.defaultText}
          </EditableText>
        </div>

        {footer.sections.map((section) => (
          <div className="publication-footer__section" key={section.id}>
            {section.id === 'formats' ? (
              <EditableText as="h3" field="footer.projects.title">Projects</EditableText>
            ) : (
              <EditableText as="h3" field={section.titleField}>
                {section.defaultTitle}
              </EditableText>
            )}
            <nav>
              {section.id === 'formats' ? (
                projects.map((project) => (
                  <Link key={project.slug} to={`/archive?project=${encodeURIComponent(project.slug)}`}>
                    {project.name}
                  </Link>
                ))
              ) : (
                section.links.map((link) => (
                  <EditableLink
                    defaultHref={link.defaultHref}
                    defaultLabel={link.defaultLabel}
                    hrefField={link.hrefField}
                    key={link.id}
                    labelField={link.labelField}
                  />
                ))
              )}
              {section.id === 'site' && SHOW_AI_CAMPAIGN_LINKS ? <EditableLink className="publication-footer__campaign-link" labelField="footer.site.campaign.label" hrefField="footer.site.campaign.href" defaultLabel="A/I Campaign" defaultHref={publicRoutes.aiCampaign} /> : null}
              {section.id === 'site' ? <EditableLink labelField="footer.site.gallery.label" hrefField="footer.site.gallery.href" defaultLabel="Gallery" defaultHref="/aberdeen-local-1312-gallery" /> : null}
            </nav>
          </div>
        ))}
      </div>

      <div className="publication-footer__bottom">
        <EditableText as="div" field={footer.bottom.field} multiline>
          {footer.bottom.defaultText}
        </EditableText>
        {!isChecking && !isAuthenticated ? (
          <Link className="publication-footer__login-link" to="/login">Editor login</Link>
        ) : null}
      </div>
    </footer>
  )
}
