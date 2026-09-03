function isAudioLabRoute() {
  return typeof window !== 'undefined' && /\/wp-admin\/audiolab(?:\/|$)/.test(window.location.pathname)
}

function page() { return document.querySelector('.audio-lab-page') }

function command(name) {
  window.dispatchEvent(new CustomEvent('audiolab:command', { detail: { command: name } }))
}

function synthKey(key, options = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', {
    key,
    ctrlKey: Boolean(options.ctrl),
    shiftKey: Boolean(options.shift),
    bubbles: true,
    cancelable: true,
  }))
}

function zoom(direction) {
  const target = page()?.querySelector('.audio-lab-multitrack-scroll')
  if (!target) return
  const rect = target.getBoundingClientRect()
  target.dispatchEvent(new WheelEvent('wheel', {
    deltaY: direction > 0 ? -120 : 120,
    ctrlKey: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + 20,
    bubbles: true,
    cancelable: true,
  }))
}

const tools = [
  ['Select', 'Selection tool (V)', () => command('mode-select'), 'select'],
  ['Move', 'Move clip tool (M)', () => command('mode-move'), 'move'],
  ['Gain', 'Gain tool (G)', () => command('mode-gain'), 'gain'],
  ['↶', 'Undo (Ctrl/Cmd+Z)', () => command('undo')],
  ['↷', 'Redo (Ctrl+Y / Cmd+Shift+Z)', () => command('redo')],
  ['−', 'Zoom out (Ctrl/Cmd+wheel down)', () => zoom(-1)],
  ['+', 'Zoom in (Ctrl/Cmd+wheel up)', () => zoom(1)],
  ['Fit', 'Fit full project (Ctrl/Cmd+F)', () => synthKey('f', { ctrl: true })],
]

function syncActive(palette) {
  const mode = page()?.dataset.audiolabDirectMode || 'select'
  palette.querySelectorAll('[data-audiolab-tool-mode]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.audiolabToolMode === mode)
  })
}

function ensurePalette() {
  if (!isAudioLabRoute()) return
  const bar = page()?.querySelector('.audio-lab-audacity-menubar')
  if (!bar) return
  let palette = bar.querySelector('.audio-lab-audacity-tools')
  if (!palette) {
    palette = document.createElement('div')
    palette.className = 'audio-lab-audacity-tools'
    palette.setAttribute('role', 'toolbar')
    palette.setAttribute('aria-label', 'Audio editing tools')
    tools.forEach(([label, title, action, mode]) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.title = title
      button.setAttribute('aria-label', title)
      if (mode) button.dataset.audiolabToolMode = mode
      button.addEventListener('click', action)
      palette.appendChild(button)
    })
    const spacer = bar.querySelector('.audio-lab-menu-spacer')
    if (spacer) bar.insertBefore(palette, spacer)
    else bar.appendChild(palette)
  }
  syncActive(palette)
}

let observer = null
function start() {
  if (!isAudioLabRoute()) return
  ensurePalette()
  observer?.disconnect()
  observer = new MutationObserver(() => window.requestAnimationFrame(ensurePalette))
  observer.observe(document.getElementById('root') || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-audiolab-direct-mode'] })
}

window.addEventListener('load', start)
window.addEventListener('popstate', () => window.setTimeout(start, 80))
window.setTimeout(start, 240)
