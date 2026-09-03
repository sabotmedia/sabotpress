import { renderRobotSpeech } from './accessibility/robotSpeechEngine.js'
import {
  ROBOT_VOICE_PRESETS,
  normalizeRobotVoiceOptions,
} from './accessibility/robotVoicePresets.js'
import {
  listAudioLabProjects,
  makeAudioLabClip,
  makeAudioLabTrack,
  putAudioLabAssetFromBlob,
  saveAudioLabProject,
} from './lib/audioLabStore.js'

const STORAGE_KEY = 'sabot:audiolab:robot-voice:v1'
let observer = null
let audioContext = null
let previewSource = null
let renderBusy = false

function isAudioLabRoute() {
  return typeof window !== 'undefined' && /\/wp-admin\/audiolab(?:\/|$)/.test(window.location.pathname)
}

function loadVoice() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    return normalizeRobotVoiceOptions(Object.keys(saved).length ? saved : { preset: 'terminal' })
  } catch {
    return normalizeRobotVoiceOptions({ preset: 'terminal' })
  }
}

function saveVoice(voice) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(voice)) } catch { /* local convenience only */ }
}

function parseClock(value = '') {
  const text = String(value || '').trim().replace(/^\//, '')
  const parts = text.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return 0
  if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2])
  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1])
  return Math.max(0, Number(text) || 0)
}

function currentPlayhead() {
  const audio = document.querySelector('.audio-lab-page audio')
  if (audio && Number.isFinite(audio.currentTime)) return Math.max(0, audio.currentTime)
  return parseClock(document.querySelector('.audio-lab-time-readout strong')?.textContent || '')
}

function currentProjectTitle() {
  return String(document.querySelector('.audio-lab-project-strip input')?.value || '').trim()
}

async function saveVisibleProject() {
  const button = Array.from(document.querySelectorAll('.audio-lab-page button'))
    .find((node) => String(node.textContent || '').trim() === 'Save Project' && !node.disabled)
  if (button) {
    button.click()
    await new Promise((resolve) => window.setTimeout(resolve, 550))
  }
}

async function activeSavedProject() {
  await saveVisibleProject()
  const projects = await listAudioLabProjects()
  if (!projects.length) throw new Error('Create or open an AudioLab project first.')
  const title = currentProjectTitle()
  if (title) {
    const exact = projects.find((project) => String(project.title || '').trim() === title)
    if (exact) return exact
  }
  return projects[0]
}

function floatPcmToWav(pcm, sampleRate) {
  const samples = pcm instanceof Float32Array ? pcm : new Float32Array(pcm)
  const dataSize = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const write = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, dataSize, true)
  let offset = 44
  for (const raw of samples) {
    const sample = Math.max(-1, Math.min(1, Number(raw) || 0))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }
  return new Blob([view], { type: 'audio/wav' })
}

function setStatus(panel, message, isError = false) {
  const status = panel.querySelector('[data-robot-status]')
  if (!status) return
  status.textContent = message
  status.classList.toggle('is-error', Boolean(isError))
}

function panelVoice(panel) {
  return normalizeRobotVoiceOptions({
    preset: panel.querySelector('[data-robot-preset]')?.value || 'terminal',
    baseF0: panel.querySelector('[data-robot-pitch]')?.value,
    rateMs: panel.querySelector('[data-robot-articulation]')?.value,
    wordGapMs: panel.querySelector('[data-robot-spacing]')?.value,
    transitionMs: panel.querySelector('[data-robot-smoothing]')?.value,
    aspiration: panel.querySelector('[data-robot-aspiration]')?.value,
    effort: panel.querySelector('[data-robot-effort]')?.value,
  })
}

function syncLabels(panel, voice = panelVoice(panel)) {
  const pairs = [
    ['pitch', `${Math.round(voice.baseF0)} Hz`],
    ['articulation', `${Math.round(voice.rateMs)} ms`],
    ['spacing', `${Math.round(voice.wordGapMs)} ms`],
    ['smoothing', `${Math.round(voice.transitionMs)} ms`],
    ['aspiration', voice.aspiration.toFixed(3)],
    ['effort', voice.effort.toFixed(2)],
  ]
  for (const [key, value] of pairs) {
    const output = panel.querySelector(`[data-robot-value="${key}"]`)
    if (output) output.textContent = value
  }
}

function setPanelVoice(panel, voiceLike) {
  const voice = normalizeRobotVoiceOptions(voiceLike)
  const values = {
    '[data-robot-preset]': voice.preset,
    '[data-robot-pitch]': voice.baseF0,
    '[data-robot-articulation]': voice.rateMs,
    '[data-robot-spacing]': voice.wordGapMs,
    '[data-robot-smoothing]': voice.transitionMs,
    '[data-robot-aspiration]': voice.aspiration,
    '[data-robot-effort]': voice.effort,
  }
  for (const [selector, value] of Object.entries(values)) {
    const input = panel.querySelector(selector)
    if (input) input.value = String(value)
  }
  syncLabels(panel, voice)
  saveVoice(voice)
}

async function preview(panel) {
  const text = String(panel.querySelector('[data-robot-text]')?.value || '').trim()
  if (!text) {
    setStatus(panel, 'Type the robot answer first.', true)
    return
  }
  try {
    setStatus(panel, 'Rendering preview locally…')
    const voice = panelVoice(panel)
    saveVoice(voice)
    const result = renderRobotSpeech(text, 1, voice)
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextCtor) throw new Error('This browser does not support Web Audio playback.')
    if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContextCtor()
    await audioContext.resume()
    try { previewSource?.stop() } catch { /* no-op */ }
    const buffer = audioContext.createBuffer(1, result.pcm.length, result.sampleRate)
    buffer.copyToChannel(result.pcm, 0)
    const source = audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(audioContext.destination)
    previewSource = source
    source.onended = () => {
      if (previewSource === source) previewSource = null
      setStatus(panel, 'Preview finished.')
    }
    source.start()
    setStatus(panel, 'Playing preview. Adjust the voice and replay until it is clean.')
  } catch (error) {
    setStatus(panel, String(error?.message || error), true)
  }
}

async function loadSiteDefaults(panel) {
  try {
    setStatus(panel, 'Loading site reader defaults…')
    const res = await fetch('/api/public-site-config', { headers: { accept: 'application/json' }, credentials: 'same-origin' })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) throw new Error(data?.error || 'Could not load public reader settings.')
    const voice = data?.config?.blocks?.accessibility?.robotVoice || data?.received?.publicSite?.blocks?.accessibility?.robotVoice || { preset: 'clear' }
    setPanelVoice(panel, voice)
    setStatus(panel, 'Loaded the site Read aloud voice as the starting point.')
  } catch (error) {
    setStatus(panel, String(error?.message || error), true)
  }
}

async function insertAtPlayhead(panel) {
  if (renderBusy) return
  const text = String(panel.querySelector('[data-robot-text]')?.value || '').trim()
  if (!text) {
    setStatus(panel, 'Type the robot answer first.', true)
    return
  }
  renderBusy = true
  panel.querySelectorAll('button, input, select, textarea').forEach((node) => { node.disabled = true })
  try {
    setStatus(panel, 'Rendering and inserting at the playhead…')
    const voice = panelVoice(panel)
    saveVoice(voice)
    const result = renderRobotSpeech(text, 1, voice)
    const wav = floatPcmToWav(result.pcm, result.sampleRate)
    const project = await activeSavedProject()
    const playhead = currentPlayhead()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const asset = await putAudioLabAssetFromBlob(wav, {
      filename: `robot-voice-${timestamp}.wav`,
      title: text.slice(0, 54) || 'Robot voice',
      mimeType: 'audio/wav',
      size: wav.size,
      duration: result.durationMs / 1000,
      source: 'robot-voice-local',
    })
    const clip = makeAudioLabClip(asset, {
      name: `Robot: ${text.slice(0, 42)}`,
      timelineStart: playhead,
      sourceStart: 0,
      sourceEnd: result.durationMs / 1000,
    })
    const existingRobotTrack = (project.tracks || []).find((track) => String(track.name || '').toLowerCase() === 'robot voice')
    const tracks = existingRobotTrack
      ? (project.tracks || []).map((track) => track.id === existingRobotTrack.id ? { ...track, clips: [...(track.clips || []), clip] } : track)
      : [...(project.tracks || []), makeAudioLabTrack({ name: 'Robot Voice', clips: [clip] })]
    const robotTrack = existingRobotTrack || tracks[tracks.length - 1]
    await saveAudioLabProject({
      ...project,
      sourceAssets: [...(project.sourceAssets || []), asset],
      tracks,
      transport: {
        ...(project.transport || {}),
        playhead,
        selectedTrackId: robotTrack?.id || '',
        selectedClipId: clip.id,
      },
    })
    setStatus(panel, `Inserted robot answer at ${playhead.toFixed(2)}s. Refreshing the timeline…`)
    window.setTimeout(() => window.location.reload(), 320)
  } catch (error) {
    setStatus(panel, String(error?.message || error), true)
    panel.querySelectorAll('button, input, select, textarea').forEach((node) => { node.disabled = false })
  } finally {
    renderBusy = false
  }
}

function buildPanel() {
  const voice = loadVoice()
  const panel = document.createElement('section')
  panel.className = 'audio-lab-panel audio-lab-robot-panel'
  panel.dataset.audiolabInspectorLabel = 'Robot voice'
  panel.innerHTML = `
    <p class="audio-lab-eyebrow">Local speech generator</p>
    <h2>Robot Voice</h2>
    <p class="description">Type an answer, preview it, then insert it directly into the timeline. Non-neural formant synthesis; no text leaves the browser.</p>
    <label class="audio-lab-field audio-lab-robot-script"><span>Robot answer</span><textarea data-robot-text rows="6" placeholder="Type the answer the robot should speak…"></textarea></label>
    <div class="audio-lab-robot-preset-row">
      <label class="audio-lab-field"><span>Voice</span><select data-robot-preset>${Object.values(ROBOT_VOICE_PRESETS).map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join('')}</select></label>
      <button type="button" class="button" data-robot-site-defaults>Use site reader voice</button>
    </div>
    <details class="audio-lab-robot-advanced">
      <summary>Tune voice</summary>
      <div class="audio-lab-robot-sliders">
        <label><span>Pitch <output data-robot-value="pitch"></output></span><input data-robot-pitch type="range" min="80" max="180" step="1"></label>
        <label><span>Articulation <output data-robot-value="articulation"></output></span><input data-robot-articulation type="range" min="82" max="160" step="1"></label>
        <label><span>Word spacing <output data-robot-value="spacing"></output></span><input data-robot-spacing type="range" min="20" max="90" step="1"></label>
        <label><span>Smoothing <output data-robot-value="smoothing"></output></span><input data-robot-smoothing type="range" min="12" max="60" step="1"></label>
        <label><span>Breath / hiss <output data-robot-value="aspiration"></output></span><input data-robot-aspiration type="range" min="0" max="0.08" step="0.001"></label>
        <label><span>Effort <output data-robot-value="effort"></output></span><input data-robot-effort type="range" min="0.25" max="0.85" step="0.01"></label>
      </div>
    </details>
    <div class="audio-lab-robot-actions">
      <button type="button" class="button" data-robot-preview>Preview</button>
      <button type="button" class="button button--primary" data-robot-insert>Insert at playhead</button>
    </div>
    <p class="audio-lab-robot-status" data-robot-status role="status">Ready. Record your question, move the playhead, then insert the robot answer here.</p>
  `
  setPanelVoice(panel, voice)
  panel.querySelector('[data-robot-preset]')?.addEventListener('change', (event) => setPanelVoice(panel, { preset: event.target.value }))
  panel.querySelectorAll('.audio-lab-robot-sliders input').forEach((input) => input.addEventListener('input', () => {
    const current = panelVoice(panel)
    syncLabels(panel, current)
    saveVoice(current)
  }))
  panel.querySelector('[data-robot-preview]')?.addEventListener('click', () => preview(panel))
  panel.querySelector('[data-robot-insert]')?.addEventListener('click', () => insertAtPlayhead(panel))
  panel.querySelector('[data-robot-site-defaults]')?.addEventListener('click', () => loadSiteDefaults(panel))
  return panel
}

function ensurePanel() {
  if (!isAudioLabRoute()) return
  const sidebar = document.querySelector('.audio-lab-page .audio-lab-project-sidebar')
  if (!sidebar || sidebar.querySelector('.audio-lab-robot-panel')) return
  sidebar.insertBefore(buildPanel(), sidebar.firstChild)
  window.dispatchEvent(new CustomEvent('sabot:audiolab-inspector-changed'))
}

function start() {
  if (!isAudioLabRoute()) return
  ensurePanel()
  observer?.disconnect()
  observer = new MutationObserver(() => ensurePanel())
  observer.observe(document.getElementById('root') || document.body, { childList: true, subtree: true })
}

window.addEventListener('load', start)
window.addEventListener('popstate', () => window.setTimeout(start, 80))
window.setTimeout(start, 180)
