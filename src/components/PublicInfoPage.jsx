import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicationTopbar } from './PublicationTopbar'
import { PublicationFooter } from './PublicationFooter'
import { EditableText } from './EditableText'
import { getEditablePage } from '../lib/editableContentRegistry'
import { getPublicInfoCopy, getPublicInfoField } from '../content/publicInfoCopy'
import { SecureContactForm } from './SecureContactForm'
import { EditableLink } from './EditableLink'
import { PUBLICATION_IDENTITY, getFeaturedPublicProjects } from '../lib/projectCatalog'
import { findMediaProjectLogo, getAboutProjectLogo } from '../lib/aboutProjectLogos'
import '../about-project-directory.css'

const CONTACT_CHANNELS = [
  { label: 'News tips, documents, and leads', address: '' },
  { label: 'Submissions and pitches', address: 'submit@sabot.media' },
  { label: 'Press and interview requests', address: '' },
  { label: 'Support and material help', address: '' },
]

function ContactChannels() {
  return (
    <div className="contact-channels">
      <section className="contact-channel contact-channel--general" aria-labelledby="general-contact-title">
        <div>
          <EditableText as="p" className="contact-channel__label" id="general-contact-title" field="info.contact.channels.general.label">General correspondence, corrections, collaboration, and questions</EditableText>
          <EditableLink labelField="info.contact.channels.general.address" hrefField="info.contact.channels.general.href" defaultLabel="" defaultHref="mailto:" />
        </div>
        <SecureContactForm />
      </section>

      <div className="contact-channel-grid" aria-label="Other SabotPress contact addresses">
        {CONTACT_CHANNELS.map((channel) => (
          <section className="contact-channel" key={channel.address}>
            <EditableText as="p" className="contact-channel__label" field={`info.contact.channels.${channel.address.split('@')[0]}.label`}>{channel.label}</EditableText>
            <EditableLink labelField={`info.contact.channels.${channel.address.split('@')[0]}.address`} hrefField={`info.contact.channels.${channel.address.split('@')[0]}.href`} defaultLabel={channel.address} defaultHref={`mailto:${channel.address}`} />
          </section>
        ))}
      </div>
    </div>
  )
}

function ProjectDirectory() {
  const projects = useMemo(() => getFeaturedPublicProjects(), [])
  const [mediaAssets, setMediaAssets] = useState([])

  useEffect(() => {
    let cancelled = false

    fetch('/api/media-assets?mediaType=image', { headers: { accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled && Array.isArray(payload?.items)) setMediaAssets(payload.items)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="project-directory" aria-labelledby="project-directory-title">
      <header className="project-directory__header">
        <div>
          <div className="project-directory__brand project-directory__publication-brand">
            <img src={PUBLICATION_IDENTITY.logoUrl} alt={`${PUBLICATION_IDENTITY.name} logo`} />
          </div>
          <p className="project-directory__eyebrow">Projects</p>
          <h2 id="project-directory-title">Our projects</h2>
        </div>
        <p>
          SabotPress is one archive made from distinct publishing projects. Each project has its own identity,
          purpose, and form, while remaining searchable as part of the same body of work.
        </p>
      </header>

      <div className="project-directory__grid">
        {projects.map((project) => {
          const logoUrl = findMediaProjectLogo(project, mediaAssets) || getAboutProjectLogo(project)
          return (
            <article className="project-directory__card" key={project.slug}>
              <div className="project-directory__brand">
                {logoUrl ? (
                  <img src={logoUrl} alt={`${project.name} logo`} loading="lazy" />
                ) : (
                  <span className="project-directory__wordmark">{project.name}</span>
                )}
              </div>
              <div className="project-directory__body">
                <p className="project-directory__format">{project.format}</p>
                <h3>{project.name}</h3>
                <p>{project.description}</p>
                <Link className="project-directory__link" to={`/archive?project=${encodeURIComponent(project.slug)}`}>
                  Browse project →
                </Link>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function PublicInfoPage({ page = 'about' }) {
  const editablePage = getEditablePage(page)
  const currentCopy = getPublicInfoCopy(page)

  const eyebrowField = getPublicInfoField(page, 'eyebrow', editablePage.eyebrow.field)
  const titleField = getPublicInfoField(page, 'title', editablePage.title.field)
  const bodyField = getPublicInfoField(page, 'body', editablePage.body.field)

  return (
    <main className="page public-info-page">
      <PublicationTopbar />
      <section className="project-hero public-info-page__hero">
        <EditableText
          as="div"
          className="project-hero__eyebrow"
          field={eyebrowField}
        >
          {currentCopy?.eyebrow || editablePage.eyebrow.defaultText}
        </EditableText>
        <EditableText as="h1" field={titleField}>
          {currentCopy?.title || editablePage.title.defaultText}
        </EditableText>
        <EditableText
          as="div"
          className="project-hero__description"
          field={bodyField}
          multiline
        >
          {currentCopy?.body || editablePage.body.defaultText}
        </EditableText>
        {page === 'contact' ? <ContactChannels /> : null}
      </section>
      {page === 'about' ? <ProjectDirectory /> : null}
      <PublicationFooter />
    </main>
  )
}
