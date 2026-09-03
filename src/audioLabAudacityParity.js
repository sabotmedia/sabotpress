import { getAudioLabProject, listAudioLabProjects } from './lib/audioLabStore'

function isAudioLabRoute() {
  return typeof window !== 'undefined' && /\/wp-admin\/audiolab(?:\/|$)/.test(window.location.pathname)
}

function page() { return document.querySelector('.audio-lab-page') }

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

async function activeProject() {
  const id = new URLSearchParams(window.location.search || '').get('project') || ''
  if (id) {
    const project = await getAudioLabProject(id)
    if (project) return project
  }
  const projects = await listAudioLabProjects()
  const activeTitle = page()?.querySelector('.audio-lab-project-card.is-active strong')?.textContent?.trim() || ''
  return projects.find((project) => String(project.title || '').trim() === activeTitle) || projects[0] || null
}

function clipEnd(clip = {}) {
  return Math.max(0, Number(clip.timelineStart || 0)) + Math.max(0, Number(clip.sourceEnd || 0) - Number(clip.sourceStart || 0))
}

async function selectClickedTrack(event) {
  if (!isAudioLabRoute()) return
  const lane = event.target?.closest?.('.audio-lab-multitrack-lane')
  if (!lane) return
  const row = lane.closest('.audio-lab-multitrack-row')
  const rows = Array.from(page()?.querySelectorAll('.audio-lab-multitrack-row') || [])
  const trackIndex = rows.indexOf(row)
  if (trackIndex < 0) return

  event.preventDefault()
  event.stopPropagation()
  const project = await activeProject()
  const track = project?.tracks?.[trackIndex]
  if (!track) return
  const clips = track.clips || []
  if (!clips.length) {
    setSelection(0, 0)
    return
  }
  const start = Math.min(...clips.map((clip) => Math.max(0, Number(clip.timelineStart || 0))))
  const end = Math.max(...clips.map(clipEnd))
  setSelection(start, end)
}

function toolHotkeys(event) {
  if (!isAudioLabRoute() || event.ctrlKey || event.metaKey || event.altKey) return
  if (event.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return
  const key = String(event.key || '').toLowerCase()
  const command = key === 'v' ? 'mode-select' : key === 'm' ? 'mode-move' : key === 'g' ? 'mode-gain' : ''
  if (!command) return
  event.preventDefault()
  window.dispatchEvent(new CustomEvent('audiolab:command', { detail: { command } }))
}

window.addEventListener('dblclick', (event) => {
  if (!event.target?.closest?.('.audio-lab-multitrack-lane')) return
  window.setTimeout(() => selectClickedTrack(event), 0)
}, true)
window.addEventListener('keydown', toolHotkeys, true)
