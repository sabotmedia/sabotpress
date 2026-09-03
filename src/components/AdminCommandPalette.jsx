import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminRoutes } from '../routing/routes'
import { getPublishingModulePrefs, isPublishingModuleEnabled, publishingModulesChangeEvent } from '../lib/publishingModules'
import { useAdminAuth } from './AdminAuthContext'

const COMMANDS = [
  { label: 'Dashboard', description: 'Open the newsroom dashboard', to: adminRoutes.dashboard, keywords: ['home', 'newsroom'] },
  { label: 'New Article', description: 'Create a new post', to: adminRoutes.addNew, keywords: ['post', 'draft', 'write'], capability: 'content:write', module: 'articles' },
  { label: 'Posts', description: 'Browse and edit content', to: adminRoutes.posts, keywords: ['articles', 'content'], module: 'articles' },
  { label: 'Media Library', description: 'Browse media and upload when allowed', to: adminRoutes.media, keywords: ['images', 'files', 'uploads'] },
  { label: 'Printlab', description: 'Open printable layout tools', to: adminRoutes.printlab, keywords: ['print', 'zine', 'poster'], module: 'printlab' },
  { label: 'AudioLab', description: 'Open audio projects and episode tools', to: adminRoutes.audiolab, keywords: ['audio', 'waveform', 'episode'], module: 'audiolab' },
  { label: 'Podcasts', description: 'Manage podcast episodes and the public feed', to: adminRoutes.podcasts, keywords: ['podcast', 'episodes', 'rss', 'audio'], module: 'podcasts' },
  { label: 'Collections', description: 'Organize bodies of work', to: adminRoutes.collections, keywords: ['projects', 'archive'], module: 'articles' },
  { label: 'Campaigns', description: 'Create and manage campaign hubs, updates, resources, graphics, sources, and coverage', to: adminRoutes.campaigns, keywords: ['campaign', 'new campaign', 'hub', 'updates', 'letters', 'coverage'], capability: 'publishing:write', module: 'campaigns' },
  { label: 'Publications', description: 'Build zines, readers, and editions', to: adminRoutes.publications, keywords: ['zine', 'booklet', 'issue'], module: 'publications' },
  { label: 'Feeds', description: 'View RSS and syndication', to: adminRoutes.feeds, keywords: ['rss', 'syndication', 'podcast feed'] },
  { label: 'Pages', description: 'Open the public route inventory', to: adminRoutes.pages, keywords: ['about', 'contact', 'support', 'submit', 'security'], module: 'articles' },
  { label: 'Analytics', description: 'View first-party D1 traffic reports', to: adminRoutes.analytics, keywords: ['traffic', 'visitors', 'referrers', 'campaigns'], capability: 'analytics:view' },
  { label: 'Taxonomy', description: 'Manage tags, themes, series, and terms', to: adminRoutes.taxonomy, keywords: ['tags', 'categories', 'series'], module: 'articles' },
  { label: 'Editorial QA', description: 'Review editorial readiness and workflow', to: adminRoutes.qa, keywords: ['review', 'check', 'workflow'], module: 'articles' },
  { label: 'Site Health', description: 'Check bindings, storage, links, media, RSS, and readiness', to: adminRoutes.siteHealth, keywords: ['health', 'broken links', 'd1', 'r2'], capability: 'system:view' },
  { label: 'Backups', description: 'Export a verified server-backed system snapshot', to: adminRoutes.backup, keywords: ['export', 'backup', 'snapshot'], capability: 'system:view' },
  { label: 'Audit Log', description: 'Review recent persisted site changes', to: adminRoutes.auditLog, keywords: ['history', 'changes'], capability: 'system:view' },
  { label: 'Settings', description: 'Edit production-backed site configuration', to: adminRoutes.settings, keywords: ['configuration', 'customize', 'theme', 'site config'], capability: 'site:manage' },
  { label: 'Users & Access', description: 'Manage individual accounts and enforced roles', to: adminRoutes.users, keywords: ['account', 'auth', 'rbac', 'roles'], capability: 'users:manage' },
]

function commandMatches(command, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [command.label, command.description, ...(command.keywords || [])].join(' ').toLowerCase().includes(q)
}

export function AdminCommandPalette() {
  const navigate = useNavigate()
  const { capabilities } = useAdminAuth()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [modulePrefs, setModulePrefs] = useState(() => getPublishingModulePrefs())
  const can = (capability) => !capability || capabilities.includes('*') || capabilities.includes(capability)
  const moduleEnabled = (id) => !id || isPublishingModuleEnabled(id, modulePrefs)
  const results = useMemo(() => COMMANDS.filter((command) => can(command.capability) && moduleEnabled(command.module) && commandMatches(command, query)).slice(0, 10), [capabilities, modulePrefs, query])

  useEffect(() => {
    const eventName = publishingModulesChangeEvent()
    const refresh = (event) => setModulePrefs(event?.detail || getPublishingModulePrefs())
    window.addEventListener(eventName, refresh)
    return () => window.removeEventListener(eventName, refresh)
  }, [])

  useEffect(() => {
    function handleKeyDown(event) {
      const isModifier = event.metaKey || event.ctrlKey
      if (isModifier && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
        setQuery('')
        setActiveIndex(0)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => { setActiveIndex(0) }, [query])

  function runCommand(command) {
    if (!command) return
    setOpen(false)
    setQuery('')
    navigate(command.to)
  }

  if (!open) return null

  return (
    <div className="admin-command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div className="admin-command-palette__panel">
        <div className="admin-command-palette__search">
          <span aria-hidden="true">⌘K</span>
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(results.length - 1, index + 1)) }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)) }
            if (event.key === 'Enter') { event.preventDefault(); runCommand(results[activeIndex]) }
          }} placeholder="Search commands, routes, and tools..." aria-label="Search admin commands" />
        </div>
        <div className="admin-command-palette__results" role="listbox" aria-label="Admin commands">
          {results.length ? results.map((command, index) => (
            <button type="button" role="option" aria-selected={index === activeIndex} key={command.to} className={`admin-command-palette__item${index === activeIndex ? ' is-active' : ''}`} onMouseEnter={() => setActiveIndex(index)} onClick={() => runCommand(command)}>
              <strong>{command.label}</strong><span>{command.description}</span>
            </button>
          )) : <p className="description">No matching commands for this account.</p>}
        </div>
      </div>
    </div>
  )
}
