const ACTIVE_TAB_KEY = 'sabot:audiolab:inspector-tab:v4'
let observer = null
let refreshQueued = false

const TOOL_LABELS = new Set(['Robot Voice', 'Clip', 'Effects', 'Transcript', 'Markers', 'Assets'])
const EPISODE_LABELS = new Set(['Episode', 'Publish', 'Project'])

function isAudioLabRoute() {
  return typeof window !== 'undefined' && /\/wp-admin\/audiolab(?:\/|$)/.test(window.location.pathname)
}
function rootPage() { return document.querySelector('.audio-lab-page') }
function sidebar() { return rootPage()?.querySelector('.audio-lab-project-sidebar') || null }

function labelForPanel(panel, index) {
  const explicit = panel.dataset.audiolabInspectorLabel
  if (explicit) return explicit
  const text = `${panel.querySelector('.audio-lab-eyebrow')?.textContent || ''} ${panel.querySelector('h2')?.textContent || ''}`.trim()
  if (/robot voice|speech generator/i.test(text)) return 'Robot Voice'
  if (/project json|preserved source model/i.test(text)) return 'Project'
  if (/render|delivery|feed readiness/i.test(text)) return 'Publish'
  if (/project assets|source bin/i.test(text)) return 'Assets'
  if (/clip/i.test(text)) return 'Clip'
  if (/effect/i.test(text)) return 'Effects'
  if (/transcript/i.test(text)) return 'Transcript'
  if (/marker/i.test(text)) return 'Markers'
  if (/episode|metadata/i.test(text)) return 'Episode'
  if (/source/i.test(text)) return 'Assets'
  return panel.querySelector('h2')?.textContent?.trim() || `Panel ${index + 1}`
}

function slug(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'panel' }
function getStoredTab() { try { return window.localStorage.getItem(ACTIVE_TAB_KEY) || '' } catch { return '' } }
function storeTab(value) { try { window.localStorage.setItem(ACTIVE_TAB_KEY, value) } catch { /* local preference */ } }
function panels() { return Array.from(sidebar()?.querySelectorAll(':scope > .audio-lab-panel') || []) }

function activate(id) {
  const dock = sidebar()
  if (!dock) return
  let matched = false
  panels().forEach((panel) => {
    const active = panel.dataset.audiolabInspectorId === id
    panel.hidden = !active
    panel.classList.toggle('is-inspector-active', active)
    if (active) matched = true
  })
  if (!matched) {
    const first = dock.querySelector('.audio-lab-inspector-tabs button:not([hidden])')
    if (first) return activate(first.dataset.inspectorTarget)
  }
  dock.querySelectorAll('.audio-lab-inspector-tabs button').forEach((button) => {
    const active = button.dataset.inspectorTarget === id
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-selected', active ? 'true' : 'false')
  })
  if (id) storeTab(id)
}

function ensureTabs() {
  const dock = sidebar()
  const items = panels()
  if (!dock || !items.length) return
  const signature = items.map((panel, index) => labelForPanel(panel, index)).join('|')
  let nav = dock.querySelector(':scope > .audio-lab-inspector-tabs')
  if (nav?.dataset.signature === signature && nav.children.length === items.length) return
  if (!nav) {
    nav = document.createElement('div')
    nav.className = 'audio-lab-inspector-tabs'
    nav.setAttribute('role', 'tablist')
    const heading = dock.querySelector(':scope > .audio-lab-modal-heading')
    if (heading) heading.insertAdjacentElement('afterend', nav)
    else dock.insertBefore(nav, dock.firstChild)
  }
  nav.replaceChildren()
  const used = new Map()
  items.forEach((panel, index) => {
    let label = labelForPanel(panel, index)
    const count = (used.get(label) || 0) + 1
    used.set(label, count)
    if (count > 1) label = `${label} ${count}`
    const baseLabel = label.replace(/\s+\d+$/, '')
    const id = `${slug(label)}-${index}`
    panel.dataset.audiolabInspectorId = id
    panel.dataset.audiolabInspectorLabel = baseLabel
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.inspectorTarget = id
    button.dataset.inspectorLabel = baseLabel
    button.textContent = label
    button.addEventListener('click', () => activate(id))
    nav.appendChild(button)
  })
  nav.dataset.signature = signature
}

function ensureModalFrame() {
  const dock = sidebar()
  if (!dock) return
  if (!dock.querySelector(':scope > .audio-lab-modal-heading')) {
    const heading = document.createElement('div')
    heading.className = 'audio-lab-modal-heading'
    heading.innerHTML = '<strong data-audiolab-modal-title>Tools</strong><button type="button" class="audio-lab-modal-close" aria-label="Close">×</button>'
    dock.insertBefore(heading, dock.firstChild)
    heading.querySelector('.audio-lab-modal-close')?.addEventListener('click', closeModal)
  }
  if (!document.querySelector('.audio-lab-modal-backdrop')) {
    const backdrop = document.createElement('button')
    backdrop.type = 'button'
    backdrop.className = 'audio-lab-modal-backdrop'
    backdrop.setAttribute('aria-label', 'Close AudioLab panel')
    backdrop.addEventListener('click', closeModal)
    document.body.appendChild(backdrop)
  }
}

function openModal(group, preferred = '') {
  const root = rootPage()
  const dock = sidebar()
  if (!root || !dock) return
  ensureModalFrame()
  ensureTabs()
  const allowed = group === 'episode' ? EPISODE_LABELS : TOOL_LABELS
  dock.querySelectorAll('.audio-lab-inspector-tabs button').forEach((button) => {
    button.hidden = !allowed.has(String(button.dataset.inspectorLabel || '').replace(/\s+\d+$/, ''))
  })
  const title = dock.querySelector('[data-audiolab-modal-title]')
  if (title) title.textContent = group === 'episode' ? 'Episode' : 'Tools'
  root.dataset.audiolabModalOpen = group
  document.body.classList.add('audio-lab-modal-is-open')
  dock.setAttribute('role', 'dialog')
  dock.setAttribute('aria-modal', 'true')
  const visible = Array.from(dock.querySelectorAll('.audio-lab-inspector-tabs button:not([hidden])'))
  const preferredButton = visible.find((button) => String(button.dataset.inspectorLabel || '').toLowerCase() === String(preferred || '').toLowerCase())
  const stored = getStoredTab()
  const storedButton = visible.find((button) => button.dataset.inspectorTarget === stored)
  activate((preferredButton || storedButton || visible[0])?.dataset.inspectorTarget || '')
  window.setTimeout(() => dock.querySelector('.audio-lab-modal-close')?.focus({ preventScroll: true }), 0)
}

function closeModal() {
  const root = rootPage()
  if (root) delete root.dataset.audiolabModalOpen
  document.body.classList.remove('audio-lab-modal-is-open')
  sidebar()?.removeAttribute('aria-modal')
}

function closeMenus(except = null) {
  rootPage()?.querySelectorAll('.audio-lab-popover.is-open').forEach((menu) => { if (menu !== except) menu.classList.remove('is-open') })
  rootPage()?.querySelectorAll('[data-audiolab-menu-toggle]').forEach((button) => {
    button.setAttribute('aria-expanded', button.nextElementSibling?.classList.contains('is-open') ? 'true' : 'false')
  })
}

function makeMenuButton(label, menuHtml, className = '') {
  const wrap = document.createElement('div')
  wrap.className = `audio-lab-menu-wrap ${className}`.trim()
  wrap.innerHTML = `<button type="button" class="button audio-lab-menu-toggle" data-audiolab-menu-toggle aria-expanded="false">${label}</button><div class="audio-lab-popover" role="menu">${menuHtml}</div>`
  const button = wrap.querySelector('[data-audiolab-menu-toggle]')
  const menu = wrap.querySelector('.audio-lab-popover')
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    const open = !menu.classList.contains('is-open')
    closeMenus(open ? menu : null)
    menu.classList.toggle('is-open', open)
    button.setAttribute('aria-expanded', open ? 'true' : 'false')
  })
  return wrap
}

function commandItem(label, command, shortcut = '') {
  return `<button type="button" role="menuitem" data-audiolab-command="${command}"><span>${label}</span>${shortcut ? `<kbd>${shortcut}</kbd>` : ''}</button>`
}

function projectCards() { return Array.from(rootPage()?.querySelectorAll('.audio-lab-sidebar .audio-lab-project-card') || []) }
function syncProjectSelector(select) {
  const cards = projectCards()
  const activeIndex = Math.max(0, cards.findIndex((card) => card.classList.contains('is-active')))
  const signature = cards.map((card) => card.querySelector('strong')?.textContent?.trim() || 'Untitled').join('|')
  if (select.dataset.signature !== signature) {
    select.replaceChildren()
    cards.forEach((card, index) => {
      const option = document.createElement('option')
      option.value = String(index)
      option.textContent = card.querySelector('strong')?.textContent?.trim() || `Project ${index + 1}`
      select.appendChild(option)
    })
    if (!cards.length) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'No projects yet'
      select.appendChild(option)
    }
    select.dataset.signature = signature
  }
  select.value = cards.length ? String(activeIndex) : ''
  select.disabled = !cards.length
}

function ensureChrome() {
  const root = rootPage()
  const header = root?.querySelector(':scope > .audio-lab-header, :scope > .wp-screen-header.audio-lab-header')
  if (!root || !header) return
  let chrome = header.querySelector(':scope > .audio-lab-compact-chrome')
  if (!chrome) {
    chrome = document.createElement('div')
    chrome.className = 'audio-lab-compact-chrome'
    chrome.innerHTML = '<label class="audio-lab-compact-project"><span class="sr-only">Project</span><select data-audiolab-project-select aria-label="Current AudioLab project"></select></label><button type="button" class="button" data-audiolab-new-project title="New project">＋</button><span class="audio-lab-compact-separator" aria-hidden="true"></span>'

    chrome.append(
      makeMenuButton('Edit ▾', `<div class="audio-lab-menu-section"><small>Mouse tool</small>${commandItem('Selection tool', 'mode-select', 'V')}${commandItem('Move clip', 'mode-move', 'M')}${commandItem('Gain drag', 'mode-gain', 'G')}</div><div class="audio-lab-menu-section"><small>Edit</small>${commandItem('Split at playhead', 'split', 'Ctrl/Cmd I')}${commandItem('Delete & close gap', 'delete-close-gap', 'Ctrl/Cmd K')}${commandItem('Silence selection', 'silence', 'Ctrl/Cmd L')}${commandItem('Trim to selection', 'trim', 'Ctrl/Cmd T')}${commandItem('Make movable clip', 'make-clip')}${commandItem('Cut start → playhead', 'cut-start')}</div><div class="audio-lab-menu-section"><small>Level & history</small>${commandItem('Quieter', 'quieter')}${commandItem('Louder', 'louder')}${commandItem('Undo', 'undo', 'Ctrl/Cmd Z')}${commandItem('Redo', 'redo', 'Ctrl Y / Cmd ⇧Z')}</div>`),
      makeMenuButton('Tools ▾', '<button type="button" role="menuitem" data-open-panel="Robot Voice"><span>Robot Voice</span></button><button type="button" role="menuitem" data-open-panel="Clip"><span>Clip</span></button><button type="button" role="menuitem" data-open-panel="Effects"><span>Effects</span></button><button type="button" role="menuitem" data-open-panel="Transcript"><span>Transcript</span></button><button type="button" role="menuitem" data-open-panel="Markers"><span>Markers</span></button><button type="button" role="menuitem" data-open-panel="Assets"><span>Sources / Assets</span></button>'),
      makeMenuButton('Episode ▾', '<button type="button" role="menuitem" data-open-episode="Episode"><span>Metadata</span></button><button type="button" role="menuitem" data-open-episode="Publish"><span>Publish / Render / RSS</span></button><button type="button" role="menuitem" data-open-episode="Project"><span>Project data</span></button>'),
      makeMenuButton('⌨', '<div class="audio-lab-shortcut-sheet"><strong>Fast controls</strong><span><kbd>Space</kbd> Play / stop</span><span><kbd>Shift Space</kbd> Loop selection</span><span><kbd>Ctrl/Cmd + wheel</kbd> Zoom at pointer</span><span><kbd>Wheel</kbd> Horizontal scroll</span><span><kbd>Ctrl/Cmd E</kbd> Zoom selection</span><span><kbd>Ctrl/Cmd F</kbd> Fit project</span><span><kbd>Ctrl/Cmd A</kbd> Select all</span><span><kbd>Ctrl/Cmd I</kbd> Split</span><span><kbd>Ctrl/Cmd K</kbd> Delete + close gap</span><span><kbd>Ctrl/Cmd L</kbd> Silence</span><span><kbd>Ctrl/Cmd Z</kbd> Undo</span><span><kbd>Ctrl Y / Cmd ⇧Z</kbd> Redo</span></div>', 'audio-lab-shortcuts-menu')
    )

    const actions = header.querySelector(':scope > .review-card__actions')
    if (actions) header.insertBefore(chrome, actions)
    else header.appendChild(chrome)

    chrome.querySelector('[data-audiolab-project-select]')?.addEventListener('change', (event) => projectCards()[Number(event.target.value)]?.click())
    chrome.querySelector('[data-audiolab-new-project]')?.addEventListener('click', () => root.querySelector('.audio-lab-sidebar__header .button')?.click())
    chrome.addEventListener('click', (event) => {
      const command = event.target?.closest?.('[data-audiolab-command]')?.dataset.audiolabCommand
      if (command) { window.dispatchEvent(new CustomEvent('audiolab:command', { detail: { command } })); closeMenus(); return }
      const tool = event.target?.closest?.('[data-open-panel]')?.dataset.openPanel
      if (tool) { closeMenus(); openModal('tools', tool); return }
      const episodePanel = event.target?.closest?.('[data-open-episode]')?.dataset.openEpisode
      if (episodePanel) { closeMenus(); openModal('episode', episodePanel) }
    })
  }
  const select = chrome.querySelector('[data-audiolab-project-select]')
  if (select) syncProjectSelector(select)
}

function normalizeWorkflowNav() {
  const root = rootPage()
  const nav = root?.querySelector(':scope > .audio-lab-workflow-nav')
  const header = root?.querySelector(':scope > .audio-lab-header, :scope > .wp-screen-header.audio-lab-header')
  if (!root || !nav || !header || !root.dataset.audiolabTask) return
  if (header.nextElementSibling !== nav) header.insertAdjacentElement('afterend', nav)
  nav.removeAttribute('style')
}

function refresh() {
  refreshQueued = false
  if (!isAudioLabRoute()) return
  ensureChrome()
  ensureModalFrame()
  ensureTabs()
  normalizeWorkflowNav()
}
function queueRefresh() {
  if (refreshQueued) return
  refreshQueued = true
  window.requestAnimationFrame(refresh)
}
function start() {
  if (!isAudioLabRoute()) return
  const root = rootPage()
  if (root) { delete root.dataset.audiolabInspectorOpen; delete root.dataset.audiolabModalOpen }
  closeModal()
  refresh()
  observer?.disconnect()
  observer = new MutationObserver(queueRefresh)
  observer.observe(document.getElementById('root') || document.body, { childList: true, subtree: true })
}

window.addEventListener('click', (event) => { if (!event.target?.closest?.('.audio-lab-menu-wrap')) closeMenus() }, true)
window.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeMenus(); closeModal() } })
window.addEventListener('sabot:audiolab-inspector-changed', queueRefresh)
window.addEventListener('sabot:audiolab-project-updated', queueRefresh)
window.addEventListener('load', start)
window.addEventListener('popstate', () => window.setTimeout(start, 80))
window.setTimeout(start, 220)
