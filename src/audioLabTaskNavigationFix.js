function isAudioLabRoute() {
  return typeof window !== 'undefined' && /\/wp-admin\/audiolab(?:\/|$)/.test(window.location.pathname)
}

function normalizeAudioLabUrl(rawHref = '') {
  try {
    const url = new URL(rawHref, window.location.origin)
    if (!/\/wp-admin\/audiolab(?:\/|$)/.test(url.pathname)) return null
    return `${url.pathname}${url.search || ''}${url.hash || ''}`
  } catch {
    return null
  }
}

function navigateAudioLab(rawHref) {
  const next = normalizeAudioLabUrl(rawHref)
  if (!next) return false
  const current = `${window.location.pathname}${window.location.search || ''}${window.location.hash || ''}`
  if (next !== current) window.history.pushState({}, '', next)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.dispatchEvent(new Event('audiolab:navigation'))
  return true
}

function handleWorkflowClick(event) {
  if (!isAudioLabRoute()) return
  const link = event.target?.closest?.('.audio-lab-workflow-nav a, .audio-lab-task-tabs a, .audio-lab-task-actions a, .audio-lab-task-card--empty a')
  if (!link) return
  const href = link.getAttribute('href') || link.href || ''
  if (!normalizeAudioLabUrl(href)) return
  event.preventDefault()
  event.stopPropagation()
  navigateAudioLab(href)
}

function handleProjectSelect(event) {
  if (!isAudioLabRoute()) return
  const select = event.target?.closest?.('#audio-lab-task-project-select')
  if (!select) return
  const params = new URLSearchParams(window.location.search || '')
  params.set('project', select.value)
  const task = params.get('task') || ''
  const next = task ? `/wp-admin/audiolab?${params.toString()}` : `/wp-admin/audiolab?project=${encodeURIComponent(select.value)}`
  event.preventDefault()
  navigateAudioLab(next)
}

window.addEventListener('click', handleWorkflowClick, true)
window.addEventListener('change', handleProjectSelect, true)
