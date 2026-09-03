function isAudioLabRoute() {
  return typeof window !== 'undefined' && /\/wp-admin\/audiolab(?:\/|$)/.test(window.location.pathname)
}

function transcriptShell() {
  return document.querySelector('.audio-lab-task-shell')
}

function getQualitySelect(shell = transcriptShell()) {
  return shell?.querySelector?.('#audio-lab-local-model-quality') || null
}

function addResponsiveNotice(shell = transcriptShell()) {
  const select = getQualitySelect(shell)
  const actions = shell?.querySelector?.('.audio-lab-local-transcript-actions')
  if (!shell || !select || !actions || shell.querySelector('.audio-lab-transcript-responsive-note')) return

  const note = document.createElement('p')
  note.className = 'description audio-lab-transcript-responsive-note'
  note.textContent = 'Best local is available again. It now uses the resumable Best path when selected, saves after every chunk, and can resume after a browser stall or reload.'
  actions.insertAdjacentElement('afterend', note)
}

function tuneQualitySelect(shell = transcriptShell()) {
  const select = getQualitySelect(shell)
  if (!select) return false

  const best = Array.from(select.options || []).find((option) => option.value === 'best')
  if (best) {
    best.textContent = 'Best local — slow, resumable, saves every chunk'
    best.disabled = false
  }

  addResponsiveNotice(shell)
  return true
}

function scheduleTune(delay = 120) {
  window.setTimeout(() => tuneQualitySelect(), delay)
}

function startObserver() {
  if (typeof MutationObserver === 'undefined') return
  const observer = new MutationObserver(() => {
    if (!isAudioLabRoute()) return
    tuneQualitySelect()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

window.addEventListener('load', () => {
  startObserver()
  scheduleTune(100)
  scheduleTune(650)
})
window.addEventListener('popstate', () => scheduleTune(120))
window.addEventListener('audiolab:navigation', () => scheduleTune(120))
window.addEventListener('audiolab-task-navigation', () => scheduleTune(120))
scheduleTune(250)
scheduleTune(1000)
