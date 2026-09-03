export function selectHubCoverage(items = [], limit = 8) {
  const sorted = [...(Array.isArray(items) ? items : [])].sort((a, b) => new Date(b?.date || 0) - new Date(a?.date || 0))
  const visible = sorted.filter((item) => item.editorialStatus !== 'hidden')
  const featured = visible.filter((item) => item.editorialStatus === 'featured')
  const automatic = visible.filter((item) => item.editorialStatus !== 'featured')
  const featuredLimit = automatic.length ? Math.max(0, limit - 1) : limit
  const chosenFeatured = featured.slice(0, featuredLimit)
  return [...chosenFeatured, ...automatic.filter((item) => !chosenFeatured.some((chosen) => sameCoverage(chosen, item)))].slice(0, limit)
}

function sameCoverage(a, b) {
  const leftUrl = String(a?.url || '').replace(/\/$/, '').toLowerCase()
  const rightUrl = String(b?.url || '').replace(/\/$/, '').toLowerCase()
  const leftTitle = String(a?.title || '').replace(/\W+/g, ' ').trim().toLowerCase()
  const rightTitle = String(b?.title || '').replace(/\W+/g, ' ').trim().toLowerCase()
  return Boolean((leftUrl && leftUrl === rightUrl) || (leftTitle && leftTitle === rightTitle))
}
