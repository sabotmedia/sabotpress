const ABOUT_PROJECT_LOGO_OVERRIDES = {
  'the-sabotuers': '/project-logos/the-sabotuers.svg',
}

function normalizeLogoIdentity(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function findMediaProjectLogo(project, assets = []) {
  if (!project?.slug || !Array.isArray(assets)) return ''

  const projectName = normalizeLogoIdentity(project.name)
  const projectSlug = normalizeLogoIdentity(project.slug)
  const acceptedNames = new Set([
    projectName,
    projectSlug,
    `${projectName} logo`,
    `${projectName} project logo`,
  ])

  const match = assets.find((asset) => {
    if (!asset?.url) return false
    const title = normalizeLogoIdentity(asset.title)
    const filename = normalizeLogoIdentity(asset.filename)
    const tags = Array.isArray(asset.tags) ? asset.tags.map(normalizeLogoIdentity) : []

    return acceptedNames.has(title)
      || acceptedNames.has(filename)
      || (tags.includes('project logo') && (tags.includes(projectName) || tags.includes(projectSlug)))
      || tags.includes(`${projectSlug} logo`)
  })

  return String(match?.url || '')
}

export function getAboutProjectLogo(project) {
  if (!project?.slug) return project?.logoUrl || ''

  // Glaring Examples deliberately has no repository fallback. Its raster artwork belongs
  // in the persistent Media Library, not inside an SVG/data-URI wrapper.
  if (project.slug === 'glaring-examples') return ''

  return ABOUT_PROJECT_LOGO_OVERRIDES[project.slug] || project.logoUrl || ''
}
