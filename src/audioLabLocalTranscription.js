import {
  getAudioLabAsset,
  getAudioLabProject,
  listAudioLabProjects,
  makeAudioLabId,
  saveAudioLabProject,
} from './lib/audioLabStore'

const TRANSFORMERS_MODULE_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2'
const TARGET_SAMPLE_RATE = 16000
const LOCAL_CHUNK_SECONDS = 24
const LOCAL_CHUNK_OVERLAP_SECONDS = 3
const PARTIAL_SAVE_EVERY_CHUNKS = 2
const TRANSCRIPT_MODEL_OPTIONS = {
  fast: {
    label: 'Fast draft',
    english: 'Xenova/whisper-tiny.en',
    multilingual: 'Xenova/whisper-tiny',
    chunkSeconds: 20,
    note: 'Fastest and roughest.',
  },
  better: {
    label: 'Better local',
    english: 'Xenova/whisper-base.en',
    multilingual: 'Xenova/whisper-base',
    chunkSeconds: 24,
    note: 'Slower, better names and phrases.',
  },
  best: {
    label: 'Best local',
    english: 'Xenova/whisper-small.en',
    multilingual: 'Xenova/whisper-small',
    chunkSeconds: 30,
    note: 'Slow and heavy, but closest local quality.',
  },
}
const DEFAULT_GLOSSARY_TERMS = [
  'Example Project',
  'Propaganda by the Seed',
  'Aaron',
  'M.K.A.',
  'anarchist',
  'anarchism',
  'anarchy',
  'youth liberation',
  'queer',
  'neurodivergent',
  'iNaturalist',
  'Go Botany',
  'Channel Zero Podcast Network',
  'Edgewood Nursery',
  'Mount Joy Orchard',
  'Portland, Maine',
  'foraging',
  'native plants',
  'climate grief',
  'political prisoners',
  'Victory Gardens Project',
]

let transformersPromise = null
const pipelineCache = new Map()
let activeRunId = ''
let activeRunCancelRequested = false
let activeRunState = null

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
  toast.timer = window.setTimeout(() => note.classList.remove('is-visible'), 2200)
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

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeLanguage(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isEnglishLanguage(language = '') {
  const normalized = normalizeLanguage(language)
  return !normalized || normalized === 'en' || normalized === 'en-us' || normalized === 'english'
}

function getSelectedQuality(shell) {
  const value = shell?.querySelector?.('#audio-lab-local-model-quality')?.value || localStorage.getItem('audioLab.localTranscriptionQuality') || 'fast'
  return TRANSCRIPT_MODEL_OPTIONS[value] ? value : 'fast'
}

function pickModel(language = '', quality = 'fast') {
  const option = TRANSCRIPT_MODEL_OPTIONS[quality] || TRANSCRIPT_MODEL_OPTIONS.fast
  return isEnglishLanguage(language) ? option.english : option.multilingual
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
  setStatus(shell, 'Loading local transcription engine in this browser. First run downloads the model, because freedom apparently ships as a giant math brick.')
  return transformersPromise
}

async function getTranscriber(shell, language = '', quality = 'fast') {
  const model = pickModel(language, quality)
  if (pipelineCache.has(model)) return pipelineCache.get(model)
  const { pipeline } = await loadTransformers(shell)
  const promise = pipeline('automatic-speech-recognition', model, {
    quantized: true,
    progress_callback: (progress) => {
      const status = progress?.status || ''
      const file = progress?.file ? ` ${progress.file}` : ''
      const pct = Number.isFinite(progress?.progress) ? ` ${Math.round(progress.progress)}%` : ''
      if (status) setStatus(shell, `Loading local Whisper model:${file}${pct}`)
    },
  })
  pipelineCache.set(model, promise)
  return promise
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

function makeLocalChunks({ samples, sampleRate, duration }, quality = 'fast') {
  const option = TRANSCRIPT_MODEL_OPTIONS[quality] || TRANSCRIPT_MODEL_OPTIONS.fast
  const chunkSeconds = option.chunkSeconds || LOCAL_CHUNK_SECONDS
  const overlapSeconds = Math.min(LOCAL_CHUNK_OVERLAP_SECONDS, Math.max(0, chunkSeconds / 4))
  const chunkFrames = Math.max(1, Math.floor(chunkSeconds * sampleRate))
  const overlapFrames = Math.max(0, Math.floor(overlapSeconds * sampleRate))
  const stepFrames = Math.max(1, chunkFrames - overlapFrames)
  const chunks = []

  for (let startFrame = 0; startFrame < samples.length; startFrame += stepFrames) {
    const endFrame = Math.min(samples.length, startFrame + chunkFrames)
    const offset = startFrame / sampleRate
    chunks.push({
      index: chunks.length,
      offset,
      overlap: chunks.length ? overlapSeconds : 0,
      duration: (endFrame - startFrame) / sampleRate,
      samples: samples.slice(startFrame, endFrame),
      totalDuration: duration,
    })
    if (endFrame >= samples.length) break
  }

  return chunks
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
  const terms = parseGlossary(controlValue || projectTerms.join('\n') || DEFAULT_GLOSSARY_TERMS.join('\n'))
  return terms.length ? terms : DEFAULT_GLOSSARY_TERMS
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

function applyCommonRepairs(text = '') {
  const replacements = [
    [/\binner guests?\b/gi, 'anarchist'],
    [/\binner guest communities\b/gi, 'anarchist communities'],
    [/\binner guest work\b/gi, 'anarchist work'],
    [/\binner guest spaces\b/gi, 'anarchist spaces'],
    [/\bwork inism\b/gi, 'anarchism'],
    [/\bwork inist\b/gi, 'anarchist'],
    [/\benergy issue\b/gi, 'anarchy issue'],
    [/\bself[\s-]*(?:exertating|actually tating|exertated|educateding)\b/gi, 'self-educating'],
    [/\bpropaganda by(?: the)? seed\b/gi, 'Propaganda by the Seed'],
    [/\bi\s*naturalist\b/gi, 'iNaturalist'],
    [/\bgo\s*botany\b/gi, 'Go Botany'],
    [/\bchannel zero\b/gi, 'Channel Zero'],
    [/\bedgewood nursery\b/gi, 'Edgewood Nursery'],
    [/\bmount\s+(?:jewai|joy)\s+orchard\b/gi, 'Mount Joy Orchard'],
    [/\bclimate resistant agriculture\b/gi, 'climate-resilient agriculture'],
    [/\byou than teams\b/gi, 'youth and teens'],
    [/\bNew Year's Old\b/gi, 'years old'],
  ]
  let next = String(text || '')
  for (const [pattern, replacement] of replacements) next = next.replace(pattern, replacement)
  return next
}

function applyGlossaryRepairs(text = '', glossary = []) {
  let next = String(text || '')
  for (const term of glossary) {
    if (term.length < 3) continue
    const exact = phraseRegexFromTerm(term)
    if (exact) next = next.replace(exact, term)
  }
  return next
}

function cleanupTranscriptText(text = '', glossary = []) {
  let next = applyCommonRepairs(text)
  next = applyGlossaryRepairs(next, glossary)
  next = next
    .replace(/\b(\w+)(\s+\1\b){1,}/gi, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([.!?])\s*([a-z])/g, (_, punct, char) => `${punct} ${char.toUpperCase()}`)
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return next
}

function cueText(cue = {}) {
  return cleanupTranscriptText(cue.text || '')
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
      order: index,
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

function normalizeTranscriptForSave({ textParts = [], cues = [], language = '', glossary = [], quality = 'fast', partial = false, cancelled = false } = {}) {
  const cleanTextParts = textParts.map((part) => cleanupTranscriptText(part, glossary)).filter(Boolean)
  const cleanCues = dedupeAdjacentCues(cues.map((cue) => ({ ...cue, text: cleanupTranscriptText(cue.text, glossary) })).filter((cue) => String(cue.text || '').trim()))
  const text = cleanTextParts.length ? cleanTextParts.join('\n\n') : cleanCues.map((cue) => cue.text).join('\n\n')
  const suffix = cancelled ? ' cancelled partial' : partial ? ' partial' : ''
  return {
    mode: cleanCues.length ? 'timestamped' : 'plain',
    text: cleanupTranscriptText(text, glossary),
    cues: cleanCues,
    language: String(language || ''),
    provider: 'browser-local',
    engine: `${TRANSCRIPT_MODEL_OPTIONS[quality]?.label || 'Local Whisper'}${suffix}`,
    quality,
    cancelled: Boolean(cancelled),
    updatedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
  }
}

function hasTranscriptProgress(state = activeRunState) {
  return Boolean(state && (state.textParts?.length || state.cues?.length))
}

function setCancelButtonState(shell, running = false, cancelling = false) {
  const cancelButton = shell?.querySelector?.('#audio-lab-transcript-cancel-local')
  if (!cancelButton) return
  cancelButton.hidden = !running && !cancelling
  cancelButton.disabled = !running || cancelling
  cancelButton.textContent = cancelling ? 'Cancelling…' : 'Cancel transcription'
}

async function persistRunProgress(state = activeRunState, { cancelled = false, chunkIndex = 0, totalChunks = 0 } = {}) {
  if (!state?.project || !hasTranscriptProgress(state)) return null
  const transcript = normalizeTranscriptForSave({
    textParts: state.textParts || [],
    cues: state.cues || [],
    language: state.language || '',
    glossary: state.glossary || [],
    quality: state.quality || 'fast',
    partial: !cancelled,
    cancelled,
  })
  await saveAudioLabProject({ ...state.project, transcript, transcriptGlossary: state.glossary || [] })
  if (state.textarea) state.textarea.value = transcript.text || ''
  if (state.shell) {
    const where = chunkIndex && totalChunks ? ` after chunk ${chunkIndex}/${totalChunks}` : ''
    setStatus(state.shell, cancelled ? `Cancelled local transcription${where}. Saved the partial transcript.` : `Saved local partial transcript${where}. Keep the tab open, because naturally browsers hate responsibility.`)
  }
  return transcript
}

function requestCancelLocalTranscription(shell = null) {
  if (!activeRunId) return
  activeRunCancelRequested = true
  activeRunId = ''
  setCancelButtonState(shell || activeRunState?.shell, true, true)
  setStatus(shell || activeRunState?.shell, 'Cancelling local transcription after the current chunk finishes. The model will not politely stop mid-thought, because naturally it has one job and no manners.')
  persistRunProgress(activeRunState, { cancelled: true, chunkIndex: activeRunState?.lastCompletedChunk || 0, totalChunks: activeRunState?.totalChunks || 0 })
    .catch((error) => toast(shell || activeRunState?.shell, error.message || 'Could not save cancelled transcript.'))
}

function assertNotCancelled(runId, state = activeRunState) {
  if (activeRunCancelRequested || activeRunId !== runId) {
    const error = new Error('Local transcription cancelled. Partial transcript was saved when available.')
    error.cancelled = true
    error.chunkIndex = state?.lastCompletedChunk || 0
    error.totalChunks = state?.totalChunks || 0
    throw error
  }
}

async function savePartialTranscript(project, transcript, textarea, shell, chunkIndex, totalChunks, glossary = []) {
  await saveAudioLabProject({ ...project, transcript, transcriptGlossary: glossary })
  if (textarea) textarea.value = transcript.text || ''
  setStatus(shell, `Saved local partial transcript after chunk ${chunkIndex}/${totalChunks}. Keep the tab open, because naturally browsers hate responsibility.`)
}

function appendTextPartFromResult(textParts, result = {}, chunkCues = [], glossary = []) {
  if (chunkCues.length) {
    const fromCues = chunkCues.map(cueText).filter(Boolean).join(' ')
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

async function runLocalTranscription(shell, button, textarea) {
  const projectForControls = await getActiveProject()
  ensureTranscriptQualityControls(shell, projectForControls)
  const runId = makeAudioLabId('local-transcribe')
  activeRunId = runId
  activeRunCancelRequested = false
  const language = shell.querySelector('#audio-lab-transcript-language')?.value || ''
  const quality = getSelectedQuality(shell)
  const project = projectForControls
  if (!project) throw new Error('No AudioLab project is open.')
  const source = chooseTranscriptionSource(project)
  if (!source) throw new Error('No rendered or source audio available to transcribe.')
  const glossary = getGlossaryTerms(shell, project)
  localStorage.setItem('audioLab.localTranscriptionQuality', quality)

  const state = {
    runId,
    project,
    shell,
    textarea,
    textParts: [],
    cues: [],
    language,
    glossary,
    quality,
    lastCompletedChunk: 0,
    totalChunks: 0,
  }
  activeRunState = state

  button.disabled = true
  button.textContent = 'Preparing local…'
  setCancelButtonState(shell, true, false)
  setStatus(shell, `Loading audio for local ${TRANSCRIPT_MODEL_OPTIONS[quality].label}. No OpenAI. No Cloudflare AI. Just your browser doing unpaid speech labor.`)

  try {
    assertNotCancelled(runId, state)
    const rawAudio = await resolveSourceBlob(project, source)
    assertNotCancelled(runId, state)
    setStatus(shell, `Decoding ${rawAudio.label || rawAudio.filename} (${formatBytes(rawAudio.blob.size)}) locally…`)
    await sleep(20)
    assertNotCancelled(runId, state)
    const decoded = await decodeBlob(rawAudio.blob)

    assertNotCancelled(runId, state)
    setStatus(shell, `Preparing ${formatDuration(decoded.duration || 0)} of mono 16 kHz audio for local Whisper…`)
    await sleep(20)
    const prepared = downmixAndResample(decoded, TARGET_SAMPLE_RATE)
    const chunks = makeLocalChunks(prepared, quality)
    state.totalChunks = chunks.length

    assertNotCancelled(runId, state)
    button.textContent = 'Loading model…'
    const transcriber = await getTranscriber(shell, language, quality)

    assertNotCancelled(runId, state)
    button.textContent = `Local 0/${chunks.length}`
    setStatus(shell, `Running ${TRANSCRIPT_MODEL_OPTIONS[quality].label} in ${chunks.length} browser chunks with ${LOCAL_CHUNK_OVERLAP_SECONDS}s overlap and glossary repair.`)
    await sleep(50)

    for (let index = 0; index < chunks.length; index += 1) {
      assertNotCancelled(runId, state)
      const chunk = chunks[index]
      button.textContent = `Local ${index + 1}/${chunks.length}`
      setStatus(shell, `Local chunk ${index + 1}/${chunks.length}: ${formatDuration(chunk.offset)}–${formatDuration(chunk.offset + chunk.duration)}. Model: ${TRANSCRIPT_MODEL_OPTIONS[quality].label}.`)
      await sleep(20)
      assertNotCancelled(runId, state)

      const result = await transcriber(chunk.samples, {
        sampling_rate: prepared.sampleRate,
        chunk_length_s: Math.min(TRANSCRIPT_MODEL_OPTIONS[quality].chunkSeconds, Math.max(5, chunk.duration)),
        stride_length_s: 0,
        return_timestamps: true,
        task: 'transcribe',
        language: language || undefined,
      })

      assertNotCancelled(runId, state)
      const chunkCues = normalizeChunks(result || {}, chunk.offset, chunk.overlap, glossary)
      state.cues.push(...chunkCues)
      appendTextPartFromResult(state.textParts, result || {}, chunkCues, glossary)
      state.lastCompletedChunk = index + 1

      const isSavePoint = (index + 1) % PARTIAL_SAVE_EVERY_CHUNKS === 0 || index === chunks.length - 1
      if (isSavePoint) {
        const partialTranscript = normalizeTranscriptForSave({ textParts: state.textParts, cues: state.cues, language, glossary, quality, partial: index !== chunks.length - 1 })
        await savePartialTranscript(project, partialTranscript, textarea, shell, index + 1, chunks.length, glossary)
      }
    }

    const nextTranscript = normalizeTranscriptForSave({ textParts: state.textParts, cues: state.cues, language, glossary, quality, partial: false })
    const saved = await saveAudioLabProject({ ...project, transcript: nextTranscript, transcriptGlossary: glossary })
    if (textarea) textarea.value = nextTranscript.text || ''
    setStatus(shell, `Local transcript saved with ${nextTranscript.cues.length} timestamped cues. Engine: ${TRANSCRIPT_MODEL_OPTIONS[quality].label}.`)
    toast(shell, `Local transcript saved for ${saved.title || 'AudioLab project'}.`)
    window.dispatchEvent(new Event('audiolab-task-navigation'))
  } catch (error) {
    if (error?.cancelled || activeRunCancelRequested) {
      await persistRunProgress(state, { cancelled: true, chunkIndex: state.lastCompletedChunk, totalChunks: state.totalChunks })
      toast(shell, 'Local transcription cancelled. Partial transcript saved when available.')
      return
    }
    throw error
  } finally {
    if (activeRunState?.runId === runId) activeRunState = null
    if (activeRunId === runId) activeRunId = ''
    activeRunCancelRequested = false
    setCancelButtonState(shell, false, false)
  }
}

function transcriptFromTextarea(project = {}, textarea = null, shell = null) {
  const glossary = getGlossaryTerms(shell, project)
  const current = project.transcript || {}
  const text = textarea?.value ?? current.text ?? ''
  const cues = Array.isArray(current.cues) ? current.cues.map((cue) => ({ ...cue, text: cleanupTranscriptText(cue.text, glossary) })) : []
  return {
    ...current,
    text: cleanupTranscriptText(text, glossary),
    cues,
    glossary,
    updatedAt: new Date().toISOString(),
  }
}

function srtTime(seconds = 0) {
  const value = Math.max(0, Number(seconds) || 0)
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const wholeSeconds = Math.floor(value % 60)
  const millis = Math.floor((value - Math.floor(value)) * 1000)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`
}

function vttTime(seconds = 0) {
  return srtTime(seconds).replace(',', '.')
}

function transcriptToSrt(transcript = {}) {
  const cues = Array.isArray(transcript.cues) ? transcript.cues : []
  return cues.map((cue, index) => [
    String(index + 1),
    `${srtTime(cue.start)} --> ${srtTime(cue.end || cue.start + 3)}`,
    cue.text,
  ].join('\n')).join('\n\n')
}

function transcriptToVtt(transcript = {}) {
  const cues = Array.isArray(transcript.cues) ? transcript.cues : []
  return `WEBVTT\n\n${cues.map((cue) => [
    `${vttTime(cue.start)} --> ${vttTime(cue.end || cue.start + 3)}`,
    cue.text,
  ].join('\n')).join('\n\n')}`
}

function transcriptToMarkdown(project = {}, transcript = {}) {
  const title = project.episode?.title || project.title || 'AudioLab transcript'
  const cues = Array.isArray(transcript.cues) ? transcript.cues : []
  const body = cues.length
    ? cues.map((cue) => `**${formatDuration(cue.start)}** ${cue.text}`).join('\n\n')
    : transcript.text || ''
  return `# ${title}\n\n${body}\n`
}

function downloadText(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1200)
}

async function cleanupAndSaveCurrentTranscript(shell, textarea) {
  const project = await getActiveProject()
  if (!project) throw new Error('No AudioLab project is open.')
  const glossary = getGlossaryTerms(shell, project)
  const current = transcriptFromTextarea(project, textarea, shell)
  const nextTranscript = {
    ...project.transcript,
    ...current,
    text: cleanupTranscriptText(current.text, glossary),
    cues: Array.isArray(current.cues) ? current.cues.map((cue) => ({ ...cue, text: cleanupTranscriptText(cue.text, glossary) })) : [],
    provider: current.provider || 'browser-local',
    engine: `${current.engine || 'local transcript'} + glossary cleanup`,
  }
  await saveAudioLabProject({ ...project, transcript: nextTranscript, transcriptGlossary: glossary })
  if (textarea) textarea.value = nextTranscript.text || ''
  setStatus(shell, `Cleaned transcript text and saved ${glossary.length} glossary terms.`)
  toast(shell, 'Transcript cleanup saved.')
}

async function exportTranscript(shell, textarea, format) {
  const project = await getActiveProject()
  if (!project) throw new Error('No AudioLab project is open.')
  const transcript = transcriptFromTextarea(project, textarea, shell)
  const slug = String(project.episode?.slug || project.title || 'audiolab-transcript').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'audiolab-transcript'
  if (format === 'srt') return downloadText(`${slug}.srt`, transcriptToSrt(transcript), 'application/x-subrip')
  if (format === 'vtt') return downloadText(`${slug}.vtt`, transcriptToVtt(transcript), 'text/vtt')
  if (format === 'md') return downloadText(`${slug}.md`, transcriptToMarkdown(project, transcript), 'text/markdown')
  return downloadText(`${slug}.txt`, transcript.text || '', 'text/plain')
}

function ensureTranscriptQualityControls(shell, project = {}) {
  if (!shell || shell.dataset.localTranscriptionEnhanced === 'true') return
  const button = shell.querySelector('#audio-lab-transcribe-run')
  const status = shell.querySelector('#audio-lab-transcript-status')
  const textarea = shell.querySelector('#audio-lab-transcript-text')
  const card = shell.querySelector('.audio-lab-auto-transcribe-card')
  if (!button || !status || !card) return
  shell.dataset.localTranscriptionEnhanced = 'true'

  const savedQuality = localStorage.getItem('audioLab.localTranscriptionQuality') || project.transcript?.quality || 'fast'
  const glossaryValue = (Array.isArray(project.transcriptGlossary) && project.transcriptGlossary.length ? project.transcriptGlossary : DEFAULT_GLOSSARY_TERMS).join('\n')
  const panel = document.createElement('div')
  panel.className = 'audio-lab-local-transcript-quality'
  panel.innerHTML = `
    <label class="audio-lab-task-field">
      <span>Local model quality</span>
      <select id="audio-lab-local-model-quality">
        ${Object.entries(TRANSCRIPT_MODEL_OPTIONS).map(([value, option]) => `<option value="${escapeHtml(value)}"${value === savedQuality ? ' selected' : ''}>${escapeHtml(option.label)} — ${escapeHtml(option.note)}</option>`).join('')}
      </select>
    </label>
    <label class="audio-lab-task-field">
      <span>Transcript glossary / expected words</span>
      <textarea id="audio-lab-transcript-glossary" rows="7" placeholder="One expected name, title, URL, place, or phrase per line.">${escapeHtml(glossaryValue)}</textarea>
    </label>
    <div class="audio-lab-task-inline-actions audio-lab-local-transcript-actions">
      <button type="button" class="button" id="audio-lab-transcript-clean-local">Clean up transcript</button>
      <button type="button" class="button" id="audio-lab-transcript-cancel-local" hidden disabled>Cancel transcription</button>
      <button type="button" class="button" data-audio-lab-export="txt">Export TXT</button>
      <button type="button" class="button" data-audio-lab-export="md">Export MD</button>
      <button type="button" class="button" data-audio-lab-export="srt">Export SRT</button>
      <button type="button" class="button" data-audio-lab-export="vtt">Export VTT</button>
    </div>
    <p class="description">Glossary terms are used after each local Whisper chunk to repair names, project titles, podcast names, and common machine-hearing garbage. Cancel stops before the next chunk and saves partial progress when available.</p>
  `
  card.insertBefore(panel, button)

  const modelSelect = panel.querySelector('#audio-lab-local-model-quality')
  modelSelect?.addEventListener('change', () => localStorage.setItem('audioLab.localTranscriptionQuality', modelSelect.value))
  panel.querySelector('#audio-lab-transcript-clean-local')?.addEventListener('click', () => {
    cleanupAndSaveCurrentTranscript(shell, textarea).catch((error) => {
      setStatus(shell, error.message || 'Transcript cleanup failed.')
      toast(shell, error.message || 'Transcript cleanup failed.')
    })
  })
  panel.querySelector('#audio-lab-transcript-cancel-local')?.addEventListener('click', () => requestCancelLocalTranscription(shell))
  panel.querySelectorAll('[data-audio-lab-export]').forEach((exportButton) => {
    exportButton.addEventListener('click', () => {
      exportTranscript(shell, textarea, exportButton.dataset.audioLabExport).catch((error) => {
        setStatus(shell, error.message || 'Transcript export failed.')
        toast(shell, error.message || 'Transcript export failed.')
      })
    })
  })
}

async function enhanceOpenTranscriptShell() {
  if (!isAudioLabRoute()) return
  const shell = document.querySelector('.audio-lab-task-shell')
  if (!shell || !shell.querySelector('#audio-lab-transcribe-run')) return
  ensureTranscriptQualityControls(shell, await getActiveProject())
}

function handleTranscribeClick(event) {
  if (!isAudioLabRoute()) return
  const button = event.target?.closest?.('#audio-lab-transcribe-run')
  if (!button) return
  const shell = button.closest('.audio-lab-task-shell')
  if (!shell) return
  const textarea = shell.querySelector('#audio-lab-transcript-text')

  event.preventDefault()
  event.stopPropagation()
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()

  runLocalTranscription(shell, button, textarea).catch((error) => {
    if (error?.cancelled) {
      setStatus(shell, 'Local transcription cancelled. Partial transcript saved when available.')
      toast(shell, 'Local transcription cancelled.')
      return
    }
    setStatus(shell, error.message || 'Local automatic transcription failed.')
    toast(shell, error.message || 'Local automatic transcription failed.')
  }).finally(() => {
    button.disabled = false
    button.textContent = 'Auto transcribe audio'
    setCancelButtonState(shell, false, false)
  })
}

window.addEventListener('click', handleTranscribeClick, true)
window.addEventListener('load', () => window.setTimeout(enhanceOpenTranscriptShell, 80))
window.addEventListener('popstate', () => window.setTimeout(enhanceOpenTranscriptShell, 80))
window.addEventListener('audiolab:navigation', () => window.setTimeout(enhanceOpenTranscriptShell, 80))
window.addEventListener('audiolab-task-navigation', () => window.setTimeout(enhanceOpenTranscriptShell, 80))
window.setTimeout(enhanceOpenTranscriptShell, 250)
