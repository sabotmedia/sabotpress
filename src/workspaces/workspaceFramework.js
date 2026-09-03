export const workspaceTypes = Object.freeze({
  ARTICLE_STUDIO: 'Article Studio',
  PROJECT_STUDIO: 'Project Studio',
  MEDIA_STUDIO: 'Media Studio',
  THEME_STUDIO: 'Theme Studio',
  PRINTLAB: 'Printlab',
})

export function createWorkspaceDescriptor(id, overrides = {}) {
  return {
    id,
    title: overrides.title || id,
    route: overrides.route || '',
    stores: Array.isArray(overrides.stores) ? overrides.stores : [],
    editors: Array.isArray(overrides.editors) ? overrides.editors : [],
  }
}
