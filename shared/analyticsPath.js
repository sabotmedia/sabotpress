const CONTENT_ALIASES = [
  [/^\/piece\/([^/]+)(?:\/print)?$/i, (match) => `/post/${match[1]}`],
  [/^\/print\/([^/]+)$/i, (match) => `/post/${match[1]}`],
  [/^\/post\/([^/]+)\/print$/i, (match) => `/post/${match[1]}`],
  [/^\/updates\/([^/]+)$/i, (match) => `/post/${match[1]}`],
]

export function canonicalizeAnalyticsPath(value) {
  let path = String(value || '/').split('?')[0].split('#')[0].trim()
  if (!path.startsWith('/') || path.length > 500) return '/'
  path = path.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'

  for (const [pattern, build] of CONTENT_ALIASES) {
    const match = path.match(pattern)
    if (match) return build(match).toLowerCase()
  }

  return path.toLowerCase()
}

export function analyticsPathLabel(value) {
  const path = canonicalizeAnalyticsPath(value)
  if (path === '/') return 'Homepage'

  const segment = path.startsWith('/post/') ? path.slice('/post/'.length) : path.slice(1)
  return segment
    .replace(/[-_/]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim() || 'Homepage'
}
