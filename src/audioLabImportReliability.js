import {
  createEmptyAudioLabProject,
  listAudioLabProjects,
  makeAudioLabClip,
  makeAudioLabTrack,
  normalizeAudioLabProject,
  putAudioLabAssetFromFile,
  saveAudioLabProject,
  slugifyAudioLab,
} from './lib/audioLabStore.js'
import { computeProjectDuration } from './lib/audioLabRender.js'

const AUDIO_EXTENSIONS = new Map([
  ['mp3', 'audio/mpeg'],
  ['wav', 'audio/wav'],
  ['wave', 'audio/wav'],
  ['ogg', 'audio/ogg'],
  ['oga', 'audio/ogg'],
  ['opus', 'audio/ogg;codecs=opus'],
  ['m4a', 'audio/mp4'],
  ['mp4', 'audio/mp4'],
  ['aac', 'audio/aac'],
  ['webm', 'audio/webm'],
  ['flac', 'audio/flac'],
])

const SESSION_STATUS_KEY = 'sabot:audiolab:last-import-status'
let busy = false

function isAudioLabRoute() {
  return typeof window !== 'undefined' && /\/wp-admin\/audiolab(?:\/|$)/.test(window.location.pathname)
}

function filenameExtension(name = '') {
  return String(name || '').toLowerCase().split('.').pop() || ''
}

function normalizedAudioFile(file) {
  const extension = filenameExtension(file?.name)
  const inferred = AUDIO_EXTENSIONS.get(extension) || ''
  const declared = String(file?.type || '').trim().toLowerCase()
  const mimeType = declared.startsWith('audio/') ? declared : inferred
  if (!mimeType) throw new Error('That file does not look like a supported audio file. Try WAV, MP3, M4A, OGG, Opus, WebM, AAC, or FLAC.')
  if (declared === mimeType) return file
  return new File([file], file.name || `audio.${extension || 'bin'}`, {
    type: mimeType,
    lastModified: Number(file.lastModified || Date.now()),
  })
}

function ensureImportStatus() {
  let node = document.querySelector('[data-audiolab-import-status]')
  if (node) return node
  node = document.createElement('div')
  node.dataset.audiolabImportStatus = '1'
  node.className = 'audio-lab-import-status'
  node.setAttribute('role', 'status')
  node.setAttribute('aria-live', 'polite')
  document.body.appendChild(node)
  return node
}

function setImportStatus(message, state = 'working') {
  const node = ensureImportStatus()
  node.textContent = String(message || '')
  node.dataset.state = state
  node.hidden = !message
  if (state === 'success') {
    window.setTimeout(() => {
      if (node.dataset.state === 'success') node.hidden = true
    }, 7000)
  }
}

function rememberStatus(message) {
  try { window.sessionStorage.setItem(SESSION_STATUS_KEY, String(message || '')) } catch { /* status is optional */ }
}

function restoreStatus() {
  if (!isAudioLabRoute()) return
  let message = ''
  try {
    message = window.sessionStorage.getItem(SESSION_STATUS_KEY) || ''
    if (message) window.sessionStorage.removeItem(SESSION_STATUS_KEY)
  } catch { /* ignore */ }
  if (message) setImportStatus(message, 'success')
}

function audioElementDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const audio = document.createElement('audio')
    let finished = false
    const finish = (callback, value) => {
      if (finished) return
      finished = true
      window.clearTimeout(timer)
      audio.removeAttribute('src')
      try { audio.load() } catch { /* ignore */ }
      URL.revokeObjectURL(url)
      callback(value)
    }
    const timer = window.setTimeout(() => finish(reject, new Error('Timed out reading audio metadata.')), 12000)
    audio.preload = 'metadata'
    audio.addEventListener('loadedmetadata', () => {
      const duration = Number(audio.duration || 0)
      if (Number.isFinite(duration) && duration > 0) finish(resolve, duration)
      else finish(reject, new Error('The browser could not determine this file’s duration.'))
    }, { once: true })
    audio.addEventListener('error', () => finish(reject, new Error('The browser could not read this audio format.')), { once: true })
    audio.src = url
  })
}

async function decodeDurationFallback(file) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextCtor) return 0
  const context = new AudioContextCtor()
  try {
    const data = await file.arrayBuffer()
    const decoded = await context.decodeAudioData(data.slice(0))
    return Number(decoded?.duration || 0)
  } catch {
    return 0
  } finally {
    try { await context.close() } catch { /* ignore */ }
  }
}

async function readDuration(file) {
  try {
    return await audioElementDuration(file)
  } catch {
    const fallback = await decodeDurationFallback(file)
    if (Number.isFinite(fallback) && fallback > 0) return fallback
    throw new Error('AudioLab could not decode that file in this browser. Convert it to WAV, MP3, M4A, OGG, or WebM and try again.')
  }
}

function currentProjectTitle() {
  return String(document.querySelector('.audio-lab-project-strip input')?.value || '').trim()
}

async function resolveCurrentProject() {
  const title = currentProjectTitle()
  const projects = await listAudioLabProjects()
  if (title) {
    const exact = projects.find((project) => String(project.title || '').trim() === title)
    if (exact) return exact
  }
  if (!title && projects[0]) return projects[0]
  return createEmptyAudioLabProject({ title: title || 'Untitled AudioLab Project' })
}

async function importAudioFile(rawFile) {
  if (busy) return
  busy = true
  document.body?.classList.remove('audio-lab-drag-active')
  try {
    const file = normalizedAudioFile(rawFile)
    setImportStatus(`Reading ${file.name}…`)
    const duration = await readDuration(file)

    setImportStatus(`Preserving ${file.name} locally…`)
    const asset = await putAudioLabAssetFromFile(file, {
      duration,
      mimeType: file.type,
      source: 'audiolab-import',
    })

    const baseProject = await resolveCurrentProject()
    const title = currentProjectTitle() || (baseProject.title === 'Untitled AudioLab Project' ? asset.title : baseProject.title) || asset.title
    let tracks = Array.isArray(baseProject.tracks) && baseProject.tracks.length
      ? baseProject.tracks
      : [makeAudioLabTrack({ name: 'Main Track' })]
    let selectedTrackId = String(baseProject.transport?.selectedTrackId || '')
    if (!tracks.some((track) => track.id === selectedTrackId)) selectedTrackId = tracks[0].id

    const timelineStart = computeProjectDuration(baseProject) || 0
    const clip = makeAudioLabClip(asset, {
      timelineStart,
      sourceStart: 0,
      sourceEnd: duration,
    })
    tracks = tracks.map((track) => track.id === selectedTrackId
      ? { ...track, clips: [...(track.clips || []), clip] }
      : track)

    const nextProject = normalizeAudioLabProject({
      ...baseProject,
      title,
      sourceAssets: [asset, ...(baseProject.sourceAssets || []).filter((item) => item.id !== asset.id)],
      tracks,
      episode: {
        ...(baseProject.episode || {}),
        title,
        slug: baseProject.episode?.slug || slugifyAudioLab(title),
        audioAssetId: asset.id,
      },
      transport: {
        ...(baseProject.transport || {}),
        selectedTrackId,
        selectedClipId: clip.id,
        playhead: timelineStart,
      },
    })

    await saveAudioLabProject(nextProject)
    const success = `Imported ${file.name} • ${duration.toFixed(1)}s • added to Main Track.`
    rememberStatus(success)
    setImportStatus(`${success} Reloading timeline…`, 'success')
    window.setTimeout(() => window.location.reload(), 220)
  } catch (error) {
    setImportStatus(error instanceof Error ? error.message : 'Unable to import audio.', 'error')
  } finally {
    busy = false
  }
}

function interceptAudioImport(event) {
  if (!isAudioLabRoute()) return
  const input = event.target
  if (!(input instanceof HTMLInputElement) || !input.classList.contains('audio-lab-file-input')) return
  const file = input.files?.[0]
  if (!file) return

  // Own this event before React's older importer performs a full decode before
  // preservation. This prevents duplicate clips and makes import deterministic.
  event.stopImmediatePropagation()
  event.stopPropagation()
  const selected = file
  input.value = ''
  void importAudioFile(selected)
}

function isTrackDropTarget(event) {
  if (!isAudioLabRoute()) return false
  const target = event.target instanceof Element ? event.target : null
  return Boolean(target?.closest('.audio-lab-multitrack'))
}

function handleDragOver(event) {
  if (!isTrackDropTarget(event)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  document.body?.classList.add('audio-lab-drag-active')
}

function handleDragLeave(event) {
  if (!isAudioLabRoute()) return
  if (event.relatedTarget instanceof Element && event.relatedTarget.closest('.audio-lab-multitrack')) return
  document.body?.classList.remove('audio-lab-drag-active')
}

function handleDrop(event) {
  if (!isTrackDropTarget(event)) return
  event.preventDefault()
  event.stopPropagation()
  document.body?.classList.remove('audio-lab-drag-active')
  const file = Array.from(event.dataTransfer?.files || []).find((item) => {
    const extension = filenameExtension(item.name)
    return String(item.type || '').startsWith('audio/') || AUDIO_EXTENSIONS.has(extension)
  })
  if (!file) {
    setImportStatus('Drop an audio file here. WAV, MP3, M4A, OGG, Opus, WebM, AAC, and FLAC are supported when your browser can decode them.', 'error')
    return
  }
  void importAudioFile(file)
}

document.addEventListener('change', interceptAudioImport, true)
document.addEventListener('dragover', handleDragOver, true)
document.addEventListener('dragleave', handleDragLeave, true)
document.addEventListener('drop', handleDrop, true)
window.addEventListener('pageshow', () => window.setTimeout(restoreStatus, 0))
window.addEventListener('popstate', () => window.setTimeout(restoreStatus, 0))
window.setTimeout(restoreStatus, 0)
