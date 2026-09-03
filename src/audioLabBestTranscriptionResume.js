import {
  getAudioLabAsset,
  getAudioLabProject,
  listAudioLabProjects,
  makeAudioLabId,
  saveAudioLabProject,
} from './lib/audioLabStore'

const TRANSFORMERS_MODULE_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2'
const TARGET_SAMPLE_RATE = 16000
const BEST_MODEL_ENGLISH = 'Xenova/whisper-small.en'
const BEST_MODEL_MULTI = 'Xenova/whisper-small'
const BEST_CHUNK_SECONDS = 12
const BEST_OVERLAP_SECONDS = 2
const CHECKPOINT_VERSION = 'best-local-resume-v1'

let transformersPromise = null
let bestPipelinePromise = null
let activeRunId = ''
let activeWakeLock = null
let visibilityWakeLockHandler = null

function isAudioLabRoute() {
  return typeof window !== 'undefined' && /\/wp-admin\/audiolab(?:\/|$)/.test(window.location.pathname)
}

function currentSearch() {
  return new URLSearchParams(window.location.search || '')
}

async function getActiveProject() {
  const params = currentSearch()
  const projectId = params.get('project') || ''
  const projects = await listAudioLabProjects()
  const project = projectId ? await getAudioLabProject(projectId) : projects[0]
  return project || projects[0] || null
}

function getRenderedLocalAssetId(rendered = {}) {
  return String(
    rendered?.delivery?.localAssetId ||
    rendered?.delivery?.assetId ||
    rendered?.master?.localAssetId ||
    rendered?.master?.assetId ||
    rendered?.localAssetId ||
    rendered?.assetId ||
    ''
  )
}

function getPublicAudioUrl(rendered = {}) {
  return String(rendered?.preferredPublicUrl || rendered?.delivery?.publicUrl || rendered?.master?.publicUrl || rendered?.publicUrl || '')
}

function chooseTranscriptionSource(project = {}) {
  const rendered = project.renderedEpisode || {}
  const renderedAssetId = getRenderedLocalAssetId(rendered)
  if (renderedAssetId) return { type: 'asset', id: renderedAssetId, label: 'Rendered episode audio' }
  const publicUrl = getPublicAudioUrl(rendered)
  if (publicUrl) return { type: 'url', url: publicUrl, label: 'Public rendered audio URL' }
  const episodeAssetId = project.episode?.audioAssetId || ''
  if (episodeAssetId) return { type: 'asset', id: episodeAssetId, label: 'Episode source audio' }
  const first = project.sourceAssets?.[0]
  if (first?.id) return { type: 'asset', id: first.id, label: first.filename || 'First source asset' }
  return null
}

function transcriptShell() {
  return document.querySelector('.audio-lab-task-shell')
}

function statusElement(shell) {
  return shell?.querySelector?.('#audio-lab-transcript-status') || null
}

function setStatus(shell, message) {
  const status = statusElement(shell)
  if (status) status.textContent = String(message || '')
}

function toast(shell, message) {
  let note = shell?.querySelector?.('.audio-lab-task-toast')
  if (!note && shell) {
    note = document.createElement('div')
    note.className = 'audio-lab-task-toast'
    shell.appendChild(note)
  }
  if (!note) return
  note.textContent = String(message || '')
  note.classList.add('is-visible')
  window.clearTimeout(toast.timer)
  toast.timer = window.setTimeout(() => note.classList.remove('is-visible'), 2400)
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function formatBytes(value = 0) {
  const bytes = Math.max(0, Number(value) || 0)
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function formatDuration(value = 0) {
  const seconds = Math.max(0, Number(value) || 0)
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function normalizeLanguage(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isEnglishLanguage(language = '') {
  const normalized = normalizeLanguage(language)
  return !normalized || normalized === 'en' || normalized === 'en-us' || normalized === 'english'
}

function selectedQuality(shell) {
  return shell?.querySelector?.('#audio-lab-local-model-quality')?.value || localStorage.getItem('audioLab.localTranscriptionQuality') || 'fast'
}

function parseGlossary(value = '') {
  return String(value || '')
    .split(/\n|,/)
    .map((term) => term.trim())
    .filter(Boolean)
    .filter((term, index, all) => all.findIndex((item) => item.toLowerCase() === term.toLowerCase()) === index)
}

function getGlossaryTerms(shell, project = {}) {
  const controlValue = shell?.querySelector?.('#audio-lab-transcript-glossary')?.value || ''
  const projectTerms = Array.isArray(project.transcriptGlossary) ? project.transcriptGlossary : []
  const defaults = [
    'Example Project',
    'Propaganda by the Seed',
    'anarchist',
    'anarchism',
    'youth liberation',
    'queer',
    'neurodivergent',
    'iNaturalist',
    'Go Botany',
    'Channel Zero Podcast Network',
  ]
  return parseGlossary(controlValue || projectTerms.join('\n') || defaults.join('\n'))
}

function normalizeLoose(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function phraseRegexFromTerm(term = '') {
  const words = normalizeLoose(term).split(/\s+/).filter(Boolean)
  if (!words.length) return null
  const body = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\-_.]+')
  return new RegExp(`\\b${body}\\b`, 'gi')
}

function cleanupTranscriptText(text = '', glossary = []) {
  const replacements = [
    [/\binner guests?\b/gi, 'anarchist'],
    [/\binner guest communities\b/gi, 'anarchist communities'],
    [/\binner guest work\b/gi, 'anarchist work'],
    [/\binner guest spaces\b/gi, 'anarchist spaces'],
    [/\bwork inism\b/gi, 'anarchism'],
    [/\bwork inist\b/gi, 'anarchist'],
    [/\bself[\s-]*(?:exertating|actually tating|exertated|educateding)\b/gi, 'self-educating'],
    [/\bpropaganda by(?: the)? seed\b/gi, 'Propaganda by the Seed'],
    [/\bi\s*naturalist\b/gi, 'iNaturalist'],
    [/\bgo\s*botany\b/gi, 'Go Botany'],
  ]
  let next = String(text || '')
  for (const [pattern, replacement] of replacements) next = next.replace(pattern, replacement)
  for (const term of glossary) {
    if (term.length < 3) continue
    const exact = phraseRegexFromTerm(term)
    if (exact) next = next.replace(exact, term)
  }
  return next
    .replace(/\b(\w+)(\s+\1\b){1,}/gi, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([.!?])\s*([a-z])/g, (_, punct, char) => `${punct} ${char.toUpperCase()}`)
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function cueText(cue = {}, glossary = []) {
  return cleanupTranscriptText(cue.text || '', glossary)
}

async function resolveSourceBlob(project, source) {
  if (source.type === 'asset') {
    const stored = await getAudioLabAsset(source.id)
    if (!stored?.blob) throw new Error('Audio blob is missing locally. Render or re-import the audio first.')
    return {
      blob: stored.blob,
      filename: stored.filename || 'audiolab-audio',
      mimeType: stored.mimeType || stored.blob.type || 'audio/wav',
      label: source.label || stored.filename || 'Audio source',
      sourceKey: `asset:${source.id}`,
    }
  }

  if (source.type === 'url') {
    const response = await fetch(source.url)
    if (!response.ok) throw new Error(`Unable to fetch public audio for local transcription: ${response.status}`)
    const blob = await response.blob()
    const url = new URL(source.url, window.location.origin)
    return {
      blob,
      filename: url.searchParams.get('filename') || 'audiolab-public-audio',
      mimeType: response.headers.get('content-type') || blob.type || 'audio/wav',
      label: source.label || 'Public audio URL',
      sourceKey: `url:${source.url}`,
    }
  }

  throw new Error('No audio source available to transcribe.')
}

async function decodeBlob(blob) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextCtor) throw new Error('This browser cannot decode audio for local transcription.')
  const context = new AudioContextCtor()
  try {
    const bytes = await blob.arrayBuffer()
    return await context.decodeAudioData(bytes.slice(0))
  } finally {
    if (typeof context.close === 'function') {
      try { await context.close() } catch { /* ignore */ }
    }
  }
}

function sampleChannel(buffer, channelIndex, position) {
  const channel = buffer.getChannelData(Math.min(channelIndex, buffer.numberOfChannels - 1))
  const leftIndex = Math.max(0, Math.min(channel.length - 1, Math.floor(position)))
  const rightIndex = Math.max(0, Math.min(channel.length - 1, leftIndex + 1))
  const blend = position - leftIndex
  return channel[leftIndex] * (1 - blend) + channel[rightIndex] * blend
}

function downmixAndResample(buffer, targetRate = TARGET_SAMPLE_RATE) {
  const sourceRate = buffer.sampleRate || 44100
  const duration = buffer.duration || (buffer.length / sourceRate)
  const length = Math.max(1, Math.ceil(duration * targetRate))
  const samples = new Float32Array(length)
  const channels = Math.max(1, buffer.numberOfChannels || 1)
  const ratio = sourceRate / targetRate

  for (let index = 0; index < length; index += 1) {
    const sourcePosition = index * ratio
    let mixed = 0
    for (let channel = 0; channel < channels; channel += 1) mixed += sampleChannel(buffer, channel, sourcePosition)
    samples[index] = Math.max(-1, Math.min(1, mixed / channels))
  }

  return { samples, sampleRate: targetRate, duration }
}

function makeChunks({ samples, sampleRate, duration }) {
  const chunkFrames = Math.max(1, Math.floor(BEST_CHUNK_SECONDS * sampleRate))
  const overlapFrames = Math.max(0, Math.floor(BEST_OVERLAP_SECONDS * sampleRate))
  const stepFrames = Math.max(1, chunkFrames - overlapFrames)
  const chunks = []

  for (let startFrame = 0; startFrame < samples.length; startFrame += stepFrames) {
    const endFrame = Math.min(samples.length, startFrame + chunkFrames)
    chunks.push({
      index: chunks.length,
      offset: startFrame / sampleRate,
      overlap: chunks.length ? BEST_OVERLAP_SECONDS : 0,
      duration: (endFrame - startFrame) / sampleRate,
      samples: samples.slice(startFrame, endFrame),
      totalDuration: duration,
    })
    if (endFrame >= samples.length) break
  }

  return chunks
}

function checkpointKey(projectId = '') {
  return `audioLab.bestLocalCheckpoint.${projectId}`
}

function checkpointSignature({ projectId, sourceKey, blobSize, duration, language }) {
  return [CHECKPOINT_VERSION, projectId, sourceKey, blobSize, Math.round(Number(duration || 0)), normalizeLanguage(language)].join('|')
}

function readCheckpoint(projectId, signature) {
  try {
    const raw = JSON.parse(localStorage.getItem(checkpointKey(projectId)) || 'null')
    if (!raw || raw.version !== CHECKPOINT_VERSION || raw.signature !== signature) return null
    return raw
  } catch {
    return null
  }
}

function writeCheckpoint(projectId, checkpoint) {
  try {
    localStorage.setItem(checkpointKey(projectId), JSON.stringify({ ...checkpoint, version: CHECKPOINT_VERSION, updatedAt: new Date().toISOString() }))
  } catch {
    // localStorage can fill up. Project save still keeps the transcript text/cues.
  }
}

function clearCheckpoint(projectId) {
  try { localStorage.removeItem(checkpointKey(projectId)) } catch { /* ignore */ }
}

function normalizeChunks(result = {}, offset = 0, overlap = 0, glossary = []) {
  const chunks = Array.isArray(result.chunks) ? result.chunks : []
  return chunks.map((chunk, index) => {
    const timestamp = Array.isArray(chunk.timestamp) ? chunk.timestamp : []
    const rawStart = Number(timestamp[0] ?? chunk.start ?? 0)
    const rawEnd = Number(timestamp[1] ?? chunk.end ?? rawStart)
    if (overlap && rawEnd <= overlap) return null
    const text = cleanupTranscriptText(String(chunk.text || chunk.chunk || '').trim(), glossary)
    if (!text) return null
    return {
      id: makeAudioLabId('cue'),
      start: Math.max(0, (Number.isFinite(rawStart) ? rawStart : 0) + offset),
      end: Math.max(0, (Number.isFinite(rawEnd) ? rawEnd : rawStart) + offset),
      speaker: '',
      text,
    }
  }).filter(Boolean)
}

function dedupeAdjacentCues(cues = []) {
  const deduped = []
  for (const cue of cues) {
    const previous = deduped[deduped.length - 1]
    const currentText = normalizeLoose(cue.text)
    const previousText = normalizeLoose(previous?.text || '')
    if (previous && currentText && previousText && currentText === previousText) continue
    if (previous && previousText && currentText && previousText.endsWith(currentText)) continue
    deduped.push(cue)
  }
  return deduped
}

function buildTranscript({ textParts = [], cues = [], language = '', glossary = [], partial = true, completedChunks = 0, totalChunks = 0 } = {}) {
  const cleanTextParts = textParts.map((part) => cleanupTranscriptText(part, glossary)).filter(Boolean)
  const cleanCues = dedupeAdjacentCues(cues.map((cue) => ({ ...cue, text: cleanupTranscriptText(cue.text, glossary) })).filter((cue) => String(cue.text || '').trim()))
  const text = cleanTextParts.length ? cleanTextParts.join('\n\n') : cleanCues.map((cue) => cue.text).join('\n\n')
  return {
    mode: cleanCues.length ? 'timestamped' : 'plain',
    text: cleanupTranscriptText(text, glossary),
    cues: cleanCues,
    language: String(language || ''),
    provider: 'browser-local',
    engine: `Best local resumable${partial ? ` partial ${completedChunks}/${totalChunks}` : ''}`,
    quality: 'best',
    updatedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
  }
}

function appendResult(textParts, result = {}, chunkCues = [], glossary = []) {
  if (chunkCues.length) {
    const fromCues = chunkCues.map((cue) => cueText(cue, glossary)).filter(Boolean).join(' ')
    if (fromCues) textParts.push(cleanupTranscriptText(fromCues, glossary))
    return
  }
  const text = cleanupTranscriptText(result?.text || '', glossary)
  if (!text) return
  const previous = normalizeLoose(textParts[textParts.length - 1] || '')
  const current = normalizeLoose(text)
  if (previous && current && previous.endsWith(current)) return
  textParts.push(text)
}

async function loadTransformers(shell) {
  if (!transformersPromise) {
    transformersPromise = import(/* @vite-ignore */ TRANSFORMERS_MODULE_URL).then((mod) => {
      if (mod?.env) {
        mod.env.allowLocalModels = false
        mod.env.useBrowserCache = true
      }
      return mod
    })
  }
  setStatus(shell, 'Loading Best local Whisper. First run downloads the larger model; yes, it is chunky, unlike most promises made by software.')
  return transformersPromise
}

async function getBestTranscriber(shell, language = '') {
  if (bestPipelinePromise) return bestPipelinePromise
  const model = isEnglishLanguage(language) ? BEST_MODEL_ENGLISH : BEST_MODEL_MULTI
  const { pipeline } = await loadTransformers(shell)
  bestPipelinePromise = pipeline('automatic-speech-recognition', model, {
    quantized: true,
    progress_callback: (progress) => {
      const status = progress?.status || ''
      const file = progress?.file ? ` ${progress.file}` : ''
      const pct = Number.isFinite(progress?.progress) ? ` ${Math.round(progress.progress)}%` : ''
      if (status) setStatus(shell, `Loading Best local model:${file}${pct}`)
    },
  })
  return bestPipelinePromise
}

async function acquireWakeLock(shell) {
  if (!navigator.wakeLock?.request) return null
  try {
    activeWakeLock = await navigator.wakeLock.request('screen')
    if (!visibilityWakeLockHandler) {
      visibilityWakeLockHandler = () => {
        if (document.visibilityState === 'visible' && activeRunId && !activeWakeLock?.released) {
          navigator.wakeLock.request('screen').then((lock) => { activeWakeLock = lock }).catch(() => {})
        }
      }
      document.addEventListener('visibilitychange', visibilityWakeLockHandler)
    }
    setStatus(shell, 'Screen wake lock active for Best local transcription. Keep the tab foregrounded and the machine plugged in if you can.')
    return activeWakeLock
  } catch {
    setStatus(shell, 'Best local will run, but this browser refused the screen wake lock. Keep the tab awake like it is a sickly Victorian child.')
    return null
  }
}

async function releaseWakeLock() {
  if (activeWakeLock && typeof activeWakeLock.release === 'function') {
    try { await activeWakeLock.release() } catch { /* ignore */ }
  }
  activeWakeLock = null
}

function inferResumeIndex(project = {}, chunks = [], checkpoint = null) {
  if (checkpoint && Number.isFinite(Number(checkpoint.nextChunkIndex))) {
    return Math.max(0, Math.min(chunks.length, Number(checkpoint.nextChunkIndex)))
  }
  const cues = Array.isArray(project.transcript?.cues) ? project.transcript.cues : []
  const maxEnd = cues.reduce((max, cue) => Math.max(max, Number(cue.end || cue.start || 0)), 0)
  if (!maxEnd) return 0
  const step = Math.max(1, BEST_CHUNK_SECONDS - BEST_OVERLAP_SECONDS)
  return Math.max(0, Math.min(chunks.length, Math.floor(maxEnd / step)))
}

async function saveProgress({ project, shell, textarea, textParts, cues, language, glossary, chunkIndex, totalChunks, signature }) {
  const transcript = buildTranscript({ textParts, cues, language, glossary, partial: chunkIndex < totalChunks, completedChunks: chunkIndex, totalChunks })
  await saveAudioLabProject({ ...project, transcript, transcriptGlossary: glossary })
  if (textarea) textarea.value = transcript.text || ''
  writeCheckpoint(project.id, {
    signature,
    nextChunkIndex: chunkIndex,
    totalChunks,
    completedChunks: chunkIndex,
    chunkSeconds: BEST_CHUNK_SECONDS,
    overlapSeconds: BEST_OVERLAP_SECONDS,
  })
  setStatus(shell, `Saved Best local checkpoint after chunk ${chunkIndex}/${totalChunks}. Safe to resume from here if the browser flakes out.`)
  window.dispatchEvent(new Event('audiolab:local-transcript-saved'))
  return transcript
}

async function runBestLocalTranscription(shell, button, textarea) {
  const runId = makeAudioLabId('best-local-transcribe')
  activeRunId = runId
  const language = shell.querySelector('#audio-lab-transcript-language')?.value || ''
  localStorage.setItem('audioLab.localTranscriptionQuality', 'best')
  const project = await getActiveProject()
  if (!project) throw new Error('No AudioLab project is open.')
  const source = chooseTranscriptionSource(project)
  if (!source) throw new Error('No rendered or source audio available to transcribe.')
  const glossary = getGlossaryTerms(shell, project)
  const state = { textParts: [], cues: [] }

  button.disabled = true
  button.textContent = 'Best preparing…'
  setStatus(shell, 'Preparing resumable Best local transcription. This keeps the good model and saves every chunk, because apparently we do learn eventually.')

  try {
    await acquireWakeLock(shell)
    const rawAudio = await resolveSourceBlob(project, source)
    if (activeRunId !== runId) throw new Error('Best local transcription cancelled.')
    setStatus(shell, `Decoding ${rawAudio.label || rawAudio.filename} (${formatBytes(rawAudio.blob.size)}) locally…`)
    await sleep(50)
    const decoded = await decodeBlob(rawAudio.blob)
    const prepared = downmixAndResample(decoded, TARGET_SAMPLE_RATE)
    const chunks = makeChunks(prepared)
    const signature = checkpointSignature({ projectId: project.id, sourceKey: rawAudio.sourceKey, blobSize: rawAudio.blob.size, duration: decoded.duration, language })
    const checkpoint = readCheckpoint(project.id, signature)
    const resumeIndex = inferResumeIndex(project, chunks, checkpoint)

    if (resumeIndex > 0 && project.transcript?.text) {
      state.textParts = String(project.transcript.text || '').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
      state.cues = Array.isArray(project.transcript.cues) ? project.transcript.cues.slice() : []
      setStatus(shell, `Resuming Best local from chunk ${resumeIndex + 1}/${chunks.length}. Previous checkpoint survived. The browser gets no medal.`)
    } else {
      clearCheckpoint(project.id)
      setStatus(shell, `Starting Best local in ${chunks.length} smaller resumable chunks. Each chunk is ${BEST_CHUNK_SECONDS}s with ${BEST_OVERLAP_SECONDS}s overlap.`)
    }

    const transcriber = await getBestTranscriber(shell, language)
    await sleep(50)

    for (let index = resumeIndex; index < chunks.length; index += 1) {
      if (activeRunId !== runId) throw new Error('Best local transcription cancelled.')
      const chunk = chunks[index]
      button.textContent = `Best ${index + 1}/${chunks.length}`
      setStatus(shell, `Best local chunk ${index + 1}/${chunks.length}: ${formatDuration(chunk.offset)}–${formatDuration(chunk.offset + chunk.duration)}. Saved after every chunk.`)
      await sleep(120)

      const result = await transcriber(chunk.samples, {
        sampling_rate: prepared.sampleRate,
        chunk_length_s: Math.min(BEST_CHUNK_SECONDS, Math.max(5, chunk.duration)),
        stride_length_s: 0,
        return_timestamps: true,
        task: 'transcribe',
        language: language || undefined,
      })

      if (activeRunId !== runId) throw new Error('Best local transcription cancelled.')
      const chunkCues = normalizeChunks(result || {}, chunk.offset, chunk.overlap, glossary)
      state.cues.push(...chunkCues)
      appendResult(state.textParts, result || {}, chunkCues, glossary)
      await saveProgress({ project, shell, textarea, textParts: state.textParts, cues: state.cues, language, glossary, chunkIndex: index + 1, totalChunks: chunks.length, signature })
      await sleep(120)
    }

    const finalTranscript = buildTranscript({ textParts: state.textParts, cues: state.cues, language, glossary, partial: false, completedChunks: chunks.length, totalChunks: chunks.length })
    const saved = await saveAudioLabProject({ ...project, transcript: finalTranscript, transcriptGlossary: glossary })
    clearCheckpoint(project.id)
    if (textarea) textarea.value = finalTranscript.text || ''
    setStatus(shell, `Best local transcript finished with ${finalTranscript.cues.length} timestamped cues. Saved for ${saved.title || 'AudioLab project'}.`)
    toast(shell, 'Best local transcript finished.')
    window.dispatchEvent(new Event('audiolab:local-transcript-saved'))
    window.dispatchEvent(new Event('audiolab-task-navigation'))
  } finally {
    if (activeRunId === runId) activeRunId = ''
    await releaseWakeLock()
    button.disabled = false
    button.textContent = 'Auto transcribe audio'
  }
}

function handleBestClick(event) {
  if (!isAudioLabRoute()) return
  const button = event.target?.closest?.('#audio-lab-transcribe-run')
  if (!button) return
  const shell = button.closest('.audio-lab-task-shell')
  if (!shell) return
  if (selectedQuality(shell) !== 'best') return

  event.preventDefault()
  event.stopPropagation()
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()

  const textarea = shell.querySelector('#audio-lab-transcript-text')
  runBestLocalTranscription(shell, button, textarea).catch((error) => {
    setStatus(shell, error.message || 'Best local transcription failed.')
    toast(shell, error.message || 'Best local transcription failed.')
  })
}

function enhanceBestControls() {
  if (!isAudioLabRoute()) return
  const shell = transcriptShell()
  if (!shell || shell.dataset.bestResumeEnhanced === 'true') return
  const select = shell.querySelector('#audio-lab-local-model-quality')
  const actions = shell.querySelector('.audio-lab-local-transcript-actions')
  if (!select || !actions) return
  shell.dataset.bestResumeEnhanced = 'true'
  const bestOption = select.querySelector('option[value="best"]')
  if (bestOption) {
    bestOption.disabled = false
    bestOption.textContent = 'Best local — slow, resumable, saves every chunk'
  }
  const note = document.createElement('p')
  note.className = 'description audio-lab-best-resume-note'
  note.textContent = 'Best local now uses smaller resumable chunks, saves after every chunk, and tries to keep the screen awake. If the browser stops at chunk 24/whatever, reload and click Auto Transcribe again with Best selected to resume.'
  actions.insertAdjacentElement('afterend', note)
}

function startObserver() {
  if (typeof MutationObserver === 'undefined') return
  const observer = new MutationObserver(() => enhanceBestControls())
  observer.observe(document.body, { childList: true, subtree: true })
}

window.addEventListener('click', handleBestClick, true)
window.addEventListener('load', () => window.setTimeout(enhanceBestControls, 180))
window.addEventListener('popstate', () => window.setTimeout(enhanceBestControls, 180))
window.addEventListener('audiolab:navigation', () => window.setTimeout(enhanceBestControls, 180))
window.addEventListener('audiolab-task-navigation', () => window.setTimeout(enhanceBestControls, 180))
startObserver()
window.setTimeout(enhanceBestControls, 500)
