export const publicRoutes = Object.freeze({
  post: '/post/:slug',
  archive: '/archive',
  collections: '/collections',
  collection: '/collections/:slug',
  campaigns: '/campaigns',
  campaign: '/campaigns/:slug',
  featuredCampaign: '/campaigns/example-campaign',
  featuredCampaignCoverage: '/campaigns/example-campaign/coverage',
  feeds: '/feeds',
  gallery: '/gallery',
  project: '/project/:slug',
  projectsLegacy: '/projects/:slug',
  about: '/about',
  security: '/security',
  contact: '/contact',
  support: '/support',
  submit: '/submit',
  print: '/print/:slug',
  printLegacy: '/piece/:slug/print',
  zine: '/zine/:slug',
})

export const adminRoutes = Object.freeze({
  dashboard: '/wp-admin',
  posts: '/wp-admin/posts',
  addNew: '/wp-admin/add-new',
  nativeBridge: '/wp-admin/native-bridge',
  translations: '/wp-admin/translations',
  media: '/wp-admin/media',
  pages: '/wp-admin/pages',
  projects: '/wp-admin/projects',
  collections: '/wp-admin/collections',
  campaigns: '/wp-admin/campaigns',
  publications: '/wp-admin/publications',
  feeds: '/wp-admin/feeds',
  printlab: '/wp-admin/printlab',
  audiolab: '/wp-admin/audiolab',
  customize: '/wp-admin/customize',
  liveEditor: '/wp-admin/live-editor',
  tools: '/wp-admin/tools',
  siteHealth: '/wp-admin/site-health',
  backup: '/wp-admin/system-backup',
  auditLog: '/wp-admin/audit-log',
  analytics: '/wp-admin/analytics',
  taxonomy: '/wp-admin/taxonomy',
  roles: '/wp-admin/roles',
  platformMap: '/wp-admin/platform-map',
  qa: '/wp-admin/qa',
  settings: '/wp-admin/settings',
  users: '/wp-admin/users',
  sites: '/wp-admin/settings/domains',
  podcasts: '/wp-admin/podcasts',
  podcastSettings: '/wp-admin/podcasts/settings',
  overrides: '/wp-admin/overrides',
})

export const routeRedirects = Object.freeze([
  { from: '/admin', to: adminRoutes.dashboard },
  { from: '/content', to: adminRoutes.posts },
  { from: '/posts', to: adminRoutes.posts },
  { from: '/translations', to: adminRoutes.translations },
  { from: '/media', to: adminRoutes.media },
  { from: '/pages', to: adminRoutes.pages },
  { from: '/collections-admin', to: adminRoutes.collections },
  { from: '/campaigns-admin', to: adminRoutes.campaigns },
  { from: '/publications-admin', to: adminRoutes.publications },
  { from: '/feeds-admin', to: adminRoutes.feeds },
  { from: '/printlab', to: adminRoutes.printlab },
  { from: '/audiolab', to: adminRoutes.audiolab },
  { from: '/customize', to: adminRoutes.settings },
  { from: '/draft', to: adminRoutes.liveEditor },
  { from: '/tools', to: adminRoutes.siteHealth },
  { from: '/settings', to: adminRoutes.settings },
  { from: '/users', to: adminRoutes.users },
  { from: '/sites', to: adminRoutes.sites },
  { from: '/podcasts', to: adminRoutes.podcasts },
  { from: '/podcasts/settings', to: adminRoutes.podcastSettings },
  { from: '/analytics', to: adminRoutes.analytics },
  { from: '/taxonomy', to: adminRoutes.taxonomy },
  { from: '/roles', to: adminRoutes.users },
  { from: '/platform-map', to: adminRoutes.siteHealth },
])

export function postPath(slug) {
  return `/post/${slug}`
}

export function projectPath(slug) {
  return `/project/${slug}`
}

export function campaignPath(slug) {
  return `/campaigns/${slug}`
}

export function printPath(slug) {
  return `/print/${slug}`
}
