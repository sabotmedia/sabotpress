const GENERIC_PROJECT_KEYS = new Set([
  '',
  'general',
  'podcast',
  'podcasts',
  'article',
  'articles',
  'post',
  'posts',
  'comic',
  'comics',
  'zine',
  'zines',
  'newsletter',
  'newsletters',
  'print',
  'audio',
])

export const PUBLICATION_IDENTITY = {
  name: 'SabotPress',
  logoUrl: '',
}

export const PUBLIC_PROJECTS = []

export function normalizeProjectKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!?]+$/g, '')
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function toProjectSlug(value) {
  return normalizeProjectKey(value)
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const PROJECT_BY_ALIAS = new Map()
for (const project of PUBLIC_PROJECTS) {
  const values = [project.name, project.slug, ...(project.aliases || [])]
  for (const value of values) PROJECT_BY_ALIAS.set(normalizeProjectKey(value), project)
}

export function isGenericProject(value) {
  return GENERIC_PROJECT_KEYS.has(normalizeProjectKey(value))
}

export function findPublicProject(value) {
  const key = normalizeProjectKey(value)
  if (!key) return null
  return PROJECT_BY_ALIAS.get(key) || PUBLIC_PROJECTS.find((project) => project.slug === toProjectSlug(value)) || null
}

function flattenIdentityValues(values = []) {
  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => {
      if (!value || typeof value !== 'object') return value
      return value.name || value.title || value.slug || value.label || ''
    })
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

function collectProjectCandidates(piece) {
  return flattenIdentityValues([
    piece?.primaryProject,
    piece?.primaryProjectSlug,
    piece?.project,
    piece?.projectName,
    piece?.projects,
  ])
}

function collectDirectIdentityText(piece) {
  return flattenIdentityValues([
    piece?.title,
    piece?.subtitle,
    piece?.slug,
    piece?.nativeSlug,
    piece?.canonicalSlug,
    piece?.sourceUrl,
    piece?.permalink,
    piece?.href,
    piece?.feedTitle,
    piece?.sourceTitle,
    piece?.podcastTitle,
    piece?.showTitle,
    piece?.seriesTitle,
  ]).join(' ').toLowerCase()
}

function collectIntroIdentityText(piece) {
  return flattenIdentityValues([
    piece?.excerpt,
    piece?.bodyHtml,
    piece?.contentHtml,
    piece?.content,
  ]).join(' ').slice(0, 2400).toLowerCase()
}

function collectBodyIdentityText(piece) {
  return flattenIdentityValues([
    piece?.bodyHtml,
    piece?.contentHtml,
    piece?.content,
  ]).join(' ').toLowerCase()
}

function collectWeakIdentityText(piece) {
  return flattenIdentityValues([
    piece?.categories,
    piece?.tags,
  ]).join(' ').toLowerCase()
}

function countOccurrences(text, needle) {
  const haystack = String(text || '')
  const target = String(needle || '').toLowerCase()
  if (!haystack || !target) return 0

  let count = 0
  let offset = 0
  while (offset < haystack.length) {
    const match = haystack.indexOf(target, offset)
    if (match < 0) break
    count += 1
    offset = match + target.length
  }
  return count
}

function projectAllowedForType(project, type) {
  if (project.format !== 'podcast') return true
  return ['podcast', 'audio'].includes(String(type || '').toLowerCase())
}

function scoreProjectSignals(project, text, weight = 1) {
  if (!text || !project) return 0
  return (project.signals || []).reduce((score, signal) => {
    const normalizedSignal = String(signal || '').toLowerCase()
    const occurrences = countOccurrences(text, normalizedSignal)
    if (!occurrences) return score
    // Longer, more specific names beat tiny aliases when both happen to appear.
    const specificity = Math.max(1, Math.min(3, normalizedSignal.length / 12))
    return score + (occurrences * weight * specificity)
  }, 0)
}

function bestProjectForIdentity(piece, type, { includeBody = false } = {}) {
  const direct = collectDirectIdentityText(piece)
  const intro = collectIntroIdentityText(piece)
  const body = includeBody ? collectBodyIdentityText(piece) : ''

  let best = null
  let bestScore = 0

  for (const project of PUBLIC_PROJECTS) {
    if (!projectAllowedForType(project, type)) continue

    const score =
      scoreProjectSignals(project, direct, 100) +
      scoreProjectSignals(project, intro, 30) +
      scoreProjectSignals(project, body, 1)

    if (score > bestScore) {
      best = project
      bestScore = score
    }
  }

  return best
}

function projectFromWeakIdentity(piece, type) {
  const identity = collectWeakIdentityText(piece)
  if (!identity.trim()) return null

  let best = null
  let bestScore = 0
  for (const project of PUBLIC_PROJECTS) {
    if (!projectAllowedForType(project, type)) continue
    const score = scoreProjectSignals(project, identity, 1)
    if (score > bestScore) {
      best = project
      bestScore = score
    }
  }
  return best
}

export function fallbackProjectForType(type) {
  switch (String(type || '').toLowerCase()) {
    case 'comic':
      return findPublicProject('The Sabotuers')
    case 'zine':
    case 'print':
      return findPublicProject('Black Cat Distro')
    case 'newsletter':
      return findPublicProject('The Communique')
    case 'podcast':
    case 'audio':
      // Never invent a Example Project attribution merely because an imported item is audio.
      // Known podcast projects are resolved from show identity or explicit project metadata above.
      return findPublicProject('The Example Project')
    default:
      return findPublicProject('The Example Project')
  }
}

export function resolveArchiveProject(piece, type = 'article') {
  const candidates = collectProjectCandidates(piece)

  // Direct show/title/source identity and the opening copy outrank legacy taxonomy.
  // This catches TCAIE episodes whose guest-only titles were imported under Molotov.
  const strongIdentityProject = bestProjectForIdentity(piece, type)
  if (strongIdentityProject) return strongIdentityProject

  for (const candidate of candidates) {
    const canonical = findPublicProject(candidate)
    if (canonical) return canonical
  }

  // Only use incidental full-body mentions when there is no canonical project metadata.
  // That prevents a guest mentioning another Sabot show halfway through an interview from
  // re-filing the entire piece under that show.
  const bodyIdentityProject = bestProjectForIdentity(piece, type, { includeBody: true })
  if (bodyIdentityProject) return bodyIdentityProject

  const weakIdentityProject = projectFromWeakIdentity(piece, type)
  if (weakIdentityProject) return weakIdentityProject

  const explicit = candidates.find((candidate) => !isGenericProject(candidate))
  if (explicit) {
    return {
      name: explicit,
      slug: toProjectSlug(explicit),
      format: String(type || 'project'),
      featured: false,
      aliases: [],
      signals: [],
      description: 'Archive project.',
      logoUrl: '',
      dynamic: true,
    }
  }

  return fallbackProjectForType(type)
}

export function buildArchiveProjectOptions(items = []) {
  const counts = new Map()
  const dynamic = new Map()

  for (const item of items) {
    const project = item?.projectMeta || resolveArchiveProject(item, item?.type)
    if (!project?.slug) continue
    counts.set(project.slug, (counts.get(project.slug) || 0) + 1)
    if (project.dynamic) dynamic.set(project.slug, project)
  }

  const known = PUBLIC_PROJECTS
    .filter((project) => counts.has(project.slug))
    .map((project) => ({ ...project, count: counts.get(project.slug) || 0 }))

  const extras = [...dynamic.values()]
    .filter((project) => counts.has(project.slug))
    .map((project) => ({ ...project, count: counts.get(project.slug) || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return [...known, ...extras]
}

export function getFeaturedPublicProjects() {
  return PUBLIC_PROJECTS.filter((project) => project.featured)
}
