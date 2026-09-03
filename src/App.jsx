import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import { PiecePage } from './components/PiecePage'
import { PrintPage } from './components/PrintPage'
import { AdminPage } from './components/AdminPage'
import { ContentListPage } from './components/ContentListPage'
import { PodcastAdminPage } from './components/PodcastAdminPage'
import { PodcastSettingsPage } from './components/PodcastSettingsPage'
import { NativeContentBridgePage } from './components/NativeContentBridgePage'
import { TranslationsAdminPage } from './components/TranslationsAdminPage'
import { NativeUpdatesPage } from './components/NativeUpdatesPage'
import { NativeDraftPreviewPage } from './components/NativeDraftPreviewPage'
import { PublicSearchPage } from './components/PublicSearchPage'
import { PublicDraftPage } from './components/PublicDraftPage'
import { PrintLabPage } from './components/PrintLabPage'
import { AudioLabPage } from './components/AudioLabPage'
import { PublicationLandingPage, PublicationReaderPage, PublicationsIndexPage } from './components/PublicationReaderPage'
import { PublicationSystemPage } from './components/PublicationSystemPage'
import { CollectionsIndexPage } from './components/CollectionsIndexPage'
import { CollectionPage } from './components/CollectionPage'
import { CollectionsAdminPage } from './components/CollectionsAdminPage'
import { CampaignPage } from './components/CampaignPage'
import { CampaignsIndexPage } from './components/CampaignsIndexPage'
import { CampaignCoverageArchivePage } from './components/CampaignCoverageArchivePage'
import { CampaignAdminPage } from './components/CampaignAdminPage'
import { CampaignContributorPage } from './components/CampaignContributorPage'
import { CampaignBenefitKitPage } from './components/CampaignBenefitKitPage'
import { CampaignInstagramConnectPage } from './components/CampaignInstagramConnectPage'
import { FeedSettingsAdminPage } from './components/FeedSettingsAdminPage'
import { PublicFeedsPage } from './components/PublicFeedsPage'
import { GalleryArchivePage } from './components/GalleryArchivePage'
import { AdminQaPage } from './components/AdminQaPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { NotFoundPage } from './components/NotFoundPage'
import { PublicEditProvider, usePublicEdit } from './components/PublicEditContext'
import { PublicEditPanel } from './components/PublicEditPanel'
import { PublicAdminToolbar } from './components/PublicAdminToolbar'
import { AdminAuthProvider, useAdminAuth } from './components/AdminAuthContext'
import { LoginPage } from './components/LoginPage'
import { buildProjectMap, getFeaturedPiece, getLatestPieces, getProjectMeta } from './lib/content'
import { getPieces } from './lib/pieces'
import { PublicSurfacePage } from './components/PublicSurfacePage'
import { PublicInfoPage } from './components/PublicInfoPage'
import { AdminNoticeProvider } from './components/WpAdminNotices'
import { MediaLibraryPage } from './components/MediaLibraryPage'
import { AnalyticsPage } from './components/AnalyticsPage'
import { PagesAdminPage, SettingsAdminPage, UsersAdminPage } from './components/WpAdminPages'
import { SitesAdminPage } from './components/SitesAdminPage'
import { SiteHealthPage } from './components/SiteHealthPage'
import { SystemBackupPage } from './components/SystemBackupPage'
import { AuditLogPage } from './components/AuditLogPage'
import { TaxonomyAdminPage } from './components/TaxonomyAdminPage'
import { adminRoutes, publicRoutes } from './routing/routes'
import { buildPostMeta, setDocumentMeta } from './lib/documentMeta'
import { trackPageView } from './lib/analyticsApi'
import { canonicalizeAnalyticsPath } from '../shared/analyticsPath'
import { getPublicPageMeta } from './lib/publicPageRegistry'
import { DesktopWelcomePage } from './components/DesktopWelcomePage'
import { DesktopPublishOnlinePage } from './components/DesktopPublishOnlinePage'

const pieces = getPieces()
const featured = getFeaturedPiece(pieces)
const latest = getLatestPieces(pieces, 12)
const projectMap = buildProjectMap(pieces)

const ADMIN_SHELL_PATHS = [
  '/admin', '/review', '/qa', '/content', '/posts', '/add-new', '/post-new', '/native-bridge', '/native-preview',
  '/podcasts', '/draft', '/overrides', '/system-backup', '/taxonomy', '/roles', '/audit-log', '/analytics',
  '/design-system', '/platform-map', '/media', '/pages', '/collections-admin', '/campaigns-admin', '/publications-admin', '/feeds-admin',
  '/users', '/menus', '/customize', '/site-editor', '/advanced-draft-tools', '/tools', '/site-health', '/printlab',
  '/audiolab', '/settings', '/sites', '/wp-admin', '/welcome', '/publish-online',
]

function shouldUseBareShell(pathname) {
  return pathname.startsWith('/contribute/') || pathname.endsWith('/instagram-connect') || ADMIN_SHELL_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

function ScrollToTop() {
  const { pathname, search, hash } = useLocation()
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, search, hash])
  return null
}

function CampaignRoute() {
  const location = useLocation()
  return new URLSearchParams(location.search).get('tool') === 'benefit-kit' ? <CampaignBenefitKitPage /> : <CampaignPage />
}

function AnalyticsTracker() {
  const location = useLocation()
  useEffect(() => {
    if (location.pathname.startsWith('/contribute/')) return undefined
    const expectedPath = canonicalizeAnalyticsPath(location.pathname)
    let settleTimer = 0
    let fallbackTimer = 0
    let tracked = false

    const send = (title = '') => {
      if (tracked) return
      tracked = true
      window.clearTimeout(settleTimer)
      window.clearTimeout(fallbackTimer)
      trackPageView({ path: expectedPath, title, referrer: document.referrer })
    }

    const checkMetadata = () => {
      const metadataPath = canonicalizeAnalyticsPath(document.documentElement.dataset.sabotMetaPath || '')
      if (metadataPath !== expectedPath) return
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => send(document.documentElement.dataset.sabotMetaTitle || document.title), 250)
    }

    document.addEventListener('sabot:meta-updated', checkMetadata)
    checkMetadata()
    fallbackTimer = window.setTimeout(() => send(''), 4_000)

    return () => {
      document.removeEventListener('sabot:meta-updated', checkMetadata)
      window.clearTimeout(settleTimer)
      window.clearTimeout(fallbackTimer)
    }
  }, [location.pathname])
  return null
}

function RouteMeta({ pieces = [] }) {
  const location = useLocation()
  useEffect(() => {
    const pathname = location.pathname
    const postMatch = pathname.match(/^\/post\/([^/]+)$/)
    const postPrintMatch = pathname.match(/^\/post\/([^/]+)\/print$/)
    const printMatch = pathname.match(/^\/print\/([^/]+)$/)
    const projectMatch = pathname.match(/^\/(?:project|projects)\/([^/]+)$/)

    if (postMatch) {
      const piece = pieces.find((item) => item.slug === postMatch[1])
      if (piece) setDocumentMeta(buildPostMeta(piece, { path: pathname }))
      return
    }
    if (postPrintMatch || printMatch) {
      const slug = (postPrintMatch || printMatch)[1]
      const piece = pieces.find((item) => item.slug === slug)
      setDocumentMeta({ ...(piece ? buildPostMeta(piece, { path: pathname }) : {}), title: piece ? `${piece.title} Print` : 'Print', canonicalPath: pathname })
      return
    }
    if (projectMatch) {
      const meta = getProjectMeta(projectMatch[1])
      setDocumentMeta({ title: meta.name, description: meta.description, canonicalPath: pathname })
      return
    }

    const routeMeta = {
      '/': ['SabotPress', 'Independent reporting, essays, comics, podcasts, zines, and project-based archive work.'],
      '/archive': ['Archive', 'Browse the SabotPress archive by search, project, format, and date.'],
      '/collections': ['Collections', 'Browse SabotPress bodies of work by timeline, downloads, gallery, and related pieces.'],
      '/campaigns': ['Campaigns', 'SabotPress campaign hubs gathering reporting, sources, live updates, and public action materials.'],
      '/campaigns/example-campaign': ['Communications Infrastructure Is Not Terrorism', 'Campaign hub for reporting, open letters, graphics, live updates, source material, and infrastructure status related to Example Campaign.'],
      '/campaigns/example-campaign/coverage': ['A/I Campaign Coverage Archive', 'Search reporting, analysis and official dispatches related to the Example Campaign designation and its consequences.'],
      '/feeds': ['Feeds', 'Subscribe to SabotPress feeds for the whole archive, formats, projects, collections, and author labels.'],
      '/aberdeen-local-1312-gallery': ['Aberdeen Local 1312 Gallery', 'Historical image archive from Aberdeen Local 1312, preserved by SabotPress.'],
      '/search': ['Search', 'Search the SabotPress archive.'],
      '/about': ['About', 'About SabotPress and its public-interest media work.'],
      '/contact': ['Contact', 'Contact SabotPress.'],
      '/submit': ['Submit', 'Submit tips, documents, writing, art, or project ideas to SabotPress.'],
      '/support': ['Support', 'Support SabotPress by reading, sharing, printing, citing, and circulating the archive.'],
      '/security': ['Security', 'Security guidance and public OpenPGP key for contacting SabotPress.'],
      '/press': ['Press', 'Press information and public-facing SabotPress materials.'],
      '/publications': ['Publications', 'Read SabotPress publications.'],
      '/updates': ['Updates', 'Latest SabotPress updates.'],
      '/login': ['Editor Login', 'Editor login for SabotPress administrators.'],
      '/wp-login': ['Editor Login', 'Editor login for SabotPress administrators.'],
      '/logout': ['Editor Logout', 'Log out of SabotPress editor tools.'],
    }[pathname]
    if (routeMeta) setDocumentMeta({ title: routeMeta[0], description: routeMeta[1], canonicalPath: pathname })
  }, [location.pathname, pieces])
  return null
}

function Layout({ children }) {
  const { isEditing, setSelectedField, startEditing } = usePublicEdit()
  const { isAuthenticated } = useAdminAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const bareShell = shouldUseBareShell(location.pathname)
  const isHomepage = location.pathname === '/'
  const publicPageMeta = getPublicPageMeta(location.pathname)

  useEffect(() => {
    document.body.classList.toggle('is-homepage', isHomepage)
    return () => document.body.classList.remove('is-homepage')
  }, [isHomepage])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('edit') !== 'site') return
    if (isAuthenticated) startEditing()
    else {
      const returnTo = `${location.pathname}${location.search || ''}${location.hash || ''}`
      navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
    }
  }, [isAuthenticated, location.hash, location.pathname, location.search, navigate, startEditing])

  useEffect(() => {
    const root = document.documentElement
    const updateViewportVars = () => {
      const masthead = document.querySelector('.publication-topbar')
      const adminBar = document.querySelector('.wp-public-admin-bar')
      root.style.setProperty('--masthead-height', `${Math.round(masthead?.getBoundingClientRect().height || 0)}px`)
      root.style.setProperty('--public-admin-bar-height', `${Math.round(adminBar?.getBoundingClientRect().height || 0)}px`)
    }
    updateViewportVars()
    const observer = new ResizeObserver(updateViewportVars)
    const mutationObserver = new MutationObserver(updateViewportVars)
    const masthead = document.querySelector('.publication-topbar')
    const adminBar = document.querySelector('.wp-public-admin-bar')
    if (masthead) observer.observe(masthead)
    if (adminBar) observer.observe(adminBar)
    mutationObserver.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', updateViewportVars)
    return () => {
      observer.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener('resize', updateViewportVars)
    }
  }, [location.pathname])

  if (bareShell) {
    return (
      <div className="bare-route-shell">
        <a className="skip-link" href="#main-content">Skip to content</a>
        <PublicEditPanel />
        <div id="main-content" tabIndex="-1">
          <ErrorBoundary key={location.pathname} area="admin">{children}</ErrorBoundary>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`public-route-shell${isEditing ? ' public-route-shell--editing' : ''}`}
      data-live-edit-page={publicPageMeta.id}
      data-live-edit-family={publicPageMeta.family}
      onClick={() => { if (isEditing) setSelectedField(null) }}
    >
      <a className="skip-link" href="#main-content">Skip to content</a>
      <PublicAdminToolbar />
      <PublicEditPanel />
      <div id="main-content" tabIndex="-1">
        <ErrorBoundary key={location.pathname} area="public">{children}</ErrorBoundary>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const location = useLocation()
  const { isAuthenticated, isChecking } = useAdminAuth()
  if (isChecking) {
    return <main className="page admin-login-page"><section className="admin-login-panel"><p className="admin-login-panel__eyebrow">SabotPress</p><h1>Checking Access</h1></section></main>
  }
  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search || ''}${location.hash || ''}`
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />
  }
  return children
}

function protect(element) {
  return <ProtectedRoute>{element}</ProtectedRoute>
}

export default function App() {
  return (
    <AdminAuthProvider>
      <PublicEditProvider>
        <AdminNoticeProvider>
          <ScrollToTop />
          <RouteMeta pieces={pieces} />
          <AnalyticsTracker />
          <Layout>
            <Routes>
              <Route path="/welcome" element={<DesktopWelcomePage />} />
              <Route path="/publish-online" element={<DesktopPublishOnlinePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/wp-login" element={<LoginPage />} />
              <Route path="/logout" element={<LogoutPage />} />
              <Route path="/" element={<NativeUpdatesPage pieces={pieces} featured={featured} latest={latest} />} />
              <Route path="/projects" element={<Navigate to="/archive" replace />} />
              <Route path="/projects/:slug" element={<ProjectArchiveRedirect projectMap={projectMap} />} />
              <Route path={publicRoutes.project} element={<ProjectArchiveRedirect projectMap={projectMap} />} />
              <Route path="/piece/:slug" element={<LegacyPieceRedirect />} />
              <Route path={publicRoutes.post} element={<PiecePage pieces={pieces} />} />
              <Route path="/post/:slug/print" element={<PrintPage pieces={pieces} />} />
              <Route path={publicRoutes.print} element={<PrintPage pieces={pieces} />} />
              <Route path="/piece/:slug/print" element={<LegacyPrintRedirect />} />
              <Route path={publicRoutes.collections} element={<CollectionsIndexPage pieces={pieces} />} />
              <Route path={publicRoutes.collection} element={<CollectionPage pieces={pieces} />} />
              <Route path="/campaigns" element={<CampaignsIndexPage />} />
              <Route path="/contribute/:slug" element={<CampaignContributorPage />} />
              <Route path="/campaigns/:slug/instagram-connect" element={<CampaignInstagramConnectPage />} />
              <Route path="/campaigns/:slug/benefit-kit" element={<CampaignBenefitKitPage />} />
              <Route path={publicRoutes.aiCampaign} element={<CampaignPage />} />
              <Route path={publicRoutes.aiCampaignCoverage} element={<CampaignCoverageArchivePage />} />
              <Route path={publicRoutes.campaign} element={<CampaignRoute />} />
              <Route path={publicRoutes.feeds} element={<PublicFeedsPage />} />
              <Route path={publicRoutes.gallery} element={<GalleryArchivePage />} />

              <Route path="/review" element={protect(<Navigate to={adminRoutes.qa} replace />)} />
              <Route path="/qa" element={protect(<Navigate to={adminRoutes.qa} replace />)} />
              <Route path="/admin" element={protect(<Navigate to={adminRoutes.dashboard} replace />)} />
              <Route path={adminRoutes.dashboard} element={protect(<AdminPage pieces={pieces} />)} />
              <Route path="/content" element={protect(<Navigate to={adminRoutes.posts} replace />)} />
              <Route path="/posts" element={protect(<Navigate to={adminRoutes.posts} replace />)} />
              <Route path={adminRoutes.posts} element={protect(<ContentListPage />)} />
              <Route path={adminRoutes.translations} element={protect(<TranslationsAdminPage />)} />
              <Route path={adminRoutes.addNew} element={protect(<Navigate to={`${adminRoutes.nativeBridge}?new=article`} replace />)} />
              <Route path="/add-new" element={protect(<Navigate to={adminRoutes.addNew} replace />)} />
              <Route path="/post-new" element={protect(<Navigate to={adminRoutes.addNew} replace />)} />
              <Route path="/wp-admin/post-new.php" element={protect(<Navigate to={adminRoutes.addNew} replace />)} />
              <Route path="/overrides" element={protect(<Navigate to={adminRoutes.posts} replace />)} />
              <Route path={adminRoutes.overrides} element={protect(<Navigate to={adminRoutes.posts} replace />)} />
              <Route path="/media" element={protect(<Navigate to={adminRoutes.media} replace />)} />
              <Route path={adminRoutes.media} element={protect(<MediaLibraryPage />)} />
              <Route path={adminRoutes.projects} element={protect(<Navigate to={adminRoutes.collections} replace />)} />
              <Route path="/collections-admin" element={protect(<Navigate to={adminRoutes.collections} replace />)} />
              <Route path={adminRoutes.collections} element={protect(<CollectionsAdminPage />)} />
              <Route path="/campaigns-admin" element={protect(<Navigate to={adminRoutes.campaigns} replace />)} />
              <Route path={adminRoutes.campaigns} element={protect(<CampaignAdminPage />)} />
              <Route path="/publications-admin" element={protect(<Navigate to={adminRoutes.publications} replace />)} />
              <Route path={adminRoutes.publications} element={protect(<PublicationSystemPage />)} />
              <Route path="/feeds-admin" element={protect(<Navigate to={adminRoutes.feeds} replace />)} />
              <Route path={adminRoutes.feeds} element={protect(<FeedSettingsAdminPage />)} />
              <Route path="/pages" element={protect(<Navigate to={adminRoutes.pages} replace />)} />
              <Route path={adminRoutes.pages} element={protect(<PagesAdminPage />)} />
              <Route path="/users" element={protect(<Navigate to={adminRoutes.users} replace />)} />
              <Route path={adminRoutes.users} element={protect(<UsersAdminPage />)} />
              <Route path="/menus" element={protect(<Navigate to={`${adminRoutes.settings}?section=navigation`} replace />)} />
              <Route path="/customize" element={protect(<Navigate to={adminRoutes.settings} replace />)} />
              <Route path={adminRoutes.customize} element={protect(<Navigate to={adminRoutes.settings} replace />)} />
              <Route path="/site-editor" element={protect(<Navigate to={adminRoutes.liveEditor} replace />)} />
              <Route path="/advanced-draft-tools" element={protect(<Navigate to={adminRoutes.liveEditor} replace />)} />
              <Route path="/tools" element={protect(<Navigate to={adminRoutes.siteHealth} replace />)} />
              <Route path={adminRoutes.tools} element={protect(<Navigate to={adminRoutes.siteHealth} replace />)} />
              <Route path="/site-health" element={protect(<Navigate to={adminRoutes.siteHealth} replace />)} />
              <Route path={adminRoutes.siteHealth} element={protect(<SiteHealthPage pieces={pieces} />)} />
              <Route path="/system-backup" element={protect(<Navigate to={adminRoutes.backup} replace />)} />
              <Route path={adminRoutes.backup} element={protect(<SystemBackupPage />)} />
              <Route path="/audit-log" element={protect(<Navigate to={adminRoutes.auditLog} replace />)} />
              <Route path={adminRoutes.auditLog} element={protect(<AuditLogPage />)} />
              <Route path={adminRoutes.qa} element={protect(<AdminQaPage />)} />
              <Route path="/printlab" element={protect(<Navigate to={adminRoutes.printlab} replace />)} />
              <Route path={adminRoutes.printlab} element={protect(<PrintLabPage pieces={pieces} />)} />
              <Route path="/tools/print" element={protect(<Navigate to={adminRoutes.printlab} replace />)} />
              <Route path="/audiolab" element={protect(<Navigate to={adminRoutes.audiolab} replace />)} />
              <Route path={adminRoutes.audiolab} element={protect(<AudioLabPage />)} />
              <Route path="/settings" element={protect(<Navigate to={adminRoutes.settings} replace />)} />
              <Route path={adminRoutes.settings} element={protect(<SettingsAdminPage />)} />
              <Route path="/settings/social" element={protect(<Navigate to={adminRoutes.settings} replace />)} />
              <Route path="/settings/sites" element={protect(<Navigate to={adminRoutes.sites} replace />)} />
              <Route path="/sites" element={protect(<Navigate to={adminRoutes.sites} replace />)} />
              <Route path="/wp-admin/sites" element={protect(<Navigate to={adminRoutes.sites} replace />)} />
              <Route path={adminRoutes.sites} element={protect(<SitesAdminPage />)} />
              <Route path="/analytics" element={protect(<Navigate to={adminRoutes.analytics} replace />)} />
              <Route path={adminRoutes.analytics} element={protect(<AnalyticsPage pieces={pieces} />)} />
              <Route path="/taxonomy" element={protect(<Navigate to={adminRoutes.taxonomy} replace />)} />
              <Route path={adminRoutes.taxonomy} element={protect(<TaxonomyAdminPage />)} />
              <Route path="/roles" element={protect(<Navigate to={adminRoutes.users} replace />)} />
              <Route path={adminRoutes.roles} element={protect(<Navigate to={adminRoutes.users} replace />)} />
              <Route path="/platform-map" element={protect(<Navigate to={adminRoutes.siteHealth} replace />)} />
              <Route path={adminRoutes.platformMap} element={protect(<Navigate to={adminRoutes.siteHealth} replace />)} />

              <Route path="/podcasts" element={protect(<Navigate to={adminRoutes.podcasts} replace />)} />
              <Route path="/podcasts/settings" element={protect(<Navigate to={`${adminRoutes.podcasts}/settings`} replace />)} />
              <Route path={adminRoutes.podcasts} element={protect(<PodcastAdminPage pieces={pieces} />)} />
              <Route path={`${adminRoutes.podcasts}/settings`} element={protect(<PodcastSettingsPage />)} />
              <Route path="/native-bridge" element={protect(<LegacyNativeBridgeRedirect />)} />
              <Route path="/native-bridge/*" element={protect(<LegacyNativeBridgeRedirect />)} />
              <Route path={adminRoutes.nativeBridge} element={protect(<NativeContentBridgePage />)} />

              <Route path="/updates" element={<NativeUpdatesPage pieces={pieces} featured={featured} latest={latest} />} />
              <Route path="/updates/:slug" element={<LegacyUpdateRedirect />} />
              <Route path="/native-preview/:id" element={protect(<NativeDraftPreviewPage />)} />
              <Route path="/press" element={<PublicSurfacePage target="press" />} />
              <Route path="/publications" element={<PublicationsIndexPage />} />
              <Route path="/publications/:slug" element={<PublicationLandingPage />} />
              <Route path="/reader/:slug" element={<PublicationReaderPage />} />
              <Route path="/about" element={<PublicInfoPage page="about" />} />
              <Route path="/security" element={<PublicInfoPage page="security" />} />
              <Route path="/contact" element={<PublicInfoPage page="contact" />} />
              <Route path="/submit" element={<PublicInfoPage page="submit" />} />
              <Route path="/support" element={<PublicInfoPage page="support" />} />
              <Route path="/archive" element={<PublicSearchPage pieces={pieces} />} />
              <Route path="/search" element={<PublicSearchPage pieces={pieces} />} />
              <Route path="/draft" element={protect(<Navigate to={adminRoutes.liveEditor} replace />)} />
              <Route path={adminRoutes.liveEditor} element={protect(<PublicDraftPage />)} />

              <Route path="/admin/*" element={protect(<Navigate to={adminRoutes.dashboard} replace />)} />
              <Route path="/wp-admin/*" element={protect(<Navigate to={adminRoutes.dashboard} replace />)} />
              <Route path="/content/*" element={protect(<Navigate to={adminRoutes.posts} replace />)} />
              <Route path="/media/*" element={protect(<Navigate to={adminRoutes.media} replace />)} />
              <Route path="/customize/*" element={protect(<Navigate to={adminRoutes.settings} replace />)} />
              <Route path="/settings/*" element={protect(<Navigate to={adminRoutes.settings} replace />)} />
              <Route path="/tools/*" element={protect(<Navigate to={adminRoutes.siteHealth} replace />)} />
              <Route path="/printlab/*" element={protect(<Navigate to={adminRoutes.printlab} replace />)} />
              <Route path="/audiolab/*" element={protect(<Navigate to={adminRoutes.audiolab} replace />)} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Layout>
        </AdminNoticeProvider>
      </PublicEditProvider>
    </AdminAuthProvider>
  )
}

function LegacyPieceRedirect() {
  const location = useLocation()
  const slug = location.pathname.replace(/^\/piece\//, '').replace(/\/+$/, '')
  return <Navigate to={`/post/${slug}${location.search || ''}`} replace />
}

function LegacyUpdateRedirect() {
  const location = useLocation()
  const slug = location.pathname.replace(/^\/updates\//, '').replace(/\/+$/, '')
  return <Navigate to={`/post/${slug}${location.search || ''}`} replace />
}

function LegacyPrintRedirect() {
  const location = useLocation()
  const slug = location.pathname.replace(/^\/piece\//, '').replace(/\/print\/?$/, '')
  return <Navigate to={`/post/${slug}/print${location.search || ''}`} replace />
}

function ProjectArchiveRedirect({ projectMap = [] }) {
  const { slug = '' } = useParams()
  const match = projectMap.find((project) => project.slug === slug)
  const projectValue = match?.name || getProjectMeta(slug).name || slug
  return <Navigate to={`/archive?project=${encodeURIComponent(projectValue)}`} replace />
}

function LegacyNativeBridgeRedirect() {
  const location = useLocation()
  return <Navigate to={`${adminRoutes.nativeBridge}${location.search || ''}${location.hash || ''}`} replace />
}

function LogoutPage() {
  const navigate = useNavigate()
  const { logout } = useAdminAuth()
  useEffect(() => {
    let cancelled = false
    async function runLogout() {
      await logout()
      if (!cancelled) navigate('/login?loggedOut=1', { replace: true })
    }
    runLogout()
    return () => { cancelled = true }
  }, [logout, navigate])
  return <main className="page admin-login-page"><section className="admin-login-panel"><p className="admin-login-panel__eyebrow">SabotPress</p><h1>Logging out</h1><p>Ending your editor session.</p></section></main>
}
