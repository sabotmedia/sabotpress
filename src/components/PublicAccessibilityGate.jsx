import { useLocation } from 'react-router-dom'
import { PublicAccessibilityPanel } from './PublicAccessibilityPanel'

const PRIVATE_PREFIXES = [
  '/admin', '/review', '/qa', '/content', '/posts', '/add-new', '/post-new', '/native-bridge', '/native-preview',
  '/podcasts', '/draft', '/overrides', '/system-backup', '/taxonomy', '/roles', '/audit-log', '/analytics',
  '/design-system', '/platform-map', '/media', '/pages', '/collections-admin', '/campaigns-admin', '/publications-admin',
  '/feeds-admin', '/users', '/menus', '/customize', '/site-editor', '/advanced-draft-tools', '/tools', '/site-health',
  '/printlab', '/audiolab', '/settings', '/sites', '/wp-admin', '/login', '/wp-login', '/logout', '/contribute/',
]

function isPrivateSurface(pathname) {
  return PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))
}

export function PublicAccessibilityGate() {
  const { pathname } = useLocation()
  if (isPrivateSurface(pathname)) return null
  return <PublicAccessibilityPanel />
}
