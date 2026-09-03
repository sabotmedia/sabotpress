/*
 * AudioLab runtime lifecycle bridge.
 *
 * Several of AudioLab's progressive-enhancement modules intentionally listen for
 * `popstate` so they can initialize on route changes. React Router's normal
 * pushState navigation does not emit popstate, which meant visiting AudioLab
 * through the admin UI could leave the Audacity menus, quick tools and local
 * voice generator completely uninitialized until a hard refresh.
 *
 * Keep this tiny bridge independent of the editor implementation: when a new
 * AudioLab page instance appears in the SPA, emit one synthetic popstate so all
 * existing route-aware AudioLab modules initialize against the rendered page.
 */

let observedPage = null
let frame = 0

function isAudioLabRoute() {
  return typeof window !== 'undefined' && /\/wp-admin\/audiolab(?:\/|$)/.test(window.location.pathname)
}

function syncAudioLabRuntime() {
  frame = 0
  if (!isAudioLabRoute()) {
    observedPage = null
    return
  }

  const page = document.querySelector('.audio-lab-page')
  if (!page || page === observedPage) return

  observedPage = page
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
}

function scheduleSync() {
  if (frame) return
  frame = window.requestAnimationFrame(syncAudioLabRuntime)
}

const observer = new MutationObserver(scheduleSync)
observer.observe(document.getElementById('root') || document.body, {
  childList: true,
  subtree: true,
})

window.addEventListener('load', scheduleSync)
window.addEventListener('popstate', scheduleSync)
window.setTimeout(scheduleSync, 0)
