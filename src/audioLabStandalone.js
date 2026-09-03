const AUDIO_LAB_PATHS = new Set(['/wp-admin/audiolab', '/audiolab'])
const STUDIO_PARAM = 'studio'
const STUDIO_BOOT_PARAM = 'audiolab-studio'
const STUDIO_WINDOW_NAME = 'sabot-audiolab-studio'
let trackObserver = null
let observedTrackInner = null
let trackFrame = 0

function bootstrapStudioRoute() {
  if (typeof window === 'undefined') return
  const pathname = String(window.location.pathname || '/')
  const params = new URLSearchParams(window.location.search)
  if (pathname !== '/' || params.get(STUDIO_BOOT_PARAM) !== '1') return

  params.delete(STUDIO_BOOT_PARAM)
  params.set(STUDIO_PARAM, '1')
  const query = params.toString()
  const next = `/wp-admin/audiolab${query ? `?${query}` : ''}${window.location.hash || ''}`
  window.history.replaceState(window.history.state, '', next)
}

// A fresh popup first requests the guaranteed root document. Rewrite the
// location before React Router and the route-aware AudioLab modules initialize.
bootstrapStudioRoute()

function isAudioLabPath(pathname = window.location.pathname) {
  return AUDIO_LAB_PATHS.has(String(pathname || '').replace(/\/+$/, '') || '/')
}

function isStudioMode() {
  if (!isAudioLabPath()) return false
  return new URLSearchParams(window.location.search).get(STUDIO_PARAM) === '1'
}

function makeStudioUrl(input = window.location.href) {
  const source = new URL(input, window.location.origin)
  const url = new URL('/', window.location.origin)
  source.searchParams.forEach((value, key) => {
    if (key !== STUDIO_PARAM && key !== STUDIO_BOOT_PARAM) url.searchParams.set(key, value)
  })
  url.searchParams.set(STUDIO_BOOT_PARAM, '1')
  return url
}

function studioWindowFeatures() {
  const width = Math.max(960, Number(window.screen?.availWidth || window.innerWidth || 1280))
  const height = Math.max(700, Number(window.screen?.availHeight || window.innerHeight || 800))
  const left = Number(window.screen?.availLeft || 0)
  const top = Number(window.screen?.availTop || 0)
  return [
    'popup=yes',
    `width=${Math.round(width)}`,
    `height=${Math.round(height)}`,
    `left=${Math.round(left)}`,
    `top=${Math.round(top)}`,
    'resizable=yes',
    'scrollbars=no',
  ].join(',')
}

function openStudio(input) {
  const url = makeStudioUrl(input)
  const studio = window.open(url.href, STUDIO_WINDOW_NAME, studioWindowFeatures())
  if (studio) {
    try { studio.focus() } catch { /* browser may deny focus */ }
    return true
  }
  // Popup blockers should never strand the editor. Fall back to the same tab.
  window.location.assign(url.href)
  return false
}

function applyStudioClass() {
  const active = isStudioMode()
  document.documentElement.classList.toggle('audio-lab-standalone-window', active)
  document.body?.classList.toggle('audio-lab-standalone-window', active)

  const prefix = 'AudioLab Studio · '
  if (active && !document.title.startsWith(prefix)) document.title = `${prefix}${document.title}`
  if (!active && document.title.startsWith(prefix)) document.title = document.title.slice(prefix.length)
}

function countTrackRows(inner) {
  return Array.from(inner?.children || []).filter((node) => node.classList?.contains('audio-lab-multitrack-row')).length
}

function applyTrackGeometry(inner = observedTrackInner) {
  trackFrame = 0
  if (!isStudioMode() || !inner?.isConnected) return
  const renderedTrackCount = countTrackRows(inner)
  const count = Math.max(1, renderedTrackCount)
  const nextCount = String(count)
  const nextMin = `${25 + count * 132}px`
  document.body?.classList.toggle('audio-lab-empty-project', renderedTrackCount === 0)
  if (inner.style.getPropertyValue('--al-track-count') !== nextCount) inner.style.setProperty('--al-track-count', nextCount)
  if (inner.style.getPropertyValue('--al-track-content-min') !== nextMin) inner.style.setProperty('--al-track-content-min', nextMin)
}

function scheduleTrackGeometry() {
  if (trackFrame) return
  trackFrame = window.requestAnimationFrame(() => applyTrackGeometry())
}

function disconnectTrackObserver() {
  trackObserver?.disconnect()
  trackObserver = null
  observedTrackInner = null
  if (trackFrame) window.cancelAnimationFrame(trackFrame)
  trackFrame = 0
  document.body?.classList.remove('audio-lab-empty-project')
}

function syncTrackGeometry() {
  if (!isStudioMode()) {
    disconnectTrackObserver()
    return
  }

  const inner = document.querySelector('.audio-lab-multitrack-inner')
  if (!inner) return

  if (inner !== observedTrackInner) {
    disconnectTrackObserver()
    observedTrackInner = inner
    if (typeof MutationObserver !== 'undefined') {
      trackObserver = new MutationObserver(scheduleTrackGeometry)
      // Only track direct add/remove operations. Never observe the whole document:
      // doing so can self-trigger on title/UI mutations and lock the renderer.
      trackObserver.observe(inner, { childList: true, subtree: false })
    }
  }

  applyTrackGeometry(inner)
}

function ensurePopoutButton() {
  if (!isAudioLabPath() || isStudioMode()) return
  const actions = document.querySelector('.audio-lab-page .audio-lab-header .review-card__actions')
  if (!actions || actions.querySelector('[data-audiolab-open-studio]')) return
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'button button--primary audio-lab-open-studio'
  button.dataset.audiolabOpenStudio = '1'
  button.textContent = 'Open Studio ↗'
  button.addEventListener('click', () => openStudio(window.location.href))
  actions.prepend(button)
}

function refresh() {
  applyStudioClass()
  ensurePopoutButton()
  syncTrackGeometry()
}

function handleAudioLabLink(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
  if (!anchor) return
  let url
  try { url = new URL(anchor.href, window.location.origin) } catch { return }
  if (url.origin !== window.location.origin || !isAudioLabPath(url.pathname)) return
  if (url.searchParams.get(STUDIO_PARAM) === '1') return
  if (isStudioMode()) return
  event.preventDefault()
  event.stopPropagation()
  openStudio(url.href)
}

document.addEventListener('click', handleAudioLabLink, true)
window.addEventListener('popstate', () => window.setTimeout(refresh, 0))
window.addEventListener('pageshow', refresh)
window.addEventListener('beforeunload', disconnectTrackObserver)
window.setTimeout(refresh, 0)
