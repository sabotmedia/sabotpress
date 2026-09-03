const STATIC_PUBLIC_PAGES = [
  { id: 'home', label: 'Home', path: '/', family: 'page' },
  { id: 'archive', label: 'Archive', path: '/archive', family: 'page' },
  { id: 'search', label: 'Search', path: '/search', family: 'page' },
  { id: 'collections', label: 'Collections', path: '/collections', family: 'index' },
  { id: 'campaigns', label: 'Campaigns', path: '/campaigns', family: 'index' },
  { id: 'ai-campaign', label: 'A/I campaign', path: '/campaigns/example-campaign', family: 'campaign' },
  { id: 'ai-campaign-coverage', label: 'A/I coverage archive', path: '/campaigns/example-campaign/coverage', family: 'archive' },
  { id: 'feeds', label: 'Feeds', path: '/feeds', family: 'page' },
  { id: 'gallery', label: 'Aberdeen Local 1312 gallery', path: '/aberdeen-local-1312-gallery', family: 'archive' },
  { id: 'updates', label: 'Updates', path: '/updates', family: 'index' },
  { id: 'press', label: 'Press', path: '/press', family: 'page' },
  { id: 'publications', label: 'Publications', path: '/publications', family: 'index' },
  { id: 'about', label: 'About', path: '/about', family: 'page' },
  { id: 'contact', label: 'Contact', path: '/contact', family: 'page' },
  { id: 'submit', label: 'Submit', path: '/submit', family: 'page' },
  { id: 'support', label: 'Support', path: '/support', family: 'page' },
  { id: 'security', label: 'Security', path: '/security', family: 'page' },
]

const DYNAMIC_PUBLIC_PAGES = [
  { id: 'post', label: 'Post', pattern: /^\/post\/[^/]+$/, family: 'content' },
  { id: 'post-print', label: 'Post print view', pattern: /^\/post\/[^/]+\/print$/, family: 'template' },
  { id: 'print', label: 'Print view', pattern: /^\/print\/[^/]+$/, family: 'template' },
  { id: 'collection', label: 'Collection', pattern: /^\/collections\/[^/]+$/, family: 'content' },
  { id: 'campaign', label: 'Campaign', pattern: /^\/campaigns\/[^/]+$/, family: 'content' },
  { id: 'publication', label: 'Publication', pattern: /^\/publications\/[^/]+$/, family: 'content' },
  { id: 'reader', label: 'Publication reader', pattern: /^\/reader\/[^/]+$/, family: 'template' },
]

export const publicPageRegistry = Object.freeze(STATIC_PUBLIC_PAGES.map((page) => Object.freeze({ ...page })))
export const publicPagePatterns = Object.freeze(DYNAMIC_PUBLIC_PAGES.map((page) => Object.freeze({ ...page })))

export function getPublicPageMeta(pathname = '/') {
  const normalized = normalizePath(pathname)
  const exact = publicPageRegistry.find((page) => page.path === normalized)
  if (exact) return exact
  const dynamic = publicPagePatterns.find((page) => page.pattern.test(normalized))
  if (dynamic) return { ...dynamic, path: normalized }
  return { id: 'not-found', label: 'Not found page', path: normalized, family: 'system' }
}

export function withSiteEdit(path = '/') {
  const value = String(path || '/')
  const [withoutHash, hash = ''] = value.split('#', 2)
  const [pathname = '/', query = ''] = withoutHash.split('?', 2)
  const params = new URLSearchParams(query)
  params.set('edit', 'site')
  const search = params.toString()
  return `${normalizePath(pathname)}${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`
}

function normalizePath(value = '/') {
  const pathname = String(value || '/').split(/[?#]/, 1)[0] || '/'
  if (pathname === '/') return '/'
  return `/${pathname.replace(/^\/+|\/+$/g, '')}`
}
