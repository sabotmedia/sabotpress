function isAudioLabRoute() {
  return typeof window !== 'undefined' && /\/wp-admin\/audiolab(?:\/|$)/.test(window.location.pathname)
}

function page() { return document.querySelector('.audio-lab-page') }

const menuSpec = [
  ['File', [
    ['New Project', 'new-project', ''],
    ['Import Audio…', 'import', 'Ctrl+O'],
    ['Save Project', 'save', 'Ctrl+S'],
    ['---'],
    ['Export WAV', 'export', 'Ctrl+Shift+E'],
  ]],
  ['Edit', [
    ['Undo', 'command:undo', 'Ctrl+Z'],
    ['Redo', 'command:redo', 'Ctrl+Y'],
    ['---'],
    ['Split at Playhead', 'command:split', 'Ctrl+I'],
    ['Delete + Close Gap', 'command:delete-close-gap', 'Ctrl+K'],
    ['Silence Selection', 'command:silence', 'Ctrl+L'],
    ['Trim to Selection', 'command:trim', 'Ctrl+T'],
  ]],
  ['Select', [
    ['Select All', 'key:a', 'Ctrl+A'],
    ['Clear Selection', 'clear-selection', ''],
    ['Zoom to Selection', 'key:e', 'Ctrl+E'],
  ]],
  ['View', [
    ['Zoom In', 'zoom-in', 'Ctrl+Wheel ↑'],
    ['Zoom Out', 'zoom-out', 'Ctrl+Wheel ↓'],
    ['Fit Full Project', 'key:f', 'Ctrl+F'],
    ['---'],
    ['Show / Hide Overview', 'toggle-overview', ''],
  ]],
  ['Transport', [
    ['Play / Stop', 'key:space', 'Space'],
    ['Loop Selection', 'key:loop', 'Shift+Space'],
    ['Stop to Start', 'transport-stop', ''],
    ['---'],
    ['Record', 'record', 'R'],
  ]],
  ['Tracks', [
    ['Add New Track', 'add-track', ''],
    ['Duplicate Selected Track', 'duplicate-track', ''],
    ['Delete Empty Selected Track', 'delete-track', ''],
  ]],
  ['Generate', [
    ['Robot Voice…', 'panel:robot', ''],
  ]],
  ['Effect', [
    ['Effects Rack…', 'panel:effects', ''],
  ]],
  ['Tools', [
    ['Clip Inspector…', 'panel:clip', ''],
    ['Transcript…', 'panel:transcript', ''],
    ['Markers / Chapters…', 'panel:markers', ''],
    ['Sources / Assets…', 'panel:sources', ''],
    ['Project Details…', 'panel:project', ''],
  ]],
  ['Episode', [
    ['Episode Metadata…', 'panel:metadata', ''],
    ['Publish / Render / RSS…', 'panel:publish', ''],
  ]],
  ['Help', [
    ['Keyboard & Mouse Shortcuts', 'shortcuts', '?'],
  ]],
]

const panelSelectors = {
  robot: '.audio-lab-robot-panel',
  effects: '.audio-lab-effects-panel',
  clip: '.audio-lab-clip-inspector',
  transcript: '.audio-lab-transcript-panel',
  markers: '.audio-lab-markers-panel',
  sources: '.audio-lab-source-bin',
  metadata: '.audio-lab-episode-meta-panel',
  publish: '.audio-lab-rendered-panel',
  project: '.audio-lab-project-sidebar > .audio-lab-panel:last-of-type',
}

const panelTitles = {
  robot: 'Generate: Robot Voice',
  effects: 'Effect: Effects Rack',
  clip: 'Tools: Clip Inspector',
  transcript: 'Tools: Transcript',
  markers: 'Tools: Markers / Chapters',
  sources: 'Tools: Sources / Assets',
  metadata: 'Episode: Metadata',
  publish: 'Episode: Publish / Render / RSS',
  project: 'Tools: Project Details',
}

function exactButton(selector, text) {
  const target = String(text || '').trim().toLowerCase()
  return Array.from(page()?.querySelectorAll(selector) || []).find((button) => String(button.textContent || '').trim().toLowerCase() === target) || null
}

function clickIfUsable(button) {
  if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return false
  button.click()
  return true
}

function dispatchCommand(command) {
  window.dispatchEvent(new CustomEvent('audiolab:command', { detail: { command } }))
}

function synthKey(key, { ctrl = false, shift = false } = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: ctrl, metaKey: false, shiftKey: shift, bubbles: true, cancelable: true }))
}

function setNativeValue(input, value) {
  if (!input) return
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(input, String(value))
  else input.value = String(value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function closeMenus(except = null) {
  page()?.querySelectorAll('.audio-lab-audacity-menu.is-open').forEach((menu) => {
    if (menu === except) return
    menu.classList.remove('is-open')
    menu.querySelector(':scope > button')?.setAttribute('aria-expanded', 'false')
  })
}

function modalSidebar() { return page()?.querySelector('.audio-lab-project-sidebar') || null }

function ensureBackdrop() {
  let backdrop = document.querySelector('.audio-lab-audacity-backdrop')
  if (!backdrop) {
    backdrop = document.createElement('div')
    backdrop.className = 'audio-lab-audacity-backdrop'
    backdrop.addEventListener('click', closeModal)
    document.body.appendChild(backdrop)
  }
  return backdrop
}

function ensureModalTitle() {
  const sidebar = modalSidebar()
  if (!sidebar) return null
  let title = sidebar.querySelector(':scope > .audio-lab-audacity-modal-title')
  if (!title) {
    title = document.createElement('div')
    title.className = 'audio-lab-audacity-modal-title'
    title.innerHTML = '<strong>AudioLab Tool</strong><button type="button" class="button" aria-label="Close tool">×</button>'
    title.querySelector('button')?.addEventListener('click', closeModal)
    sidebar.insertBefore(title, sidebar.firstChild)
  }
  return title
}

function closeModal() {
  const root = page()
  if (!root) return
  delete root.dataset.audiolabModalOpen
  document.body.classList.remove('audio-lab-modal-is-open')
}

function openPanel(id) {
  const root = page()
  const sidebar = modalSidebar()
  if (!root || !sidebar) return
  const selector = panelSelectors[id]
  const panel = selector ? sidebar.querySelector(selector.replace('.audio-lab-project-sidebar > ', '')) : null
  if (!panel) return

  const panels = Array.from(sidebar.querySelectorAll(':scope > .audio-lab-panel'))
  panels.forEach((item) => {
    const active = item === panel
    item.hidden = !active
    item.classList.toggle('is-inspector-active', active)
  })

  const panelId = panel.dataset.audiolabInspectorId
  sidebar.querySelectorAll(':scope > .audio-lab-inspector-tabs button').forEach((button) => {
    const active = panelId && button.dataset.inspectorTarget === panelId
    button.classList.toggle('is-active', Boolean(active))
    button.setAttribute('aria-selected', active ? 'true' : 'false')
  })

  const title = ensureModalTitle()
  if (title) title.querySelector('strong').textContent = panelTitles[id] || 'AudioLab Tool'
  ensureBackdrop()
  root.dataset.audiolabModalOpen = id
  document.body.classList.add('audio-lab-modal-is-open')
  closeMenus()
  window.requestAnimationFrame(() => panel.querySelector('input, textarea, select, button')?.focus({ preventScroll: true }))
}

function openShortcuts() {
  let dialog = document.querySelector('.audio-lab-shortcuts-dialog')
  if (!dialog) {
    dialog = document.createElement('section')
    dialog.className = 'audio-lab-shortcuts-dialog'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-label', 'AudioLab keyboard and mouse shortcuts')
    dialog.innerHTML = `
      <h2>AudioLab shortcuts</h2>
      <div class="audio-lab-shortcuts-grid">
        <div><span>Play / stop</span><kbd>Space</kbd></div>
        <div><span>Loop selection</span><kbd>Shift+Space</kbd></div>
        <div><span>Select all</span><kbd>Ctrl/Cmd+A</kbd></div>
        <div><span>Split at playhead</span><kbd>Ctrl/Cmd+I</kbd></div>
        <div><span>Delete + close gap</span><kbd>Ctrl/Cmd+K</kbd></div>
        <div><span>Silence selection</span><kbd>Ctrl/Cmd+L</kbd></div>
        <div><span>Undo</span><kbd>Ctrl/Cmd+Z</kbd></div>
        <div><span>Redo</span><kbd>Ctrl+Y / Cmd+Shift+Z</kbd></div>
        <div><span>Zoom to selection</span><kbd>Ctrl/Cmd+E</kbd></div>
        <div><span>Fit full project</span><kbd>Ctrl/Cmd+F</kbd></div>
        <div><span>Zoom in / out</span><kbd>Ctrl/Cmd + wheel</kbd></div>
        <div><span>Horizontal timeline scroll</span><kbd>Mouse wheel</kbd></div>
        <div><span>Selection tool</span><kbd>V</kbd></div>
        <div><span>Move clip tool</span><kbd>M</kbd></div>
        <div><span>Gain tool</span><kbd>G</kbd></div>
        <div><span>Extend selection</span><kbd>Shift + click</kbd></div>
        <div><span>Select track audio</span><kbd>Double-click lane</kbd></div>
        <div><span>Quick play</span><kbd>Click timeline ruler</kbd></div>
      </div>
      <button type="button" class="button">Close</button>`
    dialog.querySelector('button')?.addEventListener('click', closeShortcuts)
    document.body.appendChild(dialog)
  }
  ensureBackdrop()
  document.body.classList.remove('audio-lab-modal-is-open')
  document.body.classList.add('audio-lab-shortcuts-open')
  document.querySelector('.audio-lab-audacity-backdrop').style.display = 'block'
  closeMenus()
}

function closeShortcuts() {
  document.body.classList.remove('audio-lab-shortcuts-open')
  const backdrop = document.querySelector('.audio-lab-audacity-backdrop')
  if (backdrop) backdrop.style.removeProperty('display')
}

function selectedTrackButton(label) {
  return exactButton('.audio-lab-multitrack-row.is-selected .audio-lab-track-buttons button', label)
}

function triggerZoom(direction) {
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

function runAction(action) {
  if (!action) return
  if (action.startsWith('command:')) dispatchCommand(action.slice(8))
  else if (action.startsWith('panel:')) openPanel(action.slice(6))
  else if (action === 'new-project') clickIfUsable(exactButton('.audio-lab-sidebar__header button', 'New'))
  else if (action === 'import') page()?.querySelector('.audio-lab-file-input')?.click()
  else if (action === 'save') clickIfUsable(exactButton('.audio-lab-header button', 'Save Project'))
  else if (action === 'export') clickIfUsable(exactButton('.audio-lab-selection-toolbar button', 'Export WAV'))
  else if (action === 'clear-selection') {
    const inputs = page()?.querySelectorAll('.audio-lab-selection-fields input') || []
    setNativeValue(inputs[0], 0); setNativeValue(inputs[1], 0)
  }
  else if (action === 'key:a') synthKey('a', { ctrl: true })
  else if (action === 'key:e') synthKey('e', { ctrl: true })
  else if (action === 'key:f') synthKey('f', { ctrl: true })
  else if (action === 'key:space') synthKey(' ')
  else if (action === 'key:loop') synthKey(' ', { shift: true })
  else if (action === 'transport-stop') clickIfUsable(exactButton('.audio-lab-transport button', 'Stop'))
  else if (action === 'record') clickIfUsable(exactButton('.audio-lab-record-actions button', 'Record')) || clickIfUsable(exactButton('.audio-lab-record-actions button', 'Record Another Take'))
  else if (action === 'add-track') clickIfUsable(exactButton('.audio-lab-timeline-actions button', 'Add Track'))
  else if (action === 'duplicate-track') clickIfUsable(selectedTrackButton('Dup'))
  else if (action === 'delete-track') clickIfUsable(selectedTrackButton('Del'))
  else if (action === 'zoom-in') triggerZoom(1)
  else if (action === 'zoom-out') triggerZoom(-1)
  else if (action === 'toggle-overview') {
    const root = page(); if (root) root.dataset.audiolabOverview = root.dataset.audiolabOverview === 'hidden' ? 'shown' : 'hidden'
  }
  else if (action === 'shortcuts') openShortcuts()
  closeMenus()
}

function menuNode(label, items) {
  const wrap = document.createElement('div')
  wrap.className = 'audio-lab-audacity-menu'
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.textContent = label
  toggle.setAttribute('aria-haspopup', 'menu')
  toggle.setAttribute('aria-expanded', 'false')
  const dropdown = document.createElement('div')
  dropdown.className = 'audio-lab-audacity-dropdown'
  dropdown.setAttribute('role', 'menu')
  items.forEach(([title, action = '', shortcut = '']) => {
    if (title === '---') {
      const rule = document.createElement('div'); rule.className = 'audio-lab-menu-rule'; dropdown.appendChild(rule); return
    }
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'menuitem')
    button.innerHTML = `<span>${title}</span>${shortcut ? `<kbd>${shortcut}</kbd>` : ''}`
    button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); runAction(action) })
    dropdown.appendChild(button)
  })
  toggle.addEventListener('click', (event) => {
    event.preventDefault(); event.stopPropagation()
    const opening = !wrap.classList.contains('is-open')
    closeMenus(wrap)
    wrap.classList.toggle('is-open', opening)
    toggle.setAttribute('aria-expanded', opening ? 'true' : 'false')
  })
  wrap.append(toggle, dropdown)
  return wrap
}

function projectCards() { return Array.from(page()?.querySelectorAll('.audio-lab-project-card') || []) }

function syncProjectSwitcher(select) {
  const cards = projectCards()
  const signature = cards.map((card) => card.querySelector('strong')?.textContent?.trim() || '').join('|')
  if (select.dataset.signature !== signature) {
    select.innerHTML = ''
    cards.forEach((card, index) => {
      const option = document.createElement('option')
      option.value = String(index)
      option.textContent = card.querySelector('strong')?.textContent?.trim() || `Project ${index + 1}`
      select.appendChild(option)
    })
    select.dataset.signature = signature
  }
  const active = Math.max(0, cards.findIndex((card) => card.classList.contains('is-active')))
  if (cards.length) select.value = String(active)
  select.disabled = !cards.length
}

function ensureMenubar() {
  const root = page()
  const header = root?.querySelector(':scope > .audio-lab-header')
  if (!root || !header || root.dataset.audiolabTask) return
  let bar = root.querySelector(':scope > .audio-lab-audacity-menubar')
  if (!bar) {
    bar = document.createElement('nav')
    bar.className = 'audio-lab-audacity-menubar'
    bar.setAttribute('aria-label', 'AudioLab menu bar')
    menuSpec.forEach(([label, items]) => bar.appendChild(menuNode(label, items)))
    const spacer = document.createElement('span'); spacer.className = 'audio-lab-menu-spacer'; bar.appendChild(spacer)
    const project = document.createElement('label')
    project.className = 'audio-lab-project-switcher'
    project.innerHTML = '<span>Project</span><select aria-label="Current AudioLab project"></select>'
    project.querySelector('select').addEventListener('change', (event) => projectCards()[Number(event.target.value)]?.click())
    bar.appendChild(project)
    header.insertAdjacentElement('afterend', bar)
  }
  const select = bar.querySelector('.audio-lab-project-switcher select')
  if (select) syncProjectSwitcher(select)
  const overviewLabel = root.querySelector('.audio-lab-ruler > span:first-child')
  if (overviewLabel) overviewLabel.textContent = 'Overview'
}

function handleDocumentClick(event) {
  if (!event.target?.closest?.('.audio-lab-audacity-menu')) closeMenus()
}

function handleEscape(event) {
  if (event.key !== 'Escape' || !isAudioLabRoute()) return
  closeMenus(); closeShortcuts(); closeModal()
}

let observer = null
function start() {
  if (!isAudioLabRoute()) return
  ensureMenubar()
  observer?.disconnect()
  observer = new MutationObserver(() => window.requestAnimationFrame(ensureMenubar))
  observer.observe(document.getElementById('root') || document.body, { childList: true, subtree: true })
}

document.addEventListener('click', handleDocumentClick, true)
window.addEventListener('keydown', handleEscape, true)
window.addEventListener('load', start)
window.addEventListener('popstate', () => window.setTimeout(start, 80))
window.addEventListener('sabot:audiolab-project-updated', () => window.setTimeout(ensureMenubar, 60))
window.setTimeout(start, 180)
