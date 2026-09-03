export const PUBLIC_SURFACE_TARGETS = {
  general: {
    key: 'general',
    title: 'General Updates',
    eyebrow: 'surface / general / updates',
    description: 'Published native entries targeted at the general public updates lane.',
    route: '/updates',
  },
  press: {
    key: 'press',
    title: 'Press Updates',
    eyebrow: 'surface / press / updates',
    description: 'Published native entries targeted at press, statements, and outward-facing updates.',
    route: '/press',
  },
  projects: {
    key: 'projects',
    title: 'Project Updates',
    eyebrow: 'surface / projects / updates',
    description: 'Published native entries targeted at project-specific public publishing lanes.',
    route: '/archive',
  },
  home: {
    key: 'home',
    title: 'Home Surface',
    eyebrow: 'surface / home / featured',
    description: 'Published native entries targeted at the homepage surface.',
    route: '/',
  },
}

export function getSurfaceConfig(target) {
  return PUBLIC_SURFACE_TARGETS[target] || PUBLIC_SURFACE_TARGETS.general
}

export function listSurfaceConfigs() {
  return Object.values(PUBLIC_SURFACE_TARGETS)
}
