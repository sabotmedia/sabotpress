import { renderSabotSpeech, SABOT_SPEECH_VOICE } from './accessibility/sabotSpeechEngine.js'
import {
  listAudioLabProjects,
  makeAudioLabClip,
  makeAudioLabTrack,
  putAudioLabAssetFromBlob,
  saveAudioLabProject,
} from './lib/audioLabStore.js'

const STORAGE_KEY = 'sabot:audiolab:sabot-voice:v1'
let observer = null
let audioContext = null
let previewSource = null
let renderBusy = false

function isAudioLabRoute() {
  return typeof window !== 'undefined' && /\/wp-admin\/audiolab(?:\/|$)/.test(window.location.pathname)
}

function loadSettings() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      rate: Math.min(1.6, Math.max(0.65, Number(value.rate) || 1)),
      pitchMeanHz: value.pitchMeanHz == null || value.pitchMeanHz === '' ? '' : Number(value.pitchMeanHz),
      pitchStdDev: value.pitchStdDev == null || value.pitchStdDev === '' ? '' : Number(value.pitchStdDev),
      gain: Math.min(2, Math.max(0.25, Number(value.gain) || 1)),
    }
  } catch {
    return { rate: 1, pitchMeanHz: '', pitchStdDev: '', gain: 1 }
  }
}

function saveSettings(settings) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch { /* local convenience only */ }
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
  if (!button) return
  button.click()
  await new Promise((resolve) => window.setTimeout(resolve, 180))
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
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
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
  view.setUint32(40, samples.length * 2, true)
  let offset = 44
  for (const raw of samples) {
    const sample = Math.max(-1, Math.min(1, Number(raw) || 0))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }
  return new Blob([view], { type: 'audio/wav' })
}

function setStatus(panel, message, isError = false) {
  const status = panel.querySelector('[data-sabot-voice-status]')
  if (!status) return
  status.textContent = message
  status.classList.toggle('is-error', Boolean(isError))
}

function panelSettings(panel) {
  return {
    rate: Number(panel.querySelector('[data-sabot-voice-rate]')?.value || 1),
    pitchMeanHz: panel.querySelector('[data-sabot-voice-pitch-enabled]')?.checked
      ? Number(panel.querySelector('[data-sabot-voice-pitch]')?.value || 180)
      : '',
    pitchStdDev: panel.querySelector('[data-sabot-voice-pitch-enabled]')?.checked
      ? Number(panel.querySelector('[data-sabot-voice-variation]')?.value || 20)
      : '',
    gain: Number(panel.querySelector('[data-sabot-voice-gain]')?.value || 1),
  }
}

function syncLabels(panel) {
  const settings = panelSettings(panel)
  const rate = panel.querySelector('[data-sabot-voice-value="rate"]')
  const pitch = panel.querySelector('[data-sabot-voice-value="pitch"]')
  const variation = panel.querySelector('[data-sabot-voice-value="variation"]')
  const gain = panel.querySelector('[data-sabot-voice-value="gain"]')
  if (rate) rate.textContent = `${settings.rate.toFixed(2)}×`
  if (pitch) pitch.textContent = settings.pitchMeanHz === '' ? 'original' : `${Math.round(settings.pitchMeanHz)} Hz`
  if (variation) variation.textContent = settings.pitchStdDev === '' ? 'original' : `${Math.round(settings.pitchStdDev)}`
  if (gain) gain.textContent = `${settings.gain.toFixed(2)}×`
  const enabled = panel.querySelector('[data-sabot-voice-pitch-enabled]')?.checked
  panel.querySelectorAll('[data-sabot-voice-pitch], [data-sabot-voice-variation]').forEach((input) => { input.disabled = !enabled })
  saveSettings(settings)
}

function applySettings(panel, settings = loadSettings()) {
  const rate = panel.querySelector('[data-sabot-voice-rate]')
  const pitch = panel.querySelector('[data-sabot-voice-pitch]')
  const variation = panel.querySelector('[data-sabot-voice-variation]')
  const gain = panel.querySelector('[data-sabot-voice-gain]')
  const enabled = panel.querySelector('[data-sabot-voice-pitch-enabled]')
  if (rate) rate.value = String(settings.rate || 1)
  if (pitch) pitch.value = String(settings.pitchMeanHz || 180)
  if (variation) variation.value = String(settings.pitchStdDev || 20)
  if (gain) gain.value = String(settings.gain || 1)
  if (enabled) enabled.checked = settings.pitchMeanHz !== '' && settings.pitchMeanHz != null
  syncLabels(panel)
}

async function synthesize(panel) {
  const text = String(panel.querySelector('[data-sabot-voice-text]')?.value || '').trim()
  if (!text) throw new Error('Type the answer Sabot Voice should read first.')
  const settings = panelSettings(panel)
  saveSettings(settings)
  setStatus(panel, 'Loading Sabot Voice locally and rendering…')
  return renderSabotSpeech(text, settings.rate, {
    ...settings,
    disableFallback: false,
  })
}

async function preview(panel) {
  if (renderBusy) return
  renderBusy = true
  try {
    const result = await synthesize(panel)
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextCtor) throw new Error('This browser does not support Web Audio playback.')
    if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContextCtor()
    await audioContext.resume()
    try { previewSource?.stop() } catch { /* already stopped */ }
    const buffer = audioContext.createBuffer(1, result.pcm.length, result.sampleRate)
    buffer.copyToChannel(result.pcm, 0)
    const source = audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(audioContext.destination)
    previewSource = source
    source.onended = () => {
      if (previewSource === source) previewSource = null
      setStatus(panel, result.engine === 'flite' ? 'Preview finished • Sabot Voice / CMU LNH' : 'Preview finished using emergency legacy fallback.', result.engine !== 'flite')
    }
    source.start()
    setStatus(panel, result.engine === 'flite' ? 'Playing Sabot Voice / CMU LNH.' : `Flite could not start. Playing fallback: ${result.fallbackReason || 'legacy voice'}`, result.engine !== 'flite')
  } catch (error) {
    setStatus(panel, String(error?.message || error), true)
  } finally {
    renderBusy = false
  }
}

function refreshCurrentProjectInPlace() {
  window.dispatchEvent(new CustomEvent('sabot:audiolab-project-updated'))
  window.setTimeout(() => {
    const active = document.querySelector('.audio-lab-project-card.is-active')
    if (active instanceof HTMLButtonElement && !active.disabled) active.click()
  }, 80)
}

async function insertAtPlayhead(panel) {
  if (renderBusy) return
  renderBusy = true
  const controls = panel.querySelectorAll('button, input, textarea')
  controls.forEach((node) => { node.disabled = true })
  try {
    const text = String(panel.querySelector('[data-sabot-voice-text]')?.value || '').trim()
    if (!text) throw new Error('Type the answer Sabot Voice should read first.')
    const result = await synthesize(panel)
    const wav = floatPcmToWav(result.pcm, result.sampleRate)
    const project = await activeSavedProject()
    const playhead = currentPlayhead()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const asset = await putAudioLabAssetFromBlob(wav, {
      filename: `sabot-voice-${timestamp}.wav`,
      title: text.slice(0, 54) || 'Sabot Voice',
      mimeType: 'audio/wav',
      size: wav.size,
      duration: result.durationMs / 1000,
      source: result.engine === 'flite' ? `flite-${SABOT_SPEECH_VOICE}` : 'legacy-speech-fallback',
    })
    const clip = makeAudioLabClip(asset, {
      name: `Sabot Voice: ${text.slice(0, 42)}`,
      timelineStart: playhead,
      sourceStart: 0,
      sourceEnd: result.durationMs / 1000,
    })
    const existingVoiceTrack = (project.tracks || []).find((track) => String(track.name || '').toLowerCase() === 'sabot voice')
    const tracks = existingVoiceTrack
      ? (project.tracks || []).map((track) => track.id === existingVoiceTrack.id ? { ...track, clips: [...(track.clips || []), clip] } : track)
      : [...(project.tracks || []), makeAudioLabTrack({ name: 'Sabot Voice', clips: [clip] })]
    const voiceTrack = existingVoiceTrack || tracks[tracks.length - 1]
    await saveAudioLabProject({
      ...project,
      sourceAssets: [...(project.sourceAssets || []), asset],
      tracks,
      transport: {
        ...(project.transport || {}),
        playhead,
        selectedTrackId: voiceTrack?.id || '',
        selectedClipId: clip.id,
      },
    })
    setStatus(panel, `Inserted Sabot Voice at ${playhead.toFixed(2)}s. Timeline refreshed in place.`)
    refreshCurrentProjectInPlace()
  } catch (error) {
    setStatus(panel, String(error?.message || error), true)
  } finally {
    renderBusy = false
    controls.forEach((node) => { node.disabled = false })
    syncLabels(panel)
  }
}

function buildPanel() {
  const panel = document.createElement('section')
  panel.className = 'audio-lab-panel audio-lab-robot-panel audio-lab-sabot-voice-panel'
  panel.dataset.audiolabInspectorLabel = 'Sabot Voice'
  panel.innerHTML = `
    <p class="audio-lab-eyebrow">Generate speech</p>
    <h2>Sabot Voice</h2>
    <p class="description"><strong>Flite ${SABOT_SPEECH_VOICE}</strong>. Classic non-neural synthesis. Text and generated speech stay in this browser.</p>
    <label class="audio-lab-field audio-lab-robot-script"><span>Answer / narration</span><textarea data-sabot-voice-text rows="7" placeholder="Type what Sabot Voice should say…"></textarea></label>
    <div class="audio-lab-robot-sliders">
      <label><span>Speed <output data-sabot-voice-value="rate"></output></span><input data-sabot-voice-rate type="range" min="0.65" max="1.6" step="0.01"></label>
      <label><span>Output level <output data-sabot-voice-value="gain"></output></span><input data-sabot-voice-gain type="range" min="0.5" max="1.6" step="0.05"></label>
    </div>
    <details class="audio-lab-robot-advanced">
      <summary>Advanced pitch tuning</summary>
      <label class="audio-lab-field"><span><input data-sabot-voice-pitch-enabled type="checkbox"> Override the original LNH pitch contour</span></label>
      <div class="audio-lab-robot-sliders">
        <label><span>Pitch center <output data-sabot-voice-value="pitch"></output></span><input data-sabot-voice-pitch type="range" min="90" max="260" step="1"></label>
        <label><span>Pitch variation <output data-sabot-voice-value="variation"></output></span><input data-sabot-voice-variation type="range" min="0" max="60" step="1"></label>
      </div>
      <p class="description">Leave pitch override off for the exact cmu_us_lnh voice you chose.</p>
    </details>
    <div class="audio-lab-robot-actions">
      <button type="button" class="button" data-sabot-voice-preview>Preview</button>
      <button type="button" class="button button--primary" data-sabot-voice-insert>Insert at playhead</button>
    </div>
    <p class="audio-lab-robot-status" data-sabot-voice-status role="status">Ready. The first preview may take a moment while the local voice loads; later renders use the browser cache.</p>
  `
  applySettings(panel)
  panel.querySelectorAll('input').forEach((input) => input.addEventListener('input', () => syncLabels(panel)))
  panel.querySelector('[data-sabot-voice-pitch-enabled]')?.addEventListener('change', () => syncLabels(panel))
  panel.querySelector('[data-sabot-voice-preview]')?.addEventListener('click', () => preview(panel))
  panel.querySelector('[data-sabot-voice-insert]')?.addEventListener('click', () => insertAtPlayhead(panel))
  return panel
}

function ensurePanel() {
  if (!isAudioLabRoute()) return
  const sidebar = document.querySelector('.audio-lab-page .audio-lab-project-sidebar')
  if (!sidebar || sidebar.querySelector('.audio-lab-sabot-voice-panel')) return
  sidebar.querySelector('.audio-lab-robot-panel')?.remove()
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
window.setTimeout(start, 0)
