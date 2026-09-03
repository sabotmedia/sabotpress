export function getProjectTitleField(slug) {
  return `project.${String(slug || '').trim().toLowerCase()}.title`
}

export function getProjectDescriptionField(slug) {
  return `project.${String(slug || '').trim().toLowerCase()}.description`
}
