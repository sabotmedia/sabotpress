import { permissionHasCapability, resolvePublicSitePermission } from './api/_lib/publicSiteAuth.js'
import { getNativeEntry } from './api/_lib/nativePublicContent.js'
import { getCampaign } from './api/_lib/campaigns.js'

export const ADMIN_PREFIXES = [
  '/admin', '/wp-admin', '/printlab', '/audiolab', '/content', '/posts', '/add-new', '/post-new', '/native-bridge',
  '/native-preview', '/media', '/settings', '/customize', '/site-editor', '/advanced-draft-tools', '/tools', '/users',
  '/pages', '/collections-admin', '/campaigns-admin', '/publications-admin', '/feeds-admin', '/menus', '/sites', '/podcasts', '/draft', '/review',
  '/qa', '/overrides', '/system-backup', '/audit-log', '/analytics', '/site-health', '/taxonomy', '/roles', '/design-system',
  '/platform-map',
]

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const PAGE_METHODS = new Set(['GET', 'HEAD'])
const PUBLIC_AUTH_API_PATHS = new Set(['/api/login', '/api/logout', '/api/session', '/api/analytics/collect', '/api/campaign-contributor-auth', '/api/campaign-correspondence', '/api/campaign-contributor-media'])
const PUBLIC_SPA_EXACT_PATHS = new Set([
  '/', '/archive', '/search', '/about', '/security', '/contact', '/submit', '/support', '/press', '/feeds',
  '/collections', '/publications', '/updates', '/projects', '/aberdeen-local-1312-gallery', '/login', '/wp-login', '/logout',
])

const ADMIN_PAGE_CAPABILITIES = [
  ['/wp-admin/users', 'users:manage'],
  ['/users', 'users:manage'],
  ['/wp-admin/roles', 'users:manage'],
  ['/roles', 'users:manage'],
  ['/wp-admin/settings', 'site:manage'],
  ['/settings', 'site:manage'],
  ['/wp-admin/customize', 'site:manage'],
  ['/customize', 'site:manage'],
  ['/wp-admin/sites', 'site:manage'],
  ['/sites', 'site:manage'],
  ['/wp-admin/campaigns', 'publishing:write'],
  ['/campaigns-admin', 'publishing:write'],
  ['/wp-admin/system-backup', 'system:view'],
  ['/system-backup', 'system:view'],
  ['/wp-admin/site-health', 'system:view'],
  ['/site-health', 'system:view'],
  ['/wp-admin/audit-log', 'system:view'],
  ['/audit-log', 'system:view'],
  ['/wp-admin/tools', 'system:view'],
  ['/tools', 'system:view'],
]

const API_WRITE_CAPABILITIES = [
  ['/api/users', 'users:manage'],
  ['/api/editor-roles', 'users:manage'],
  ['/api/public-site-config', 'site:manage'],
  ['/api/feed-settings', 'site:manage'],
  ['/api/podcast-settings', 'publishing:write'],
  ['/api/sites', 'site:manage'],
  ['/api/native-content', 'content:write'],
  ['/api/taxonomy', 'content:write'],
  ['/api/collections', 'publishing:write'],
  ['/api/campaigns', 'publishing:write'],
  ['/api/campaign-coverage', 'publishing:write'],
  ['/api/publications', 'publishing:write'],
  ['/api/media-assets', 'media:write'],
  ['/api/media/files', 'media:write'],
  ['/api/audiolab', 'media:write'],
  ['/api/podcasts', 'publishing:write'],
]

export function isAdminRoutePath(pathname = '') {
  return ADMIN_PREFIXES.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export function isPublicSpaPath(pathname = '') {
  const normalized = pathname === '/' ? '/' : String(pathname || '').replace(/\/+$/, '')
  if (PUBLIC_SPA_EXACT_PATHS.has(normalized)) return true
  return /^\/(?:project|projects|print|zine|collections|publications|reader|updates|contribute)\/[^/]+$/i.test(normalized)
    || /^\/(?:post|piece)\/[^/]+\/print$/i.test(normalized)
}

export async function onRequest(context) {
  const url = new URL(context.request.url)

  if (url.hostname.toLowerCase() === 'www.sabot.media') {
    url.hostname = 'sabot.media'
    return Response.redirect(url.toString(), 308)
  }

  if (url.pathname === '/pgp.asc') {
    return Response.redirect(new URL('/keys/info-sabot-media.asc', url.origin).toString(), 308)
  }

  const pathname = url.pathname
  const method = String(context.request.method || 'GET').toUpperCase()
  const isAdminRoute = isAdminRoutePath(pathname)
  const isApiWrite = pathname.startsWith('/api/') && WRITE_METHODS.has(method)

  if (PUBLIC_AUTH_API_PATHS.has(pathname)) return context.next()
  if (method === 'GET' && isPublicPostPath(pathname)) return renderPublicPost(context, url)
  if (PAGE_METHODS.has(method) && isPublicCampaignPath(pathname)) return renderPublicCampaign(context, url)
  if (PAGE_METHODS.has(method) && !isAdminRoute && isPublicSpaPath(pathname)) return renderSpaShell(context, url)
  if (!isAdminRoute && !isApiWrite) return context.next()

  const permission = await resolvePublicSitePermission(context)

  if (isApiWrite) {
    const requiredCapability = matchingCapability(pathname, API_WRITE_CAPABILITIES)
    const allowed = requiredCapability ? permissionHasCapability(permission, requiredCapability) : permission.canEdit
    if (allowed) return context.next()
    return forbiddenJson(permission, requiredCapability)
  }

  if (isAdminRoute && PAGE_METHODS.has(method)) {
    if (!permission.canAccessAdmin) return redirectToLogin(url)
    const requiredCapability = matchingCapability(pathname, ADMIN_PAGE_CAPABILITIES)
    if (requiredCapability && !permissionHasCapability(permission, requiredCapability)) {
      const dashboard = new URL('/wp-admin', url.origin)
      dashboard.searchParams.set('access', 'denied')
      dashboard.searchParams.set('required', requiredCapability)
      return Response.redirect(dashboard.toString(), 302)
    }
    if (context.env?.ASSETS?.fetch) {
      const indexUrl = new URL('/index.html', url.origin)
      return context.env.ASSETS.fetch(new Request(indexUrl.toString(), context.request))
    }
    return context.next()
  }

  return redirectToLogin(url)
}

function matchingCapability(pathname, rules) {
  for (const [prefix, capability] of rules) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return capability
  }
  return ''
}

function forbiddenJson(permission, requiredCapability) {
  return new Response(JSON.stringify({
    ok: false,
    canEdit: false,
    error: requiredCapability ? `permission required: ${requiredCapability}` : (permission.reason || 'authentication required'),
    authMode: permission.mode || 'locked',
    role: permission.role || '',
    requiredCapability: requiredCapability || '',
  }, null, 2), {
    status: 403,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function redirectToLogin(url) {
  const loginUrl = new URL('/login', url.origin)
  loginUrl.searchParams.set('returnTo', `${url.pathname}${url.search || ''}${url.hash || ''}`)
  return Response.redirect(loginUrl.toString(), 302)
}

function isPublicPostPath(pathname) {
  return /^\/(?:post|piece)\/[^/]+\/?$/.test(pathname)
}

export function isPublicCampaignPath(pathname = '') {
  return pathname === '/campaigns' || /^\/campaigns\/[a-z0-9-]+(?:\/(?:coverage|instagram-connect))?\/?$/i.test(pathname)
}

async function renderSpaShell(context, url) {
  if (!context.env?.ASSETS?.fetch) return context.next()
  const indexUrl = new URL('/index.html', url.origin)
  const response = await context.env.ASSETS.fetch(new Request(indexUrl, {
    method: context.request.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: { accept: 'text/html' },
  }))
  if (!response.ok) return response
  const headers = new Headers(response.headers)
  headers.set('cache-control', 'public, max-age=60, s-maxage=300')
  return new Response(context.request.method === 'HEAD' ? null : response.body, { status: 200, headers })
}

async function renderPublicCampaign(context, url) {
  const slug = url.pathname.match(/^\/campaigns\/([^/]+)/)?.[1] || ''
  const isCoverageArchive = /\/coverage\/?$/.test(url.pathname)
  let campaign = null
  if (slug && context.env?.BF_DB) {
    try { campaign = await getCampaign(context.env.BF_DB, decodeURIComponent(slug)) } catch { /* serve a safe generic shell */ }
  }
  if (campaign?.status !== 'published') campaign = null
  const campaignTitle = cleanText(campaign?.title || (slug ? titleFromSlug(slug) : 'Campaigns'))
  const title = isCoverageArchive ? `${campaign?.shortTitle || campaignTitle} Coverage Archive` : campaignTitle
  const description = truncate(cleanText(isCoverageArchive ? `Search reporting, analysis, and public statements connected to ${campaign?.shortTitle || campaignTitle}.` : campaign?.deck || campaign?.summary || (slug
    ? 'SabotPress campaign reporting, source records, live updates, and public action materials.'
    : 'SabotPress campaign hubs gathering reporting, sources, live updates, and public action materials.')), 240)
  const canonicalPath = isCoverageArchive ? `/campaigns/${encodeURIComponent(slug)}/coverage` : slug ? `/campaigns/${encodeURIComponent(slug)}` : '/campaigns'
  const canonical = `${url.origin}${canonicalPath}`
  const image = absoluteUrl(campaign?.heroImage || '/sabot-logo.png', url.origin)
  const response = await renderSpaShell(context, url)
  if (!response.ok || context.request.method === 'HEAD' || !String(response.headers.get('content-type') || '').includes('text/html')) return response
  let html = await response.text()
  const pageTitle = title === 'SabotPress' ? title : `${title} | SabotPress`
  const replacements = {
    '<title>SabotPress</title>': `<title>${escapeHtml(pageTitle)}</title>`,
    '<meta name="description" content="Independent reporting, essays, comics, podcasts, zines, and project-based archive work from SabotPress." />': `<meta name="description" content="${escapeHtml(description)}" />`,
    '<meta property="og:title" content="SabotPress" />': `<meta property="og:title" content="${escapeHtml(title)}" />`,
    '<meta property="og:description" content="Independent reporting, essays, comics, podcasts, zines, and project-based archive work from SabotPress." />': `<meta property="og:description" content="${escapeHtml(description)}" />`,
    '<meta property="og:image" content="/sabot-logo.png" />': `<meta property="og:image" content="${escapeHtml(image)}" />`,
    '<meta name="twitter:title" content="SabotPress" />': `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    '<meta name="twitter:description" content="Independent reporting, essays, comics, podcasts, zines, and project-based archive work from SabotPress." />': `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    '<meta name="twitter:image" content="/sabot-logo.png" />': `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  }
  for (const [from, to] of Object.entries(replacements)) html = html.replace(from, to)
  html = html.replace('</head>', `    <meta property="og:url" content="${escapeHtml(canonical)}" />\n    <link rel="canonical" href="${escapeHtml(canonical)}" />\n  </head>`)
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(html, { status: 200, headers })
}

async function renderPublicPost(context, url) {
  const slug = decodeURIComponent(url.pathname.split('/').filter(Boolean)[1] || '')
  let post = null

  if (context.env?.BF_DB) {
    try {
      post = await getNativeEntry(context.env.BF_DB, slug)
    } catch {
      // The route must still return the SPA when content storage is unavailable.
    }
  }

  const title = cleanText(post?.seoTitle || post?.title || titleFromSlug(slug)) || 'SabotPress'
  const description = truncate(cleanText(post?.seoDescription || post?.excerpt || post?.body || ''), 240)
    || 'Independent reporting, essays, comics, podcasts, zines, and project-based archive work from SabotPress.'
  const image = absoluteUrl(post?.featuredImage || post?.heroImage || post?.imageUrl || '/sabot-logo.png', url.origin)
  const canonical = `${url.origin}/post/${encodeURIComponent(slug)}`
  const indexUrl = new URL('/', url.origin)
  const response = context.env?.ASSETS?.fetch
    ? await context.env.ASSETS.fetch(new Request(indexUrl, { method: 'GET', headers: { accept: 'text/html' } }))
    : await context.next()

  if (!response.ok || !String(response.headers.get('content-type') || '').includes('text/html')) return response

  const html = await response.text()
  const pageTitle = title === 'SabotPress' ? title : `${title} | SabotPress`
  const replacements = {
    '<title>SabotPress</title>': `<title>${escapeHtml(pageTitle)}</title>`,
    '<meta name="description" content="Independent reporting, essays, comics, podcasts, zines, and project-based archive work from SabotPress." />': `<meta name="description" content="${escapeHtml(description)}" />`,
    '<meta property="og:title" content="SabotPress" />': `<meta property="og:title" content="${escapeHtml(title)}" />`,
    '<meta property="og:description" content="Independent reporting, essays, comics, podcasts, zines, and project-based archive work from SabotPress." />': `<meta property="og:description" content="${escapeHtml(description)}" />`,
    '<meta property="og:type" content="website" />': '<meta property="og:type" content="article" />',
    '<meta property="og:image" content="/sabot-logo.png" />': `<meta property="og:image" content="${escapeHtml(image)}" />`,
    '<meta name="twitter:title" content="SabotPress" />': `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    '<meta name="twitter:description" content="Independent reporting, essays, comics, podcasts, zines, and project-based archive work from SabotPress." />': `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    '<meta name="twitter:image" content="/sabot-logo.png" />': `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  }

  let rendered = html
  for (const [from, to] of Object.entries(replacements)) rendered = rendered.replace(from, to)
  rendered = rendered.replace('</head>', `    <meta property="og:url" content="${escapeHtml(canonical)}" />\n    <link rel="canonical" href="${escapeHtml(canonical)}" />\n  </head>`)

  const headers = new Headers(response.headers)
  headers.set('content-type', 'text/html; charset=utf-8')
  headers.set('cache-control', 'public, max-age=60, s-maxage=300')
  headers.delete('content-length')
  return new Response(rendered, { status: 200, headers })
}

function titleFromSlug(slug) {
  return String(slug || '').split('-').filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}
function cleanText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#(?:39|x27);/gi, "'").replace(/\s+/g, ' ').trim()
}
function truncate(value, length) { const text = String(value || ''); return text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…` }
function absoluteUrl(value, origin) { try { return new URL(String(value || ''), origin).toString() } catch { return `${origin}/sabot-logo.png` } }
function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
