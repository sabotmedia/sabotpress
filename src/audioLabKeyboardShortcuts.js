function isAudioLabRoute() {
  return typeof window !== 'undefined' && /\/wp-admin\/audiolab(?:\/|$)/.test(window.location.pathname)
}

function page() { return document.querySelector('.audio-lab-page') }
function audio() { return page()?.querySelector('audio') || null }

function isTypingTarget(target) {
  if (!target) return false
  const tag = String(target.tagName || '').toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

function parseTime(value = '') {
  const cleaned = String(value || '').replace('/', '').trim()
  const parts = cleaned.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return Number(cleaned) || 0
}

function durationSeconds() {
  const node = audio()
  if (node && Number.isFinite(node.duration) && node.duration > 0) return node.duration
  return parseTime(page()?.querySelector('.audio-lab-time-readout span')?.textContent || '')
}

function selectionInputs() {
  const fields = Array.from(page()?.querySelectorAll('.audio-lab-selection-fields input') || [])
  return { start: fields[0] || null, end: fields[1] || null }
}

function setNativeValue(input, value) {
  if (!input) return
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(input, String(value))
  else input.value = String(value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function setSelection(start, end) {
  const inputs = selectionInputs()
  setNativeValue(inputs.start, Math.max(0, Math.min(start, end)).toFixed(2))
  setNativeValue(inputs.end, Math.max(0, Math.max(start, end)).toFixed(2))
}

function selection() {
  const inputs = selectionInputs()
  const a = Number(inputs.start?.value || 0)
  const b = Number(inputs.end?.value || 0)
  return { start: Math.min(a, b), end: Math.max(a, b), hasSelection: Math.abs(b - a) > 0.03 }
}

function dispatchCommand(command) {
  window.dispatchEvent(new CustomEvent('audiolab:command', { detail: { command } }))
  flashShortcut(command.replace(/-/g, ' '))
  return true
}

function clickFileInput() {
  const input = page()?.querySelector('.audio-lab-file-input')
  if (!input) return false
  input.click()
  flashShortcut('Import audio')
  return true
}

function clickSave() {
  const button = Array.from(page()?.querySelectorAll('.audio-lab-header button') || []).find((node) => /save project/i.test(node.textContent || ''))
  if (!button || button.disabled) return false
  button.click()
  flashShortcut('Save project')
  return true
}

function flashShortcut(label) {
  const root = page()
  if (!root) return
  root.dataset.audiolabShortcutsReady = 'true'
  let node = root.querySelector('.audio-lab-shortcut-toast')
  if (!node) {
    node = document.createElement('div')
    node.className = 'audio-lab-shortcut-toast'
    node.setAttribute('role', 'status')
    root.appendChild(node)
  }
  node.textContent = label
  node.classList.add('is-visible')
  window.clearTimeout(flashShortcut.timer)
  flashShortcut.timer = window.setTimeout(() => node.classList.remove('is-visible'), 850)
}

function timelineScroll() { return page()?.querySelector('.audio-lab-multitrack-scroll') || null }
function timelineInner() { return timelineScroll()?.querySelector('.audio-lab-multitrack-inner') || null }
function currentZoom() { return Math.max(1, Number(page()?.dataset.audiolabZoom || '1') || 1) }

function ensureBaseTimelineWidth(inner) {
  if (!inner) return 0
  let base = Number(inner.dataset.audiolabBaseWidth || 0)
  if (!base) {
    base = Math.max(inner.scrollWidth, inner.getBoundingClientRect().width, 900)
    inner.dataset.audiolabBaseWidth = String(base)
  }
  return base
}

function scaleTimelineElements(scale) {
  const root = page()
  const inner = timelineInner()
  if (!root || !inner) return
  const previousScale = Math.max(1, Number(root.dataset.audiolabAppliedZoom || '1') || 1)

  inner.querySelectorAll('.audio-lab-clip').forEach((clip) => {
    const liveLeft = parseFloat(clip.style.left || '0') || 0
    const liveWidth = parseFloat(clip.style.width || '36') || 36
    let baseLeft = Number(clip.dataset.audiolabBaseLeft)
    let baseWidth = Number(clip.dataset.audiolabBaseClipWidth)
    if (!Number.isFinite(baseLeft) || Math.abs(liveLeft - baseLeft * previousScale) > 1) baseLeft = liveLeft
    if (!Number.isFinite(baseWidth) || Math.abs(liveWidth - baseWidth * previousScale) > 1) baseWidth = liveWidth
    clip.dataset.audiolabBaseLeft = String(baseLeft)
    clip.dataset.audiolabBaseClipWidth = String(baseWidth)
    clip.style.left = `${baseLeft * scale}px`
    clip.style.width = `${Math.max(36, baseWidth * scale)}px`
  })

  const playhead = inner.querySelector('.audio-lab-playhead')
  const node = audio()
  if (playhead && node) playhead.style.left = `${150 + Math.max(0, Number(node.currentTime || 0)) * 44 * scale}px`
  root.dataset.audiolabAppliedZoom = String(scale)
}

function applyZoom(nextScale, anchorClientX = null) {
  const root = page()
  const scroll = timelineScroll()
  const inner = timelineInner()
  if (!root || !scroll || !inner) return false
  const oldWidth = Math.max(1, scroll.scrollWidth)
  const viewportX = anchorClientX == null ? scroll.clientWidth / 2 : Math.max(0, Math.min(scroll.clientWidth, anchorClientX - scroll.getBoundingClientRect().left))
  const anchorRatio = Math.max(0, Math.min(1, (scroll.scrollLeft + viewportX) / oldWidth))
  const scale = Math.max(1, Math.min(64, Number(nextScale) || 1))
  const base = ensureBaseTimelineWidth(inner)
  root.dataset.audiolabZoom = String(scale)
  root.style.setProperty('--audiolab-zoom-scale', String(scale))
  inner.style.width = `${Math.max(base, base * scale)}px`
  scaleTimelineElements(scale)
  window.requestAnimationFrame(() => { scroll.scrollLeft = Math.max(0, anchorRatio * scroll.scrollWidth - viewportX) })
  return true
}

function fitTimeline() {
  const root = page()
  const scroll = timelineScroll()
  const inner = timelineInner()
  if (!root || !scroll || !inner) return false
  const base = ensureBaseTimelineWidth(inner)
  root.dataset.audiolabZoom = '1'
  root.style.setProperty('--audiolab-zoom-scale', '1')
  inner.style.width = `${base}px`
  scaleTimelineElements(1)
  scroll.scrollLeft = 0
  flashShortcut('Fit full project')
  return true
}

function zoomToSelection() {
  const sel = selection()
  const duration = durationSeconds()
  if (!sel.hasSelection || !duration) { flashShortcut('Select audio before zooming'); return true }
  const span = Math.max(0.03, sel.end - sel.start)
  const scale = Math.max(1, Math.min(64, (duration / span) * 0.92))
  if (!applyZoom(scale)) return false
  const scroll = timelineScroll()
  window.requestAnimationFrame(() => {
    if (!scroll) return
    const content = Math.max(1, scroll.scrollWidth - 150)
    scroll.scrollLeft = Math.max(0, (sel.start / duration) * content)
  })
  flashShortcut('Zoom to selection')
  return true
}

let playStart = 0
let loopState = null
function stopLoop() { loopState = null }

function togglePlayback() {
  const node = audio()
  if (!node || !node.src) return false
  stopLoop()
  if (!node.paused) {
    node.pause()
    node.currentTime = Math.max(0, playStart)
    scaleTimelineElements(currentZoom())
    flashShortcut('Stop')
    return true
  }
  playStart = Number.isFinite(node.currentTime) ? node.currentTime : 0
  node.play().catch(() => {})
  flashShortcut('Play')
  return true
}

function toggleLoopPlayback() {
  const node = audio()
  const sel = selection()
  if (!node || !node.src) return false
  if (loopState) {
    const start = loopState.start
    stopLoop()
    node.pause()
    node.currentTime = start
    scaleTimelineElements(currentZoom())
    flashShortcut('Loop stopped')
    return true
  }
  if (!sel.hasSelection) { flashShortcut('Select a region to loop'); return true }
  loopState = { start: sel.start, end: sel.end }
  playStart = sel.start
  node.currentTime = sel.start
  node.play().catch(() => {})
  flashShortcut('Loop selection')
  return true
}

function handleLoopTimeUpdate() {
  const node = audio()
  if (!node) return
  if (loopState && (node.currentTime >= loopState.end - 0.01 || node.currentTime < loopState.start - 0.01)) {
    node.currentTime = loopState.start
    if (node.paused) node.play().catch(() => {})
  }
  scaleTimelineElements(currentZoom())
}

function timeFromTimelinePointer(event) {
  const scroll = timelineScroll()
  const inner = timelineInner()
  const duration = durationSeconds()
  if (!scroll || !inner || !duration) return 0
  const rect = inner.getBoundingClientRect()
  const controls = 150
  const x = Math.max(0, Math.min(rect.width - controls, event.clientX - rect.left - controls))
  return (x / Math.max(1, rect.width - controls)) * duration
}

function quickPlay(event) {
  if (!isAudioLabRoute() || !event.target?.closest?.('.audio-lab-multitrack-ruler')) return
  const node = audio()
  if (!node || !node.src) return
  event.preventDefault()
  const point = timeFromTimelinePointer(event)
  stopLoop()
  playStart = point
  node.currentTime = point
  node.play().catch(() => {})
  scaleTimelineElements(currentZoom())
  flashShortcut(`Quick play ${point.toFixed(2)}s`)
}

function handleWheel(event) {
  if (!isAudioLabRoute()) return
  if (!event.target?.closest?.('.audio-lab-waveform, .audio-lab-multitrack, .audio-lab-multitrack-scroll')) return
  const scroll = timelineScroll()
  if (!scroll) return
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    const factor = event.deltaY < 0 ? 1.22 : 1 / 1.22
    applyZoom(currentZoom() * factor, event.clientX)
    return
  }
  if (Math.abs(event.deltaY) > 0 || Math.abs(event.deltaX) > 0) {
    event.preventDefault()
    scroll.scrollLeft += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  }
}

function handleShortcut(event) {
  if (!isAudioLabRoute()) return
  const key = String(event.key || '').toLowerCase()
  const cmd = event.metaKey || event.ctrlKey
  const shift = event.shiftKey
  const typing = isTypingTarget(event.target)
  if (typing && !(cmd && ['s', 'z', 'y'].includes(key))) return

  let handled = false
  if (!cmd && key === ' ') handled = shift ? toggleLoopPlayback() : togglePlayback()
  else if (cmd && key === 's') handled = clickSave()
  else if (cmd && key === 'o') handled = clickFileInput()
  else if (cmd && key === 'a') { setSelection(0, durationSeconds()); flashShortcut('Select all tracks'); handled = true }
  else if (cmd && key === 'e' && !shift) handled = zoomToSelection()
  else if (cmd && key === 'f') handled = fitTimeline()
  else if (cmd && key === 'i') handled = dispatchCommand('split')
  else if (cmd && key === 'k') handled = dispatchCommand('delete-close-gap')
  else if (cmd && key === 'l') handled = dispatchCommand('silence')
  else if (cmd && key === 'z' && !shift) handled = dispatchCommand('undo')
  else if ((event.ctrlKey && key === 'y') || (event.metaKey && shift && key === 'z')) handled = dispatchCommand('redo')
  else if ((key === 'delete' || key === 'backspace') && !typing) handled = dispatchCommand('delete')
  else if (cmd && key === 't') handled = dispatchCommand('trim')
  else if (cmd && shift && key === 'e') {
    const button = Array.from(page()?.querySelectorAll('.audio-lab-editor button') || []).find((node) => /export wav/i.test(node.textContent || ''))
    if (button && !button.disabled) { button.click(); handled = true; flashShortcut('Export WAV') }
  }

  if (handled) {
    event.preventDefault()
    event.stopPropagation()
  }
}

function markReady() {
  const root = page()
  if (!root) return
  root.dataset.audiolabShortcutsReady = 'true'
  if (!root.dataset.audiolabZoom) root.dataset.audiolabZoom = '1'
  const node = audio()
  if (node && !node.dataset.audiolabLoopBound) {
    node.dataset.audiolabLoopBound = 'true'
    node.addEventListener('timeupdate', handleLoopTimeUpdate)
  }
  const inner = timelineInner()
  if (inner) {
    ensureBaseTimelineWidth(inner)
    scaleTimelineElements(currentZoom())
  }
}

window.addEventListener('keydown', handleShortcut, true)
window.addEventListener('wheel', handleWheel, { capture: true, passive: false })
window.addEventListener('click', quickPlay, true)
window.addEventListener('load', markReady)
window.addEventListener('popstate', () => window.setTimeout(markReady, 80))
window.addEventListener('sabot:audiolab-project-updated', () => window.setTimeout(markReady, 80))
window.setInterval(markReady, 500)
window.setTimeout(markReady, 250)
