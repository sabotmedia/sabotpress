import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { adminRoutes } from '../routing/routes'
import {
  getPublicationIdentity,
  getPublishingModulePrefs,
  hydratePublishingSetup,
  isPublishingModuleEnabled,
  publishingModulesChangeEvent,
} from '../lib/publishingModules'
import { isLocalRuntime, runtimeLabel } from '../lib/runtime'
import mastheadLogo from '../assets/sabotpress-masthead.svg'
import { AdminCommandPalette } from './AdminCommandPalette'
import { useAdminAuth } from './AdminAuthContext'

const RAIL_STATE_KEY = 'sabot-admin-rail-collapsed-v1'

const NAV_GROUPS = [
  { id: 'content', label: 'Content', icon: '✎', items: [
    { to: adminRoutes.posts, label: 'Posts', module: 'articles' },
    { to: adminRoutes.addNew, label: 'Add New', capability: 'content:write', module: 'articles' },
    { to: adminRoutes.pages, label: 'Pages', module: 'articles' },
    { to: adminRoutes.collections, label: 'Collections', module: 'articles' },
    { to: adminRoutes.taxonomy, label: 'Taxonomy', module: 'articles' },
  ] },
  { id: 'publishing', label: 'Publishing', icon: '↗', items: [
    { to: adminRoutes.publications, label: 'Publications', module: 'publications' },
    { to: adminRoutes.campaigns, label: 'Campaigns', capability: 'publishing:write', module: 'campaigns' },
    { to: adminRoutes.podcasts, label: 'Podcasts', module: 'podcasts' },
    { to: adminRoutes.translations, label: 'Translations', capability: 'publishing:write', module: 'translations' },
    { to: adminRoutes.feeds, label: 'Feeds & Syndication' },
    { to: adminRoutes.qa, label: 'Editorial QA', module: 'articles' },
  ] },
  { id: 'media', label: 'Media & Labs', icon: '▣', items: [
    { to: adminRoutes.media, label: 'Media Library' },
    { to: adminRoutes.printlab, label: 'Printlab', module: 'printlab' },
    { to: adminRoutes.audiolab, label: 'AudioLab', module: 'audiolab' },
  ] },
  { id: 'site', label: 'Site', icon: '⌂', items: [
    { to: adminRoutes.settings, label: 'Settings', capability: 'site:manage' },
    { to: adminRoutes.analytics, label: 'Analytics', capability: 'analytics:view', serverOnly: true },
  ] },
  { id: 'system', label: 'System', icon: '⚙', items: [
    { to: adminRoutes.siteHealth, label: 'Site Health', capability: 'system:view' },
    { to: adminRoutes.backup, label: 'Backups', capability: 'system:view' },
    { to: adminRoutes.auditLog, label: 'Audit Log', capability: 'system:view', serverOnly: true },
    { to: adminRoutes.users, label: 'Users & Access', capability: 'users:manage', serverOnly: true },
  ] },
]

function AdminBarMenu({ label, children, className = '' }) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)
  useEffect(() => {
    function handleClickOutside(event) { if (menuRef.current && !menuRef.current.contains(event.target)) setIsOpen(false) }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  return (
    <div ref={menuRef} className={`wp-admin-topbar__menu ${isOpen ? 'is-open' : ''} ${className}`.trim()}>
      <button type="button" className="wp-admin-topbar__button" aria-haspopup="true" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>{label}</button>
      <div className="wp-admin-topbar__dropdown" role="menu" aria-label={typeof label === 'string' ? label : 'menu'} onClick={() => setIsOpen(false)}>{children}</div>
    </div>
  )
}

function pathMatches(pathname, target) { return Boolean(target && (pathname === target || pathname.startsWith(`${target}/`))) }

export function AdminRail({ collapsed, onToggleCollapsed }) {
  const location = useLocation()
  const { capabilities, session } = useAdminAuth()
  const localRuntime = isLocalRuntime()
  const localLabel = runtimeLabel()
  const [primarySiteName, setPrimarySiteName] = useState(() => getPublicationIdentity().name || 'SabotPress')
  const [modulePrefs, setModulePrefs] = useState(() => getPublishingModulePrefs())
  const [paletteOpenTick, setPaletteOpenTick] = useState(0)
  const hasCapability = (capability) => !capability || capabilities.includes('*') || capabilities.includes(capability)
  const moduleEnabled = (id) => !id || isPublishingModuleEnabled(id, modulePrefs)
  const groups = useMemo(() => NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasCapability(item.capability) && moduleEnabled(item.module) && !(localRuntime && item.serverOnly)),
  })).filter((group) => group.items.length), [capabilities, modulePrefs, localRuntime])
  const activeGroup = groups.find((group) => group.items.some((item) => pathMatches(location.pathname, item.to)))?.id || ''
  const [openGroups, setOpenGroups] = useState(() => new Set(activeGroup ? [activeGroup] : ['content']))
  const canCreate = hasCapability('content:write') || hasCapability('media:write') || hasCapability('publishing:write')
  const canManageSite = hasCapability('site:manage')
  const canManageUsers = !localRuntime && hasCapability('users:manage')

  useEffect(() => { if (activeGroup) setOpenGroups((current) => current.has(activeGroup) ? current : new Set(current).add(activeGroup)) }, [activeGroup])
  useEffect(() => {
    const eventName = publishingModulesChangeEvent()
    const refresh = (event) => { setModulePrefs(event?.detail || getPublishingModulePrefs()); setPrimarySiteName(getPublicationIdentity().name || 'SabotPress') }
    window.addEventListener(eventName, refresh)
    hydratePublishingSetup().then((setup) => { setModulePrefs(setup); setPrimarySiteName(setup.identity?.name || 'SabotPress') }).catch(() => {})
    return () => window.removeEventListener(eventName, refresh)
  }, [])
  useEffect(() => { if (paletteOpenTick) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })) }, [paletteOpenTick])

  function toggleGroup(groupId) {
    if (collapsed) { onToggleCollapsed(false); setOpenGroups((current) => new Set(current).add(groupId)); return }
    setOpenGroups((current) => { const next = new Set(current); if (next.has(groupId)) next.delete(groupId); else next.add(groupId); return next })
  }

  return (
    <>
      <AdminCommandPalette />
      <div className="wp-admin-topbar" role="navigation" aria-label="SabotPress admin bar">
        <div className="wp-admin-topbar__left">
          <Link to={adminRoutes.dashboard} className="wp-admin-topbar__link wp-admin-topbar__link--icon" aria-label="SabotPress" title="SabotPress"><span className="wp-admin-topbar__wpicon" aria-hidden="true">S</span></Link>
          <AdminBarMenu label="My Site">
            <Link to="/" className="wp-admin-topbar__dropdown-link">{primarySiteName}</Link>
            {canManageSite ? <Link to={adminRoutes.settings} className="wp-admin-topbar__dropdown-link">Site Settings</Link> : null}
            {localRuntime ? <Link to="/publish-online" className="wp-admin-topbar__dropdown-link">Back up / Publish Online</Link> : null}
          </AdminBarMenu>
          <Link to="/" className="wp-admin-topbar__link wp-admin-topbar__brand-logo-link" aria-label="SabotPress home"><img src={mastheadLogo} alt="SabotPress" className="wp-admin-topbar__brand-logo" /></Link>
          {canCreate ? <AdminBarMenu label="+ New">
            {hasCapability('content:write') && moduleEnabled('articles') ? <Link to={adminRoutes.addNew} className="wp-admin-topbar__dropdown-link">Post</Link> : null}
            {hasCapability('content:write') && moduleEnabled('podcasts') ? <Link to={`${adminRoutes.nativeBridge}?new=podcast`} className="wp-admin-topbar__dropdown-link">Podcast Episode</Link> : null}
            {hasCapability('media:write') ? <Link to={adminRoutes.media} className="wp-admin-topbar__dropdown-link">Media</Link> : null}
            {hasCapability('publishing:write') && moduleEnabled('articles') ? <Link to={adminRoutes.collections} className="wp-admin-topbar__dropdown-link">Collection</Link> : null}
            {hasCapability('publishing:write') && moduleEnabled('campaigns') ? <Link to={adminRoutes.campaigns} className="wp-admin-topbar__dropdown-link">Campaign</Link> : null}
            {hasCapability('publishing:write') && moduleEnabled('publications') ? <Link to={adminRoutes.publications} className="wp-admin-topbar__dropdown-link">Publication</Link> : null}
            {hasCapability('media:write') && moduleEnabled('audiolab') ? <Link to={adminRoutes.audiolab} className="wp-admin-topbar__dropdown-link">AudioLab Project</Link> : null}
          </AdminBarMenu> : null}
          <button type="button" className="wp-admin-topbar__button wp-admin-topbar__command" aria-label="Open command palette" onClick={() => setPaletteOpenTick((tick) => tick + 1)}>⌘K</button>
        </div>
        <div className="wp-admin-topbar__right">
          {localRuntime ? <span className="runtime-local-badge">● {localLabel}</span> : null}
          <AdminBarMenu label={localRuntime ? 'Local publication' : (session?.user?.displayName || session?.user?.email || session?.role || 'Account')} className="wp-admin-topbar__menu--right">
            {canManageUsers ? <Link to={adminRoutes.users} className="wp-admin-topbar__dropdown-link">Users & Access</Link> : null}
            {localRuntime ? <>
              <span className="wp-admin-topbar__dropdown-link" aria-disabled="true">No account is required in this local edition.</span>
              <Link to="/publish-online" className="wp-admin-topbar__dropdown-link">Export backup</Link>
            </> : <>
              <span className="wp-admin-topbar__dropdown-link" aria-disabled="true">Role: {session?.role || 'unknown'}</span>
              <Link to="/logout" className="wp-admin-topbar__dropdown-link">Log Out</Link>
            </>}
          </AdminBarMenu>
        </div>
      </div>
      <aside className={`admin-rail${collapsed ? ' is-collapsed' : ''}`} aria-label="Admin navigation">
        <div className="admin-rail__controls"><button type="button" className="admin-rail__toggle" onClick={() => onToggleCollapsed(!collapsed)} aria-label={collapsed ? 'Expand admin navigation' : 'Collapse admin navigation'} aria-expanded={!collapsed} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}><span aria-hidden="true">☰</span><span className="admin-rail__toggle-label">Menu</span></button></div>
        <nav className="admin-rail__nav">
          <NavLink to={adminRoutes.dashboard} className={({ isActive }) => `admin-rail__link admin-rail__link--primary${isActive ? ' is-active' : ''}`} title={collapsed ? 'Dashboard' : undefined}><span className="admin-rail__icon" aria-hidden="true">●</span><span className="admin-rail__text">Dashboard</span></NavLink>
          {groups.map((group) => {
            const isOpen = openGroups.has(group.id)
            const isGroupActive = activeGroup === group.id
            return <div key={group.id} className={`admin-rail__group${isOpen ? ' is-open' : ''}${isGroupActive ? ' is-active' : ''}`}>
              <button type="button" className="admin-rail__group-toggle" onClick={() => toggleGroup(group.id)} aria-expanded={isOpen && !collapsed} aria-controls={`admin-rail-group-${group.id}`} title={collapsed ? group.label : undefined}><span className="admin-rail__icon" aria-hidden="true">{group.icon}</span><span className="admin-rail__text">{group.label}</span><span className="admin-rail__chevron" aria-hidden="true">›</span></button>
              <div id={`admin-rail-group-${group.id}`} className="admin-rail__subnav" hidden={collapsed || !isOpen}>{group.items.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `admin-rail__sublink${isActive ? ' is-active' : ''}`}>{item.label}</NavLink>)}</div>
            </div>
          })}
        </nav>
      </aside>
    </>
  )
}

export function AdminFrame({ children }) {
  const [railCollapsed, setRailCollapsed] = useState(() => { try { const stored = window.localStorage.getItem(RAIL_STATE_KEY); return stored === null ? true : stored === '1' } catch { return true } })
  function setCollapsed(next) { const value = Boolean(next); setRailCollapsed(value); try { window.localStorage.setItem(RAIL_STATE_KEY, value ? '1' : '0') } catch { /* UI preference only */ } }
  return <div className={`admin-frame${railCollapsed ? ' admin-frame--rail-collapsed' : ''}`}><AdminRail collapsed={railCollapsed} onToggleCollapsed={setCollapsed} /><div className="admin-frame__main">{children}</div></div>
}
