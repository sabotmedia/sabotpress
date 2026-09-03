import { Children, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { PublicationTopbar } from './PublicationTopbar'
import { PublicationFooter } from './PublicationFooter'
import { loadCampaign, loadCampaignMonitor } from '../lib/campaignsApi'
import { loadPublishedNativePieces } from '../lib/nativePublicFeed'
import { selectHubCoverage } from '../lib/campaignCoverage'
import { setDocumentMeta } from '../lib/documentMeta'
import { EditableText } from './EditableText'
import { EditableLink } from './EditableLink'
import { CampaignBenefitToolkit, CampaignDispatches, CampaignDonation, CampaignQuestionForm, CampaignSocialArchive } from './CampaignCorrespondence'

const AI_CAMPAIGN_SLUG = 'example-campaign'
const CAMPAIGN_SECTION_ORDER = ['status', 'reporting', 'letters', 'act', 'graphics', 'updates', 'timeline', 'coverage', 'sources', 'faq', 'translations', 'signatories', 'social', 'donate', 'socialArchive', 'dispatches', 'questions', 'benefit']
const CAMPAIGN_SECTION_META = {
  donate: { nav: 'Donate', title: 'Donate' },
  socialArchive: { nav: 'Social archive', title: 'Social media archive' },
  dispatches: { nav: 'Dispatches', title: 'Dispatches' },
  questions: { nav: 'Ask', title: 'Ask a question' },
  benefit: { nav: 'Organize', title: 'Organize a benefit' },
  status: { nav: 'Status', title: 'Campaign status' },
  reporting: { nav: 'Reporting', title: 'Reporting and context' },
  letters: { nav: 'Letters', title: 'Letters and resources' },
  act: { nav: 'Act', title: 'Take action' },
  graphics: { nav: 'Graphics', title: 'Campaign media kit' },
  updates: { nav: 'Updates', title: 'Campaign updates' },
  timeline: { nav: 'Timeline', title: 'Campaign timeline' },
  coverage: { nav: 'Coverage', title: 'Coverage and statements' },
  sources: { nav: 'Sources', title: 'Primary sources' },
  faq: { nav: 'FAQ', title: 'Frequently asked questions' },
  translations: { nav: 'Translations', title: 'Translations' },
  signatories: { nav: 'Signers', title: 'Signatories' },
  social: { nav: 'Social', title: 'Social updates' },
}
const AI_CAMPAIGN_SECTION_TITLES = {
  status: 'What is happening now', reporting: 'Read before you repeat', letters: 'Read it. Sign it. Send it.',
  act: 'Do something useful', graphics: 'Take the graphics', updates: 'Campaign log', timeline: 'How we got here',
  coverage: 'Coverage and statements', sources: 'Check the receipts', faq: 'The questions people keep asking',
  translations: 'Circulate it further', signatories: 'Who has signed', social: 'Follow the signal, not the algorithm',
}
const ITALY_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
const ITALY_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const ITALY_ZONE_FORMAT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', timeZoneName: 'short' })
const GAZA_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Gaza', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
const GAZA_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Gaza', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const GAZA_ZONE_FORMAT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Gaza', timeZoneName: 'short' })

export function CampaignPage() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const campaignSlug = slug || AI_CAMPAIGN_SLUG
  const previewDraft = searchParams.get('preview') === '1'
  const isAiCampaign = campaignSlug === AI_CAMPAIGN_SLUG
  const [campaign, setCampaign] = useState(null)
  const [pieces, setPieces] = useState([])
  const [monitor, setMonitor] = useState({ state: 'loading', data: null })
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [copyState, setCopyState] = useState('')

  useEffect(() => {
    let cancelled = false
    let hasLoaded = false
    async function refreshDashboard() {
      try {
        const [loadedCampaign, loadedPieces] = await Promise.all([
          loadCampaign(campaignSlug, { includeDrafts: previewDraft }),
          loadPublishedNativePieces().catch(() => []),
        ])
        if (cancelled) return
        setCampaign(loadedCampaign)
        setPieces(Array.isArray(loadedPieces) ? loadedPieces : [])
        setError('')
        hasLoaded = true
      } catch (err) {
        if (!cancelled && !hasLoaded) setError(String(err?.message || err))
      }
    }
    refreshDashboard()
    const timer = window.setInterval(refreshDashboard, 300000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [campaignSlug, previewDraft])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!campaign?.monitorUrl) {
      setMonitor({ state: 'unavailable', data: null })
      return undefined
    }
    let cancelled = false
    async function refresh() {
      try {
        const data = await loadCampaignMonitor(campaignSlug)
        if (!cancelled) setMonitor({ state: data?.ok ? 'loaded' : 'unavailable', data })
      } catch (err) {
        if (!cancelled) setMonitor({ state: 'unavailable', data: { error: String(err?.message || err) } })
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 60000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [campaign?.monitorUrl, campaignSlug])

  useEffect(() => {
    if (!campaign) return
    setDocumentMeta({
      title: campaign.title,
      description: campaign.deck || campaign.summary || campaign.shortTitle,
      canonicalPath: `/campaigns/${campaign.slug}`,
      image: campaign.heroImage || '/sabot-logo.png',
      type: 'website',
    })
  }, [campaign])

  const campaignPieces = useMemo(() => findCampaignPieces(pieces, campaign), [pieces, campaign])
  const letterPieces = campaignPieces.filter((piece) => /letter/i.test(String(piece.title || '')))
  const reportingPieces = campaignPieces.filter((piece) => !letterPieces.includes(piece))
  const graphics = useMemo(() => mergeGraphics(campaign?.graphics || [], campaignPieces), [campaign, campaignPieces])
  const updates = useMemo(() => sortByDate(campaign?.updates || [], false), [campaign])
  const coverage = useMemo(() => selectHubCoverage(campaign?.coverage || []), [campaign])
  const featuredCoverage = coverage.filter((item) => item.editorialStatus === 'featured')
  const automaticCoverage = coverage.filter((item) => item.editorialStatus !== 'featured' && item.editorialStatus !== 'hidden')
  const social = useMemo(() => sortByDate(campaign?.social || []), [campaign])
  const signatories = campaign?.signatories || []
  const reportingResources = (campaign?.resources || []).filter((item) => !/letter|template/i.test(`${item.type} ${item.title}`))
  const letterResources = (campaign?.resources || []).filter((item) => /letter|template/i.test(`${item.type} ${item.title}`))
  const deadline = campaign?.deadline ? new Date(campaign.deadline).getTime() : NaN
  const countdown = Number.isFinite(deadline) ? formatCountdown(deadline - now) : null

  async function copyCampaignLink() {
    const url = window.location.href.split('#')[0]
    try {
      await navigator.clipboard.writeText(url)
      setCopyState('Copied')
      window.setTimeout(() => setCopyState(''), 1800)
    } catch {
      setCopyState('Copy failed')
    }
  }

  async function shareCampaign() {
    const url = window.location.href.split('#')[0]
    if (navigator.share) {
      try {
        await navigator.share({ title: campaign?.title || 'Campaign', text: campaign?.shortTitle || campaign?.deck || 'Campaign hub', url })
        return
      } catch { /* user cancelled or sharing is unavailable */ }
    }
    copyCampaignLink()
  }

  if (error) {
    return (
      <main className="page campaign-page campaign-page--error">
        <PublicationTopbar />
        <section className="campaign-shell campaign-error">
          <EditableText as="p" className="campaign-kicker" field="campaign.system.error.eyebrow">CAMPAIGN HUB</EditableText>
          <EditableText as="h1" field="campaign.system.error.title">Campaign data unavailable</EditableText>
          <p>{error}</p>
        </section>
        <PublicationFooter />
      </main>
    )
  }

  if (!campaign) {
    return (
      <main className="page campaign-page campaign-page--loading">
        <PublicationTopbar />
        <section className="campaign-shell campaign-loading">
          <EditableText as="p" className="campaign-kicker" field="campaign.system.loading.eyebrow">CAMPAIGN HUB</EditableText>
          <EditableText as="h1" field="campaign.system.loading.title">Loading campaign...</EditableText>
        </section>
        <PublicationFooter />
      </main>
    )
  }

  const latestPinned = updates.filter((item) => item.pinned).at(-1)
  const latestUpdate = updates.at(-1)
  const pinnedUpdate = new Date(latestUpdate?.date || 0) > new Date(latestPinned?.date || 0) ? latestUpdate : (latestPinned || latestUpdate)
  const isPastDeadline = Number.isFinite(deadline) && deadline <= now
  const sectionOrder = normalizeSectionOrder(campaign.sectionOrder)
  const hiddenSections = new Set(campaign.hiddenSections || [])
  const sectionContent = {
    donate: Boolean(campaign.donation?.url),
    socialArchive: Boolean(campaign.correspondence?.enabled),
    dispatches: Boolean(campaign.correspondence?.enabled),
    questions: Boolean(campaign.correspondence?.enabled && campaign.correspondence?.publicQuestions),
    benefit: campaign.campaignType === 'direct-aid',
    status: true,
    reporting: reportingPieces.length > 0 || reportingResources.length > 0,
    letters: letterPieces.length > 0 || letterResources.length > 0,
    act: (campaign.actions || []).length > 0,
    graphics: graphics.length > 0,
    updates: updates.length > 0,
    timeline: (campaign.timeline || []).length > 0,
    coverage: coverage.length > 0 || isAiCampaign || Boolean(campaign.automation?.enabled && campaign.automation?.coverageFeeds?.length),
    sources: (campaign.sources || []).length > 0,
    faq: (campaign.faq || []).length > 0,
    translations: (campaign.translations || []).length > 0,
    signatories: signatories.length > 0 || Boolean(campaign.automation?.enabled && campaign.automation?.signatoriesUrl),
    social: social.length > 0 || isAiCampaign || Boolean(campaign.automation?.enabled && (campaign.automation?.blueskyActors?.length || campaign.automation?.mastodonAccounts?.length)),
  }
  const visibleSections = sectionOrder.filter((key) => !hiddenSections.has(key) && sectionContent[key])
  const showSection = (key) => visibleSections.includes(key)
  const sectionTitle = (key) => campaign.sectionTitles?.[key] || (isAiCampaign ? AI_CAMPAIGN_SECTION_TITLES[key] : '') || CAMPAIGN_SECTION_META[key]?.title || key

  return (
    <main className="page campaign-page" data-campaign={campaign.slug}>
      <PublicationTopbar />

      <section className="campaign-hero" id="top">
        <div className="campaign-hero__noise" aria-hidden="true" />
        {campaign.slug === 'example-campaign' ? <div className="campaign-hero__watermelon-seeds" aria-hidden="true"><i /><i /><i /><i /><i /></div> : null}
        <div className="campaign-shell campaign-hero__inner">
          <div className="campaign-hero__copy">
            <div className="campaign-hero__flags">
              <span className="campaign-stamp">{campaign.kicker || 'CAMPAIGN'}</span>
              <span className={`campaign-status campaign-status--${campaign.lifecycleStatus || (['completed', 'archived'].includes(campaign.campaignStatus) ? 'inactive' : 'active')}`}>{campaign.lifecycleStatus || (['completed', 'archived'].includes(campaign.campaignStatus) ? 'inactive' : 'active')}</span>
            </div>
            <EditableText as="h1" field={`campaign.${campaign.slug}.hero.title`}>{campaign.title}</EditableText>
            <EditableText as="p" className="campaign-hero__short" field={`campaign.${campaign.slug}.hero.short-title`}>{campaign.shortTitle}</EditableText>
            <EditableText as="p" className="campaign-hero__deck" field={`campaign.${campaign.slug}.hero.deck`} multiline>{campaign.deck}</EditableText>
            <div className="campaign-hero__actions">
              {campaign.donation?.url ? <a className="campaign-button campaign-button--light" href={campaign.donation.url} target="_blank" rel="noreferrer">{campaign.donation.label || 'Donate'} ↗</a> : null}
              {campaign.slug === 'example-campaign' && showSection('benefit') ? <a className="campaign-button campaign-button--benefit" href="#benefit">Organize a benefit</a> : null}
              {showSection('reporting') ? <EditableLink className="campaign-button campaign-button--light" labelField={`campaign.${campaign.slug}.actions.reporting.label`} hrefField={`campaign.${campaign.slug}.actions.reporting.href`} defaultLabel="Read the reporting" defaultHref="#reporting" /> : null}
              {showSection('letters') ? <EditableLink className="campaign-button campaign-button--dark" labelField={`campaign.${campaign.slug}.actions.letters.label`} hrefField={`campaign.${campaign.slug}.actions.letters.href`} defaultLabel="Read the letters" defaultHref="#letters" /> : null}
              <button className="campaign-button campaign-button--ghost" type="button" onClick={shareCampaign}><EditableText as="span" field={`campaign.${campaign.slug}.actions.share.label`}>Share campaign</EditableText></button>
            </div>
            {campaign.partners?.length ? <p className="campaign-hero__partners">Independent campaign by {campaign.partners.join(' × ')}</p> : null}
          </div>

        </div>
      </section>

      <nav className="campaign-local-nav" aria-label="Campaign sections">
        <div className="campaign-shell">
          {visibleSections.map((key) => <a href={`#${key}`} key={key}>{CAMPAIGN_SECTION_META[key]?.nav || key}</a>)}
        </div>
      </nav>

      {campaign.slug === 'example-campaign' ? <section className="campaign-gaza-time-band"><div className="campaign-shell"><GazaClock /></div></section> : null}

      {pinnedUpdate && showSection('updates') ? (
        <section className="campaign-latest">
          <div className="campaign-shell campaign-latest__inner">
            <span>LATEST</span>
            <time dateTime={pinnedUpdate.date}>{formatDateTime(pinnedUpdate.date)}</time>
            <strong>{pinnedUpdate.title}</strong>
            <p>{pinnedUpdate.body}</p>
            {pinnedUpdate.url ? <SmartLink href={pinnedUpdate.url}>Open update</SmartLink> : null}
          </div>
        </section>
      ) : null}

      <OrderedCampaignSections order={sectionOrder}>
      {showSection('donate') ? <CampaignDonation campaign={campaign} sectionKey="donate" /> : null}
      {showSection('socialArchive') ? <CampaignSocialArchive campaign={campaign} sectionKey="socialArchive" /> : null}
      {showSection('benefit') ? <CampaignBenefitToolkit campaign={campaign} sectionKey="benefit" /> : null}
      {showSection('dispatches') ? <CampaignDispatches campaign={campaign} sectionKey="dispatches" /> : null}
      {showSection('questions') ? <CampaignQuestionForm campaign={campaign} sectionKey="questions" /> : null}
      {showSection('status') ? <section className="campaign-section campaign-section--status" id="status">
        <div className="campaign-shell">
          <SectionHeading sectionKey="status" eyebrow="LIVE CAMPAIGN DASHBOARD" title={sectionTitle('status')} />
          {isAiCampaign ? <ItalyClock /> : null}
          <div className="campaign-status-grid">
            {Number.isFinite(deadline) ? <article className="campaign-metric campaign-metric--deadline">
              <span className="campaign-metric__label">{formatDeadlineLabel(campaign.deadline, campaign.deadlineTimeZone)}</span>
              <strong>{isPastDeadline ? 'Deadline passed' : countdown?.primary || 'Tracking deadline'}</strong>
              <p>{isPastDeadline ? 'This page remains the permanent campaign record. Updates continue below.' : countdown?.secondary || 'Campaign deadline'}</p>
            </article> : null}
            {campaign.monitorUrl ? <MonitorCard monitor={monitor} sourceUrl={campaign.monitorUrl} label={campaign.monitorLabel} /> : null}
            <article className="campaign-metric">
              <span className="campaign-metric__label">CAMPAIGN FEED</span>
              <strong>Follow every update</strong>
              <p>Campaign updates have their own direct RSS feed, because an organizing campaign should not require an algorithm to remain visible.</p>
              <a href={`/feeds/campaigns/${campaign.slug}.xml`}>Subscribe to RSS ↗</a>
            </article>
          </div>
        </div>
      </section> : null}

      {showSection('reporting') ? <section className="campaign-section" id="reporting">
        <div className="campaign-shell">
          <SectionHeading sectionKey="reporting" eyebrow="REPORTING + CONTEXT" title={sectionTitle('reporting')} description="The campaign is anchored in reporting and source material. These are the Sabot pieces connected to this campaign." />
          <PieceGrid pieces={reportingPieces} empty="Campaign reporting will appear here as relevant published posts are detected." />
          <ResourceStrip resources={reportingResources} />
        </div>
      </section> : null}

      {showSection('letters') ? <section className="campaign-section campaign-section--paper" id="letters">
        <div className="campaign-shell">
          <SectionHeading sectionKey="letters" eyebrow="LETTERS" title={sectionTitle('letters')} description="Use the organizational letter or the individual template, then send it directly to the relevant institutions and decision-makers." />
          <PieceGrid pieces={letterPieces} empty="Letter downloads are temporarily unavailable. The reporting section remains available while they are restored." />
          <ResourceStrip resources={letterResources} />
        </div>
      </section> : null}

      {showSection('act') ? <section className="campaign-section campaign-section--act" id="act">
        <div className="campaign-shell">
          <SectionHeading sectionKey="act" eyebrow="NOW THAT YOU KNOW" title={sectionTitle('act')} description="Reporting first. Letters next. Direct action follows." />
          <div className="campaign-action-grid">
            {(campaign.actions || []).map((action, index) => (
              <article className="campaign-action-card" key={action.id || index}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{action.title}</h3>
                <p>{action.body}</p>
                <SmartLink href={action.href || '#'}>{action.label || 'Open'}</SmartLink>
              </article>
            ))}
          </div>
        </div>
      </section> : null}

      {showSection('updates') ? <section className="campaign-section campaign-section--updates" id="updates">
        <div className="campaign-shell">
          <SectionHeading sectionKey="updates" eyebrow="LIVE UPDATES" title={sectionTitle('updates')} description="A dated record of statements, publications, deadlines, and material changes in the campaign." />
          <div className="campaign-update-list">
            {updates.length ? updates.map((item) => (
              <article className={`campaign-update${item.pinned ? ' is-pinned' : ''}`} key={item.id}>
                <div className="campaign-update__date"><time dateTime={item.date}>{formatDate(item.date)}</time>{item.pinned ? <span>PINNED</span> : null}</div>
                <div><h3>{item.title}</h3><p>{item.body}</p>{item.url ? <SmartLink href={item.url}>Source / more ↗</SmartLink> : null}</div>
              </article>
            )) : <EmptyState>Updates will appear here as the campaign develops.</EmptyState>}
          </div>
        </div>
      </section> : null}

      {showSection('graphics') ? <section className="campaign-section" id="graphics">
        <div className="campaign-shell">
          <SectionHeading sectionKey="graphics" eyebrow="CAMPAIGN KIT" title={sectionTitle('graphics')} description="Download, repost, print and remix. Each card includes its full-resolution original, accessible alt text and a ready-to-use caption." />
          {graphics.length ? (
            <div className="campaign-graphics-grid">
              {graphics.map((graphic) => (
                <figure className="campaign-graphic" key={graphic.id || graphic.imageUrl}>
                  <a href={graphic.downloadUrl || graphic.imageUrl} target="_blank" rel="noreferrer"><img src={graphic.imageUrl} alt={graphic.alt || ''} loading="lazy" /></a>
                  <figcaption><strong>{graphic.title || 'Campaign graphic'}</strong>{graphic.caption ? <p>{graphic.caption}</p> : null}<div className="campaign-graphic__actions"><a href={graphic.downloadUrl || graphic.imageUrl} target="_blank" rel="noreferrer" download>Open / download ↗</a>{graphic.sourceUrl ? <a href={graphic.sourceUrl} target="_blank" rel="noreferrer">View original post ↗</a> : null}<CopyButton value={graphic.alt} label="Copy alt text" /><CopyButton value={graphic.caption} label="Copy caption" /></div></figcaption>
                </figure>
              ))}
            </div>
          ) : null}
        </div>
      </section> : null}

      {showSection('timeline') ? (
        <section className="campaign-section campaign-section--timeline" id="timeline">
          <div className="campaign-shell">
            <SectionHeading sectionKey="timeline" eyebrow="TIMELINE" title={sectionTitle('timeline')} />
            <div className="campaign-timeline">
              {sortByDate(campaign.timeline, false).map((item) => <article key={item.id}><time>{formatDate(item.date)}</time><div><h3>{item.title}</h3><p>{item.body}</p></div></article>)}
            </div>
          </div>
        </section>
      ) : null}

      {showSection('coverage') ? <section className="campaign-section" id="coverage">
        <div className="campaign-shell">
          <SectionHeading sectionKey="coverage" eyebrow="PRESS + RESPONSE" title={sectionTitle('coverage')} description={isAiCampaign ? 'Official dispatches and international coverage of the designation and its consequences. Italian-language material is labeled, with an English rendering where one is available.' : 'Reporting, statements, and media coverage connected to this campaign.'} />
          {isAiCampaign ? <CampaignTrackerStatus campaign={campaign} /> : null}
          {featuredCoverage.length ? <div className="campaign-coverage-group campaign-coverage-group--featured"><h3>Featured Coverage</h3><LinkList items={featuredCoverage.map(coverageLinkItem)} /></div> : null}
          {automaticCoverage.length ? <div className="campaign-coverage-group campaign-coverage-group--automatic"><h3>Automated Coverage Feed</h3><LinkList items={automaticCoverage.map(coverageLinkItem)} /><p className="campaign-coverage-disclaimer">Links in this section are collected automatically for public awareness and research. Inclusion does not constitute endorsement by SabotPress or indicate that we have independently verified the reporting.</p></div> : null}
          {!coverage.length ? <EmptyState>No additional campaign coverage is available yet.</EmptyState> : null}
          {!isAiCampaign && campaign.automationErrors?.some((item) => item.kind === 'coverage') ? <p className="campaign-source-error">Some configured coverage sources are temporarily unavailable. Editorial campaign material remains available.</p> : null}
          {isAiCampaign ? <div className="campaign-coverage-archive-link">
            <Link className="campaign-button campaign-button--dark" to="/campaigns/example-campaign/coverage">Browse the full coverage archive{campaign.coverageArchiveCount ? ` (${campaign.coverageArchiveCount})` : ''} →</Link>
            <p>The hub keeps the strongest current items in view. The archive preserves the wider record with search, outlet and language filters.</p>
          </div> : null}
        </div>
      </section> : null}

      {showSection('sources') ? <section className="campaign-section campaign-section--sources" id="sources">
        <div className="campaign-shell">
          <SectionHeading sectionKey="sources" eyebrow="PRIMARY SOURCES" title={sectionTitle('sources')} description={isAiCampaign ? 'Government material, A/I statements, legal analysis, historical documents, and other primary sources are gathered here for direct verification.' : 'Primary documents and source material are gathered here for direct verification.'} />
          {campaign.sources?.length ? <LinkList items={campaign.sources.map((item) => ({ id: item.id, eyebrow: item.publisher, title: item.title, body: item.note, url: item.url }))} /> : <p className="campaign-reader-note">The reporting above retains its article-level citations and primary-source links.</p>}
        </div>
      </section> : null}

      {showSection('faq') ? (
        <section className="campaign-section campaign-section--faq" id="faq">
          <div className="campaign-shell">
            <SectionHeading sectionKey="faq" eyebrow="FAQ" title={sectionTitle('faq')} />
            <div className="campaign-faq">
              {campaign.faq.map((item) => <details key={item.id}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
            </div>
          </div>
        </section>
      ) : null}

      {showSection('translations') ? (
        <section className="campaign-section" id="translations">
          <div className="campaign-shell"><SectionHeading sectionKey="translations" eyebrow="TRANSLATIONS" title={sectionTitle('translations')} /><LinkList items={campaign.translations.map((item) => ({ id: item.id, eyebrow: item.language, title: item.title, url: item.url }))} /></div>
        </section>
      ) : null}

      {showSection('signatories') ? <SignatoryCarousel signatories={signatories} title={sectionTitle('signatories')} sectionKey="signatories" /> : null}

      {showSection('social') ? <SocialSection campaign={campaign} social={social} copyState={copyState} copyCampaignLink={copyCampaignLink} isAiCampaign={isAiCampaign} title={sectionTitle('social')} sectionKey="social" /> : null}
      </OrderedCampaignSections>

      <section className="campaign-disclaimer">
        <div className="campaign-shell">
          <strong>INDEPENDENT CAMPAIGN</strong>
          <p>{campaign.disclaimer}</p>
          <div><a href="#top">Back to top ↑</a><a href={`/feeds/campaigns/${campaign.slug}.xml`}>Campaign RSS ↗</a>{campaign.monitorUrl ? <a href={campaign.monitorUrl} target="_blank" rel="noreferrer">Original monitor ↗</a> : null}</div>
        </div>
      </section>

      <PublicationFooter />
    </main>
  )
}

function coverageLinkItem(item) {
  return { id: item.id, eyebrow: [item.outlet, item.language?.toUpperCase(), formatDate(item.date)].filter(Boolean).join(' / '), title: item.title, translation: item.translatedTitle, languageCode: item.languageCode, body: item.summary, url: item.url }
}

function OrderedCampaignSections({ order, children }) {
  const rank = new Map(order.map((key, index) => [key, index]))
  const sorted = Children.toArray(children).sort((a, b) => (rank.get(a.props.id || a.props.sectionKey) ?? 999) - (rank.get(b.props.id || b.props.sectionKey) ?? 999))
  return <div className="campaign-section-flow">{sorted}</div>
}

function SignatoryCarousel({ signatories, title }) {
  const railRef = useRef(null)
  const statementCount = signatories.filter((item) => item.statement).length
  function move(direction) {
    const rail = railRef.current
    if (!rail) return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    rail.scrollBy({ left: direction * Math.max(280, rail.clientWidth * 0.82), behavior: reducedMotion ? 'auto' : 'smooth' })
  }
  return (
    <section className="campaign-section campaign-section--signatories" id="signatories">
      <div className="campaign-shell">
        <SectionHeading sectionKey="signatories" eyebrow="OPEN LETTER" title={title} description={`${signatories.length} signatories${statementCount ? ` · ${statementCount} public statements` : ''}.`} />
        <div className="campaign-carousel-controls">
          <span>DRAG / SWIPE / USE CONTROLS</span>
          <div><button type="button" onClick={() => move(-1)} aria-label="Previous signatories">←</button><button type="button" onClick={() => move(1)} aria-label="Next signatories">→</button></div>
        </div>
        <div className="campaign-signatory-carousel" ref={railRef} role="region" aria-label="Open letter signatories" tabIndex="0">
          {signatories.map((item, index) => (
            <article className="campaign-signatory" key={item.id || item.name}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><p>{item.statement ? 'PUBLIC STATEMENT' : 'SIGNED THE LETTER'}</p><h3 className={signatoryNameClass(item.name)}>{item.url ? <SmartLink href={item.url}>{item.name}</SmartLink> : item.name}</h3>{item.location ? <small>{item.location}</small> : null}</div>
              {item.statement ? <blockquote><p>“{item.statement}”</p></blockquote> : <p className="campaign-signatory__plain">Supports the call to defend independent communications infrastructure.</p>}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function SocialSection({ campaign, social, copyState, copyCampaignLink, isAiCampaign, title }) {
  return <section className="campaign-section campaign-section--social" id="social">
    <div className="campaign-shell">
      <SectionHeading sectionKey="social" eyebrow="SOCIAL CIRCULATION" title={title} description={isAiCampaign ? 'Campaign posts from A/I and SabotPress. Cavallette is A/I’s official account and posts primarily in Italian; some updates are bilingual.' : 'Public posts and dispatches connected to this campaign.'} />
      <SocialSources sources={campaign.socialSources || []} />
      <div className="campaign-share-row">
        <a className="campaign-button campaign-button--light" href={`https://bsky.app/intent/compose?text=${encodeURIComponent(`${campaign.shortTitle}\n\n${window.location.href.split('#')[0]}`)}`} target="_blank" rel="noreferrer">Post to Bluesky ↗</a>
        <button className="campaign-button campaign-button--ghost" type="button" onClick={copyCampaignLink}>{copyState || 'Copy campaign link'}</button>
      </div>
      {social.length ? <div className="campaign-social-feed">{social.map((item) => <article className="campaign-social-post" key={item.id}>
        <div className="campaign-social-post__meta"><span>{item.platform || 'SOCIAL'}</span><span>{item.account}</span><span>{item.handle}</span>{item.language ? <span className="campaign-social-post__language">{item.language}</span> : null}<time dateTime={item.date}>{formatDate(item.date)}</time></div>
        {item.contentWarning ? <p className="campaign-social-post__warning">Content warning: {item.contentWarning}</p> : null}
        {(item.images?.length ? item.images : item.imageUrl ? [{ url: item.imageUrl, alt: '' }] : []).map((image) => <img key={image.url} src={image.url} alt={image.alt || ''} loading="lazy" />)}
        <p lang={item.languageCode || undefined}>{item.text || item.excerpt}</p>
        {item.external?.url ? <a className="campaign-social-post__external" href={item.external.url} target="_blank" rel="noreferrer"><strong>{item.external.title || item.external.url}</strong>{item.external.description ? <span>{item.external.description}</span> : null}</a> : null}
        {item.url ? <a href={item.url} target="_blank" rel="noreferrer">Open original post ↗</a> : null}
      </article>)}</div> : <EmptyState>No recent campaign posts are available.</EmptyState>}
      {campaign.socialErrors?.length ? <p className="campaign-source-error">Some configured social sources are temporarily unavailable. Published campaign materials remain available.</p> : null}
    </div>
  </section>
}

function SocialSources({ sources }) {
  if (!sources.length) return null
  return <div className="campaign-social-sources"><div><span>FOLLOWED ACCOUNTS</span><p>Official and campaign accounts represented in the feed.</p></div><ul>{sources.map((source) => <li key={`${source.platform}-${source.account}`}><span>{String(source.platform || 'social').toUpperCase()}</span><div><strong>{source.url ? <SmartLink href={source.url}>{source.account}</SmartLink> : source.account}</strong>{source.note ? <small>{source.note}</small> : null}</div><i className={source.ok ? 'is-live' : 'is-unavailable'}>{source.ok ? 'LIVE' : 'UNAVAILABLE'}</i></li>)}</ul></div>
}

function ItalyClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const instant = new Date(now)
  const zone = ITALY_ZONE_FORMAT.formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value || 'Europe/Rome'
  return (
    <aside className="campaign-italy-clock" aria-label="Current time in Italy">
      <div>
        <span>CURRENT TIME IN ITALY</span>
        <p>ROME / EUROPE · {zone}</p>
      </div>
      <time dateTime={instant.toISOString()} title="Live local time in Rome" aria-live="off">
        <strong>{ITALY_TIME_FORMAT.format(instant)}</strong>
        <span>{ITALY_DATE_FORMAT.format(instant)}</span>
      </time>
    </aside>
  )
}

function GazaClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const instant = new Date(now)
  const zone = GAZA_ZONE_FORMAT.formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value || 'Asia/Gaza'
  return (
    <aside className="campaign-italy-clock campaign-gaza-clock" aria-label="Current time in Gaza">
      <div>
        <span>CURRENT TIME IN GAZA</span>
        <p>GAZA / PALESTINE · {zone}</p>
      </div>
      <time dateTime={instant.toISOString()} title="Live local time in Gaza" aria-live="off">
        <strong>{GAZA_TIME_FORMAT.format(instant)}</strong>
        <span>{GAZA_DATE_FORMAT.format(instant)}</span>
      </time>
    </aside>
  )
}

function MonitorCard({ monitor, sourceUrl, label }) {
  const data = monitor.data
  const overall = String(data?.overall || (monitor.state === 'loading' ? 'loading' : 'unknown'))
  const monitors = Array.isArray(data?.monitors) ? data.monitors : []
  return (
    <article className={`campaign-metric campaign-monitor campaign-monitor--${overall}`} id="monitor">
      <span className="campaign-metric__label">LIVE / EXTERNAL</span>
      <div className="campaign-monitor__headline"><i aria-hidden="true" /><strong>{monitor.state === 'loading' ? `Checking ${label || 'infrastructure monitor'}…` : statusText(overall)}</strong></div>
      <p>{label || 'A/I infrastructure monitor'}{data?.checkedAt ? ` · checked ${formatTime(data.checkedAt)}` : ''}</p>
      {monitors.length ? <div className="campaign-monitor__services">{monitors.slice(0, 8).map((item) => <span key={item.id}><i className={`is-${item.status}`} aria-hidden="true" />{item.name}{item.uptime24h != null ? <small>{(item.uptime24h * 100).toFixed(item.uptime24h >= 0.9995 ? 2 : 1)}%</small> : null}</span>)}</div> : null}
      {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">Open original monitor ↗</a> : null}
      {monitor.state === 'unavailable' ? <small className="campaign-monitor__note">The public monitor data is unavailable right now. This is not equivalent to an outage; use the original monitor above.</small> : null}
    </article>
  )
}

function SectionHeading({ sectionKey, eyebrow, title, description = '' }) {
  const { slug = AI_CAMPAIGN_SLUG } = useParams()
  const fieldPrefix = `campaign.${slug}.${sectionKey}`
  return <header className="campaign-section-heading">
    <EditableText as="p" field={`${fieldPrefix}.eyebrow`}>{eyebrow}</EditableText>
    <EditableText as="h2" field={`${fieldPrefix}.title`}>{title}</EditableText>
    {description ? <EditableText as="div" field={`${fieldPrefix}.description`} multiline>{description}</EditableText> : null}
  </header>
}

function CampaignTrackerStatus({ campaign }) {
  const sources = campaign.intelligenceSources || []
  const errors = campaign.intelligenceErrors || []
  return (
    <aside className="campaign-tracker-status" aria-label="Campaign coverage tracker status">
      <div><strong>LIVE COVERAGE SOURCES</strong><span>{campaign.intelligenceCheckedAt ? `Updated ${formatDateTime(campaign.intelligenceCheckedAt)}` : 'Update pending'}</span></div>
      {sources.length ? <ul>{sources.map((source) => <li key={source.id}><i className={source.ok ? 'is-live' : 'is-unavailable'} aria-hidden="true" /><SmartLink href={source.url}>{source.label}</SmartLink><small>{source.ok ? `${source.count || 0} recent items` : 'temporarily unavailable'}</small></li>)}</ul> : null}
      {errors.length && !sources.some((source) => source.ok) ? <p>Live coverage is temporarily unavailable. Reporting and primary sources remain accessible.</p> : null}
    </aside>
  )
}

function PieceGrid({ pieces, empty }) {
  if (!pieces.length) return <EmptyState>{empty}</EmptyState>
  return (
    <div className="campaign-piece-grid">
      {pieces.slice(0, 12).map((piece) => (
        <article className="campaign-piece-card" key={piece.id || piece.slug}>
          {piece.featuredImage || piece.heroImage || piece.imageUrl ? <Link className="campaign-piece-card__image" to={`/post/${piece.slug}`}><img src={piece.featuredImage || piece.heroImage || piece.imageUrl} alt={piece.featuredImageAlt || ''} loading="lazy" /></Link> : null}
          <div className="campaign-piece-card__body"><p>{formatDate(piece.publishedAt || piece.updatedAt)} / {String(piece.contentType || piece.type || 'article').toUpperCase()}</p><h3><Link to={`/post/${piece.slug}`}>{piece.title}</Link></h3>{piece.excerpt ? <div>{stripHtml(piece.excerpt).slice(0, 220)}</div> : null}<Link to={`/post/${piece.slug}`}>Read ↗</Link></div>
        </article>
      ))}
    </div>
  )
}

function signatoryNameClass(name) {
  const longestWord = String(name || '').split(/\s+/).reduce((length, word) => Math.max(length, word.length), 0)
  if (longestWord >= 22) return 'is-extra-long-token'
  if (longestWord >= 11) return 'is-long-token'
  return ''
}

function ResourceStrip({ resources = [] }) {
  if (!resources.length) return null
  return <div className="campaign-resource-strip">{resources.map((item) => <article key={item.id}><span>{item.type || 'RESOURCE'}</span><h3>{item.title}</h3>{item.description ? <p>{item.description}</p> : null}<SmartLink href={item.href}>{item.label || 'Open resource'} ↗</SmartLink></article>)}</div>
}

function LinkList({ items }) {
  return <div className="campaign-link-list">{items.map((item) => <article key={item.id}><p>{item.eyebrow}</p><h3 lang={item.languageCode || undefined}>{item.url ? <SmartLink href={item.url}>{item.title}</SmartLink> : item.title}</h3>{item.translation ? <small className="campaign-link-list__translation">ENGLISH: {item.translation}</small> : null}{item.body ? <div>{item.body}</div> : null}</article>)}</div>
}

function EmptyState({ children }) {
  return <div className="campaign-empty-state"><span>OPEN SLOT</span><p>{children}</p></div>
}

function SmartLink({ href = '#', children }) {
  const value = String(href || '#')
  if (value.startsWith('/')) return <Link to={value}>{children}</Link>
  if (value.startsWith('#')) return <a href={value}>{children}</a>
  return <a href={value} target="_blank" rel="noreferrer">{children}</a>
}

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  return <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1600) } catch { setCopied(false) } }}>{copied ? 'Copied' : label}</button>
}

function findCampaignPieces(pieces, campaign) {
  if (!Array.isArray(pieces) || !campaign) return []
  const campaignSlug = String(campaign.slug || '').toLowerCase()
  const isAiCampaign = campaignSlug === AI_CAMPAIGN_SLUG
  const exactSlugs = new Set(['the-us-designated-a-25-year-old-volunteer-communications-collective-a-terrorist-organization', 'communications-infrastructure-is-not-terrorism', 'open-letter-defend-example-campaign', 'open-letter-ai', 'individual-letter-defend-example-campaign', 'the-server-called-paranoia'])
  return pieces.filter((piece) => {
    const explicit = [...(piece.campaigns || []), ...(piece.tags || []), ...(piece.collections || []), ...(piece.projects || []), piece.primaryProject]
      .map((item) => String(item || '').toLowerCase())
      .some((item) => item === campaignSlug || (isAiCampaign && (item.includes('autistici') || item.includes('inventati') || item.includes('a/i campaign'))))
    if (explicit || (isAiCampaign && exactSlugs.has(String(piece.slug || '').toLowerCase()))) return true
    if (!isAiCampaign) return false
    const title = String(piece.title || '').toLowerCase()
    return /autistici(?:\s*\/\s*|\s+)?inventati/.test(title) || (/communications infrastructure/.test(title) && /terrorism|sanction|designation/.test(title))
  }).sort((a, b) => new Date(b.publishedAt || b.updatedAt || 0) - new Date(a.publishedAt || a.updatedAt || 0))
}

function mergeGraphics(configured, pieces) {
  const output = []
  const seen = new Set()
  for (const item of configured || []) {
    const url = String(item.imageUrl || '').trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    output.push(item)
  }
  for (const piece of pieces || []) {
    const url = String(piece.featuredImage || piece.heroImage || piece.imageUrl || '').trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    output.push({ id: `piece-${piece.id || piece.slug}`, title: piece.title, imageUrl: url, alt: piece.featuredImageAlt || '', caption: piece.featuredImageCaption || '', downloadUrl: url })
  }
  return output
}

function sortByDate(items, descending = true) {
  return [...(items || [])].sort((a, b) => {
    const aTime = new Date(a.date || 0).getTime() || 0
    const bTime = new Date(b.date || 0).getTime() || 0
    return descending ? bTime - aTime : aTime - bTime
  })
}

function formatCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return { primary: 'Deadline passed', secondary: '' }
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  if (days > 0) return { primary: `${days} day${days === 1 ? '' : 's'} remaining`, secondary: `${hours} hours beyond the full days` }
  const minutes = Math.max(0, Math.floor((ms % 3600000) / 60000))
  return { primary: `${hours}h ${minutes}m remaining`, secondary: 'The deadline is close' }
}

function normalizeSectionOrder(value) {
  const requested = Array.isArray(value) ? value.filter((key) => CAMPAIGN_SECTION_ORDER.includes(key)) : []
  return [...new Set([...requested, ...CAMPAIGN_SECTION_ORDER])]
}

function formatDeadlineLabel(value, timeZone = 'UTC') {
  const date = new Date(value || '')
  if (!Number.isFinite(date.getTime())) return 'DEADLINE'
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date).toUpperCase()
  } catch {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date).toUpperCase()
  }
}

function statusText(status) {
  if (status === 'operational') return 'A/I monitor: operational'
  if (status === 'major-outage') return 'A/I monitor: major outage'
  if (status === 'partial-outage') return 'A/I monitor: partial outage'
  if (status === 'maintenance') return 'A/I monitor: maintenance'
  return 'A/I monitor: monitor unavailable'
}

function formatDate(value) {
  const date = new Date(value || '')
  if (!Number.isFinite(date.getTime())) return String(value || '')
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
}

function formatDateTime(value) {
  const date = new Date(value || '')
  if (!Number.isFinite(date.getTime())) return String(value || '')
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

function formatTime(value) {
  const date = new Date(value || '')
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
