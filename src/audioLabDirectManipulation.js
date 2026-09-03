import {
  getAudioLabProject,
  listAudioLabProjects,
  makeAudioLabId,
  normalizeAudioLabProject,
  saveAudioLabProject,
} from './lib/audioLabStore'

const MIN_REGION_SECONDS = 0.03
const DIRECT_MODES = new Set(['select', 'move', 'gain'])
let pointerState = null

function isAudioLabRoute() {
  return typeof window !== 'undefined' && /\/wp-admin\/audiolab(?:\/|$)/.test(window.location.pathname)
}

function page() { return document.querySelector('.audio-lab-page') }
function audioElement() { return page()?.querySelector('audio') || null }

function parseTime(value = '') {
  const cleaned = String(value || '').replace('/', '').trim()
  const parts = cleaned.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return Number(cleaned) || 0
}

function formatTime(seconds = 0) {
  const safe = Math.max(0, Number(seconds) || 0)
  const mins = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  const hundredths = Math.floor((safe % 1) * 100)
  return `${mins}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`
}

function durationSeconds() {
  const audio = audioElement()
  if (audio && Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration
  const readout = page()?.querySelector('.audio-lab-time-readout span')?.textContent || ''
  return parseTime(readout)
}

function currentTime() {
  const audio = audioElement()
  if (audio && Number.isFinite(audio.currentTime)) return Math.max(0, audio.currentTime)
  return parseTime(page()?.querySelector('.audio-lab-time-readout strong')?.textContent || '')
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
  const a = Math.max(0, Number(start || 0))
  const b = Math.max(0, Number(end || 0))
  setNativeValue(inputs.start, Math.min(a, b).toFixed(2))
  setNativeValue(inputs.end, Math.max(a, b).toFixed(2))
}

function getSelection() {
  const { start, end } = selectionInputs()
  const a = Number(start?.value || 0)
  const b = Number(end?.value || 0)
  return { start: Math.max(0, Math.min(a, b)), end: Math.max(0, Math.max(a, b)) }
}

function hasSelection(selection = getSelection()) {
  return selection.end - selection.start > MIN_REGION_SECONDS
}

function showStatus(message, isError = false) {
  const root = page()
  if (!root) return
  let status = root.querySelector('.audio-lab-studio-status')
  if (!status) {
    status = document.createElement('div')
    status.className = 'audio-lab-studio-status'
    status.setAttribute('role', 'status')
    root.appendChild(status)
  }
  status.textContent = message
  status.classList.toggle('is-error', Boolean(isError))
  status.classList.add('is-visible')
  window.clearTimeout(showStatus.timer)
  showStatus.timer = window.setTimeout(() => status.classList.remove('is-visible'), 1800)
}

function findNativeButton(text) {
  const target = String(text || '').trim().toLowerCase()
  return Array.from(page()?.querySelectorAll('.audio-lab-editor button') || [])
    .find((button) => !button.disabled && String(button.textContent || '').trim().toLowerCase() === target) || null
}

function selectedClipButton() { return page()?.querySelector('.audio-lab-clip.is-selected') || null }

function ensureClipSelected() {
  if (selectedClipButton()) return true
  const first = page()?.querySelector('.audio-lab-clip')
  if (!first) return false
  first.click()
  return true
}

function findLabeledInput(labelText) {
  const needle = String(labelText || '').toLowerCase()
  return Array.from(page()?.querySelectorAll('.audio-lab-project-sidebar label') || [])
    .find((label) => String(label.textContent || '').toLowerCase().includes(needle))
    ?.querySelector('input') || null
}

function timelineStartInput() { ensureClipSelected(); return findLabeledInput('Timeline start') }
function clipGainInput() { ensureClipSelected(); return findLabeledInput('Clip gain') }

function setClipTimelineStart(value) {
  const input = timelineStartInput()
  if (!input) return false
  setNativeValue(input, Math.max(0, Number(value) || 0).toFixed(2))
  return true
}

function bumpClipGain(multiplier) {
  const input = clipGainInput()
  if (!input) return false
  const current = Math.max(0, Number(input.value || 1) || 1)
  const next = Math.max(0, Math.min(6, current * multiplier))
  setNativeValue(input, next.toFixed(2))
  showStatus(`Selected clip gain ${next.toFixed(2)}×`)
  return true
}

function setMode(mode) {
  const root = page()
  const safe = DIRECT_MODES.has(mode) ? mode : 'select'
  if (!root) return
  root.dataset.audiolabDirectMode = safe
  document.querySelectorAll('[data-audiolab-command="mode-select"], [data-audiolab-command="mode-move"], [data-audiolab-command="mode-gain"]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.audiolabCommand === `mode-${safe}`)
  })
  showStatus(safe === 'select' ? 'Selection tool' : safe === 'move' ? 'Move clip tool' : 'Gain drag tool')
}

function getMode() { return page()?.dataset.audiolabDirectMode || 'select' }

function stripProjectHistory(project) {
  return JSON.parse(JSON.stringify({ ...project, history: [], redoStack: [] }))
}

function withHistory(before, next) {
  return normalizeAudioLabProject({
    ...next,
    history: [...(before.history || []), stripProjectHistory(before)].slice(-30),
    redoStack: [],
  })
}

async function saveVisibleProject() {
  const saveButton = Array.from(page()?.querySelectorAll('.audio-lab-header button') || [])
    .find((button) => /save project/i.test(button.textContent || ''))
  if (saveButton && !saveButton.disabled) {
    saveButton.click()
    await new Promise((resolve) => window.setTimeout(resolve, 180))
  }
}

async function activeSavedProject() {
  const id = new URLSearchParams(window.location.search || '').get('project') || ''
  if (id) {
    const project = await getAudioLabProject(id)
    if (project) return project
  }
  const projects = await listAudioLabProjects()
  const activeTitle = page()?.querySelector('.audio-lab-project-card.is-active strong')?.textContent?.trim() || ''
  return projects.find((project) => String(project.title || '').trim() === activeTitle) || projects[0] || null
}

function refreshOpenProject(id) {
  window.dispatchEvent(new CustomEvent('sabot:audiolab-project-updated', { detail: { id } }))
  window.setTimeout(() => {
    const activeCard = page()?.querySelector('.audio-lab-project-card.is-active')
    if (activeCard) activeCard.click()
  }, 30)
}

function clipDuration(clip = {}) {
  return Math.max(0, Number(clip.sourceEnd || 0) - Number(clip.sourceStart || 0))
}

function clipRange(clip = {}) {
  const start = Math.max(0, Number(clip.timelineStart || 0))
  return { start, end: start + clipDuration(clip) }
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart) > MIN_REGION_SECONDS
}

function findTargetClip(project, selection = getSelection(), point = null) {
  const selectedTrackId = project.transport?.selectedTrackId || ''
  const selectedClipId = project.transport?.selectedClipId || ''
  for (const track of project.tracks || []) {
    for (const clip of track.clips || []) {
      const range = clipRange(clip)
      if (track.id === selectedTrackId && clip.id === selectedClipId) return { track, clip, range }
    }
  }
  if (Number.isFinite(point)) {
    for (const track of project.tracks || []) {
      for (const clip of track.clips || []) {
        const range = clipRange(clip)
        if (point > range.start + MIN_REGION_SECONDS && point < range.end - MIN_REGION_SECONDS) return { track, clip, range }
      }
    }
  }
  for (const track of project.tracks || []) {
    for (const clip of track.clips || []) {
      const range = clipRange(clip)
      if (hasSelection(selection) && rangesOverlap(selection.start, selection.end, range.start, range.end)) return { track, clip, range }
    }
  }
  const track = project.tracks?.[0]
  const clip = track?.clips?.[0]
  return clip ? { track, clip, range: clipRange(clip) } : null
}

function makeClipPiece(clip, patch = {}, id = clip.id) {
  return { ...clip, ...patch, id }
}

function splitAtPoint(project, point) {
  const target = findTargetClip(project, getSelection(), point)
  if (!target) throw new Error('No clip under the playhead.')
  const { track: targetTrack, clip: targetClip, range } = target
  if (point <= range.start + MIN_REGION_SECONDS || point >= range.end - MIN_REGION_SECONDS) throw new Error('Move the playhead inside a clip before splitting.')
  const offset = point - range.start
  const sourceStart = Number(targetClip.sourceStart || 0)
  const rightId = makeAudioLabId('clip')
  const left = makeClipPiece(targetClip, { sourceEnd: sourceStart + offset })
  const right = makeClipPiece(targetClip, {
    id: rightId,
    timelineStart: point,
    sourceStart: sourceStart + offset,
    name: `${targetClip.name || 'Clip'} split`,
  }, rightId)
  return {
    ...project,
    tracks: (project.tracks || []).map((track) => track.id !== targetTrack.id ? track : {
      ...track,
      clips: (track.clips || []).flatMap((clip) => clip.id === targetClip.id ? [left, right] : [clip]),
    }),
    transport: { ...(project.transport || {}), selectedTrackId: targetTrack.id, selectedClipId: rightId, playhead: point },
  }
}

function splitSelectionIntoClip(project, selection = getSelection()) {
  if (!hasSelection(selection)) throw new Error('Select a region first.')
  const target = findTargetClip(project, selection)
  if (!target) throw new Error('No clip overlaps the selected region.')
  const { track: targetTrack, clip: targetClip, range } = target
  const relStart = Math.max(0, selection.start - range.start)
  const relEnd = Math.min(clipDuration(targetClip), selection.end - range.start)
  if (relEnd - relStart <= MIN_REGION_SECONDS) throw new Error('Selection is too small to split into a clip.')
  const sourceStart = Number(targetClip.sourceStart || 0)
  const segmentId = makeAudioLabId('clip')
  const pieces = []
  if (relStart > MIN_REGION_SECONDS) pieces.push(makeClipPiece(targetClip, { sourceEnd: sourceStart + relStart, name: `${targetClip.name || 'Clip'} intro` }))
  pieces.push(makeClipPiece(targetClip, {
    id: segmentId,
    timelineStart: range.start + relStart,
    sourceStart: sourceStart + relStart,
    sourceEnd: sourceStart + relEnd,
    name: `${targetClip.name || 'Clip'} selection`,
  }, segmentId))
  if (relEnd < clipDuration(targetClip) - MIN_REGION_SECONDS) pieces.push(makeClipPiece(targetClip, {
    id: makeAudioLabId('clip'),
    timelineStart: range.start + relEnd,
    sourceStart: sourceStart + relEnd,
    name: `${targetClip.name || 'Clip'} tail`,
  }, makeAudioLabId('clip')))
  return {
    ...project,
    tracks: (project.tracks || []).map((track) => track.id !== targetTrack.id ? track : {
      ...track,
      clips: (track.clips || []).flatMap((clip) => clip.id === targetClip.id ? pieces : [clip]),
    }),
    transport: { ...(project.transport || {}), selectedTrackId: targetTrack.id, selectedClipId: segmentId, playhead: selection.start, selectionStart: 0, selectionEnd: 0 },
  }
}

function cutSelectionFromClip(project, selection = getSelection()) {
  if (!hasSelection(selection)) throw new Error('Select a region first.')
  const target = findTargetClip(project, selection)
  if (!target) throw new Error('No clip overlaps the selected region.')
  const { track: targetTrack, clip: targetClip, range } = target
  const relStart = Math.max(0, selection.start - range.start)
  const relEnd = Math.min(clipDuration(targetClip), selection.end - range.start)
  const removed = relEnd - relStart
  if (removed <= MIN_REGION_SECONDS) throw new Error('Selection is too small to cut.')
  const sourceStart = Number(targetClip.sourceStart || 0)
  const pieces = []
  if (relStart > MIN_REGION_SECONDS) pieces.push(makeClipPiece(targetClip, { sourceEnd: sourceStart + relStart }))
  if (relEnd < clipDuration(targetClip) - MIN_REGION_SECONDS) pieces.push(makeClipPiece(targetClip, {
    id: relStart > MIN_REGION_SECONDS ? makeAudioLabId('clip') : targetClip.id,
    timelineStart: range.start + relStart,
    sourceStart: sourceStart + relEnd,
    name: relStart > MIN_REGION_SECONDS ? `${targetClip.name || 'Clip'} tail` : targetClip.name,
  }, relStart > MIN_REGION_SECONDS ? makeAudioLabId('clip') : targetClip.id))
  return {
    ...project,
    tracks: (project.tracks || []).map((track) => {
      if (track.id !== targetTrack.id) return track
      return {
        ...track,
        clips: (track.clips || []).flatMap((clip) => {
          if (clip.id === targetClip.id) return pieces
          if (Number(clip.timelineStart || 0) >= selection.end) return [{ ...clip, timelineStart: Math.max(0, Number(clip.timelineStart || 0) - removed) }]
          return [clip]
        }),
      }
    }),
    transport: { ...(project.transport || {}), selectedClipId: pieces[0]?.id || '', playhead: selection.start, selectionStart: 0, selectionEnd: 0 },
  }
}

async function saveProjectTransform(transform, successMessage) {
  await saveVisibleProject()
  const before = await activeSavedProject()
  if (!before) throw new Error('No AudioLab project is open.')
  const result = transform(before)
  const nextProject = withHistory(before, result)
  const saved = await saveAudioLabProject(nextProject)
  showStatus(successMessage || 'Edit saved.')
  refreshOpenProject(saved.id)
  return saved
}

async function cutSelection() {
  const selection = getSelection()
  return saveProjectTransform((project) => cutSelectionFromClip(project, selection), `Deleted ${formatTime(selection.start)}–${formatTime(selection.end)} and closed the gap.`)
}

async function cutStartToPlayhead() {
  const end = Math.max(currentTime(), getSelection().end)
  if (end <= MIN_REGION_SECONDS) throw new Error('Move the playhead to the end of the material you want removed.')
  setSelection(0, end)
  return saveProjectTransform((project) => cutSelectionFromClip(project, { start: 0, end }), `Removed start through ${formatTime(end)}.`)
}

async function splitAtPlayhead() {
  const point = currentTime()
  return saveProjectTransform((project) => splitAtPoint(project, point), `Split clip at ${formatTime(point)}.`)
}

async function makeSelectionClip() {
  const selection = getSelection()
  return saveProjectTransform((project) => splitSelectionIntoClip(project, selection), 'Selection is now a movable clip.')
}

async function addSelectionGain(gainDb) {
  const selection = getSelection()
  if (!hasSelection(selection)) {
    if (bumpClipGain(gainDb > 0 ? 1.18 : 0.85)) return null
    throw new Error('Select a region or clip first.')
  }
  return saveProjectTransform((project) => ({
    ...project,
    effects: [...(project.effects || []), {
      id: makeAudioLabId('effect'), type: 'amplify', scope: 'selection', start: selection.start, end: selection.end,
      params: { gainDb }, enabled: true, createdAt: new Date().toISOString(),
    }],
  }), `${gainDb > 0 ? 'Boosted' : 'Lowered'} selected region.`)
}

function invokeNative(label) {
  const button = findNativeButton(label)
  if (!button) throw new Error(`${label} is unavailable for the current selection.`)
  button.click()
  showStatus(label)
}

function executeCommand(command) {
  if (!isAudioLabRoute()) return Promise.resolve(false)
  if (command === 'mode-select') { setMode('select'); return Promise.resolve(true) }
  if (command === 'mode-move') { setMode('move'); return Promise.resolve(true) }
  if (command === 'mode-gain') { setMode('gain'); return Promise.resolve(true) }
  if (command === 'select-all') { setSelection(0, durationSeconds()); showStatus('Selected all audio.'); return Promise.resolve(true) }
  if (command === 'split') return splitAtPlayhead().then(() => true)
  if (command === 'delete-close-gap' || command === 'cut-selection') return cutSelection().then(() => true)
  if (command === 'cut-start') return cutStartToPlayhead().then(() => true)
  if (command === 'make-clip') return makeSelectionClip().then(() => true)
  if (command === 'quieter') return addSelectionGain(-3).then(() => true)
  if (command === 'louder') return addSelectionGain(3).then(() => true)
  if (command === 'silence') { invokeNative('Silence'); return Promise.resolve(true) }
  if (command === 'trim') { invokeNative('Trim'); return Promise.resolve(true) }
  if (command === 'undo') { invokeNative('Undo'); return Promise.resolve(true) }
  if (command === 'redo') { invokeNative('Redo'); return Promise.resolve(true) }
  if (command === 'delete') { invokeNative('Delete'); return Promise.resolve(true) }
  return Promise.resolve(false)
}

function handleCommandEvent(event) {
  const command = event?.detail?.command || ''
  executeCommand(command).catch((error) => showStatus(error.message || 'Edit failed.', true))
}

function timelineTimeFromPointer(event, lane) {
  const scroll = lane?.closest('.audio-lab-multitrack-scroll')
  const inner = scroll?.querySelector('.audio-lab-multitrack-inner')
  const duration = durationSeconds()
  if (!scroll || !inner || !duration) return 0
  const rect = inner.getBoundingClientRect()
  const controlsWidth = 150
  const x = Math.max(0, Math.min(rect.width - controlsWidth, event.clientX - rect.left - controlsWidth))
  return (x / Math.max(1, rect.width - controlsWidth)) * duration
}

function handleWaveformPointerDown(event) {
  if (!isAudioLabRoute() || event.button !== 0) return
  const root = page()
  const waveform = event.target?.closest?.('.audio-lab-waveform')
  const lane = event.target?.closest?.('.audio-lab-multitrack-lane')
  const mode = event.altKey ? 'move' : getMode()

  if (lane && mode === 'select' && !event.target?.closest?.('.audio-lab-clip, button, input')) {
    const start = timelineTimeFromPointer(event, lane)
    pointerState = { mode: 'lane-select', lane, start }
    setSelection(start, start)
    event.preventDefault()
    return
  }

  if (!waveform || (mode !== 'move' && mode !== 'gain')) return
  if (mode === 'move' && !ensureClipSelected()) { showStatus('Select a clip first.', true); return }
  if (mode === 'gain' && !hasSelection() && !ensureClipSelected()) { showStatus('Select a region or clip first.', true); return }
  const rect = waveform.getBoundingClientRect()
  pointerState = {
    mode, rect, startX: event.clientX, startY: event.clientY,
    startTime: Number(timelineStartInput()?.value || 0),
    startGain: Number(clipGainInput()?.value || 1), duration: durationSeconds(),
  }
  event.preventDefault()
  waveform.setPointerCapture?.(event.pointerId)
}

function handleWaveformPointerMove(event) {
  if (!pointerState || !isAudioLabRoute()) return
  const state = pointerState
  if (state.mode === 'lane-select') {
    setSelection(state.start, timelineTimeFromPointer(event, state.lane))
    return
  }
  if (state.mode === 'move') {
    const deltaSeconds = ((event.clientX - state.startX) / Math.max(1, state.rect.width)) * Math.max(1, state.duration)
    setClipTimelineStart(Math.max(0, state.startTime + deltaSeconds))
  } else if (state.mode === 'gain') {
    const dy = state.startY - event.clientY
    const db = Math.max(-12, Math.min(12, dy / 12))
    if (!hasSelection()) {
      const nextGain = Math.max(0, Math.min(6, state.startGain * Math.pow(2, db / 6)))
      const input = clipGainInput()
      if (input) setNativeValue(input, nextGain.toFixed(2))
    }
  }
}

function handleWaveformPointerUp(event) {
  if (!pointerState || !isAudioLabRoute()) return
  const state = pointerState
  pointerState = null
  if (state.mode === 'lane-select') { showStatus('Selection set.'); return }
  if (state.mode === 'move') { showStatus('Clip moved.'); return }
  if (state.mode === 'gain' && hasSelection()) {
    const dy = state.startY - event.clientY
    const db = Math.max(-12, Math.min(12, dy / 12))
    if (Math.abs(db) > 0.4) addSelectionGain(Number(db.toFixed(1))).catch((error) => showStatus(error.message || 'Gain edit failed.', true))
  } else showStatus('Clip gain changed.')
}

function handleDoubleClick(event) {
  if (!isAudioLabRoute()) return
  if (!event.target?.closest?.('.audio-lab-waveform, .audio-lab-multitrack-lane')) return
  event.preventDefault()
  event.stopPropagation()
  setSelection(0, durationSeconds())
  showStatus('Selected entire track/project range.')
}

function handleShiftMouseDown(event) {
  if (!isAudioLabRoute() || !event.shiftKey || event.button !== 0) return
  const waveform = event.target?.closest?.('.audio-lab-waveform')
  const lane = event.target?.closest?.('.audio-lab-multitrack-lane')
  if (!waveform && !lane) return
  let point = 0
  if (lane) point = timelineTimeFromPointer(event, lane)
  else {
    const rect = waveform.getBoundingClientRect()
    point = ((event.clientX - rect.left) / Math.max(1, rect.width)) * durationSeconds()
  }
  const selection = getSelection()
  const anchor = hasSelection(selection) ? selection.start : currentTime()
  setSelection(anchor, point)
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()
  showStatus('Selection extended.')
}

function boot() {
  if (!isAudioLabRoute()) return
  const root = page()
  if (root && !root.dataset.audiolabDirectMode) root.dataset.audiolabDirectMode = 'select'
}

window.addEventListener('audiolab:command', handleCommandEvent)
window.addEventListener('pointerdown', handleWaveformPointerDown, true)
window.addEventListener('pointermove', handleWaveformPointerMove, true)
window.addEventListener('pointerup', handleWaveformPointerUp, true)
window.addEventListener('pointercancel', handleWaveformPointerUp, true)
window.addEventListener('dblclick', handleDoubleClick, true)
window.addEventListener('mousedown', handleShiftMouseDown, true)
window.addEventListener('load', boot)
window.addEventListener('popstate', () => window.setTimeout(boot, 80))
window.setInterval(boot, 1200)
window.setTimeout(boot, 200)
