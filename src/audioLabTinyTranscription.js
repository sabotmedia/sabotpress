import {
  getAudioLabAsset,
  getAudioLabProject,
  listAudioLabProjects,
  makeAudioLabId,
  saveAudioLabProject,
} from './lib/audioLabStore'

const TARGET_SAMPLE_RATE = 16000
const TINY_CHUNK_DATA_BYTES = 1024 * 192
const TRANSCRIBE_RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504])
const preparedCache = new Map()

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

function setStatus(shell, message) {
  const status = shell?.querySelector?.('#audio-lab-transcript-status')
  if (status) status.textContent = cleanErrorText(message)
}

function toast(shell, message) {
  let note = shell?.querySelector?.('.audio-lab-task-toast')
  if (!note && shell) {
    note = document.createElement('div')
    note.className = 'audio-lab-task-toast'
    shell.appendChild(note)
  }
  if (!note) return
  note.textContent = cleanErrorText(message)
  note.classList.add('is-visible')
  window.clearTimeout(toast.timer)
  toast.timer = window.setTimeout(() => note.classList.remove('is-visible'), 1800)
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

function stripHtml(value = '') {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanErrorText(value = '') {
  const text = String(value || '')
  if (!text) return ''
  if (/<!doctype html|<html[\s>]/i.test(text)) {
    const plain = stripHtml(text)
    if (/1102|exceeded resource limits/i.test(plain)) return 'Cloudflare Worker exceeded resource limits on that chunk. AudioLab is now using tiny base64-safe chunks after this deploy.'
    return plain.slice(0, 360) || 'Cloudflare returned an HTML error page instead of JSON.'
  }
  return text.length > 520 ? `${text.slice(0, 520)}…` : text
}

async function postTranscription(form, { label = 'audio', retries = 3 } = {}) {
  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch('/api/audiolab/transcribe', { method: 'POST', body: form })
    const contentType = response.headers.get('content-type') || ''
    const text = await response.text()
    let data = null
    const htmlError = /html/i.test(contentType) || /<!doctype html|<html[\s>]/i.test(text)

    if (htmlError) data = { error: cleanErrorText(text) || `Transcription failed: ${response.status}` }
    else {
      try { data = text ? JSON.parse(text) : {} } catch { data = { error: cleanErrorText(text) } }
    }

    if (response.ok && data?.ok) return data.transcript || {}

    const message = cleanErrorText(data?.error || `Transcription failed: ${response.status}`)
    lastError = new Error(`${label}: ${message}`)
    lastError.status = response.status
    lastError.body = data

    if (!TRANSCRIBE_RETRY_STATUSES.has(response.status) || attempt >= retries) break
    await sleep(1600 * (attempt + 1))
  }

  throw lastError || new Error(`${label}: transcription failed`)
}

function makeBaseForm(project, language = '') {
  const form = new FormData()
  form.set('projectId', project.id)
  form.set('title', project.episode?.title || project.title || 'AudioLab episode')
  if (language) form.set('language', language)
  return form
}

async function getAudioContext() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextCtor) throw new Error('This browser cannot prepare audio for transcription.')
  return new AudioContextCtor()
}

async function decodeBlob(blob) {
  const context = await getAudioContext()
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
  const output = new Float32Array(length)
  const channels = Math.max(1, buffer.numberOfChannels || 1)
  const ratio = sourceRate / targetRate

  for (let index = 0; index < length; index += 1) {
    const sourcePosition = index * ratio
    let mixed = 0
    for (let channel = 0; channel < channels; channel += 1) mixed += sampleChannel(buffer, channel, sourcePosition)
    output[index] = Math.max(-1, Math.min(1, mixed / channels))
  }

  return { samples: output, sampleRate: targetRate, duration }
}

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
}

function readAscii(view, offset, length) {
  let value = ''
  for (let index = 0; index < length; index += 1) value += String.fromCharCode(view.getUint8(offset + index))
  return value
}

function encodeMonoWav({ samples, sampleRate }) {
  const bitDepth = 16
  const bytesPerSample = bitDepth / 8
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, bitDepth, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] || 0))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }

  return new Blob([view], { type: 'audio/wav' })
}

async function prepareTinyTranscriptionBlob(shell, audio) {
  const cacheKey = `${audio.cacheKey || audio.filename || 'audio'}:${audio.blob.size}:${audio.blob.lastModified || ''}:tiny-base64-safe-v1`
  if (preparedCache.has(cacheKey)) return preparedCache.get(cacheKey)

  setStatus(shell, `Preparing tiny mono transcript copy from ${formatBytes(audio.blob.size)} audio…`)
  const decoded = await decodeBlob(audio.blob)
  setStatus(shell, `Downmixing ${Math.round(decoded.duration || 0)}s to 16 kHz mono before chunking…`)
  const prepared = encodeMonoWav(downmixAndResample(decoded, TARGET_SAMPLE_RATE))
  const filename = `${String(audio.filename || 'interview').replace(/\.[^.]+$/, '')}-transcript-mono-16k.wav`
  const next = {
    ...audio,
    blob: prepared,
    filename,
    mimeType: 'audio/wav',
    prepared: true,
    originalSize: audio.blob.size,
  }
  preparedCache.set(cacheKey, next)
  setStatus(shell, `Prepared transcription copy: ${formatBytes(audio.blob.size)} → ${formatBytes(prepared.size)}.`)
  return next
}

function parseWav(arrayBuffer) {
  const view = new DataView(arrayBuffer)
  if (arrayBuffer.byteLength < 44) throw new Error('Prepared WAV file is too small to split.')
  if (readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') throw new Error('Prepared audio is not a standard WAV file.')

  let offset = 12
  let fmt = null
  let data = null
  while (offset + 8 <= arrayBuffer.byteLength) {
    const id = readAscii(view, offset, 4)
    const size = view.getUint32(offset + 4, true)
    const dataOffset = offset + 8
    if (dataOffset + size > arrayBuffer.byteLength) break
    if (id === 'fmt ') fmt = { offset: dataOffset, size }
    if (id === 'data') {
      data = { offset: dataOffset, size }
      break
    }
    offset = dataOffset + size + (size % 2)
  }
  if (!fmt || !data) throw new Error('Prepared WAV is missing fmt or data chunks.')
  const byteRate = view.getUint32(fmt.offset + 8, true)
  const blockAlign = view.getUint16(fmt.offset + 12, true)
  if (!byteRate || !blockAlign) throw new Error('Prepared WAV has invalid timing metadata.')
  return { arrayBuffer, fmt, data, byteRate, blockAlign }
}

function buildWavChunk(source, dataStart, dataLength) {
  const fmtBytes = new Uint8Array(source.arrayBuffer, source.fmt.offset, source.fmt.size)
  const dataBytes = new Uint8Array(source.arrayBuffer, dataStart, dataLength)
  const totalSize = 12 + 8 + fmtBytes.byteLength + 8 + dataBytes.byteLength
  const out = new ArrayBuffer(totalSize)
  const bytes = new Uint8Array(out)
  const view = new DataView(out)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, totalSize - 8, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, fmtBytes.byteLength, true)
  bytes.set(fmtBytes, 20)
  const dataHeader = 20 + fmtBytes.byteLength
  writeAscii(view, dataHeader, 'data')
  view.setUint32(dataHeader + 4, dataBytes.byteLength, true)
  bytes.set(dataBytes, dataHeader + 8)

  return new Blob([out], { type: 'audio/wav' })
}

async function splitPreparedWav(blob, maxDataBytes = TINY_CHUNK_DATA_BYTES) {
  const source = parseWav(await blob.arrayBuffer())
  const alignedMax = Math.max(source.blockAlign, Math.floor(maxDataBytes / source.blockAlign) * source.blockAlign)
  const chunks = []
  let consumed = 0

  while (consumed < source.data.size) {
    const remaining = source.data.size - consumed
    const size = Math.min(remaining, alignedMax)
    const alignedSize = remaining <= alignedMax ? remaining : Math.floor(size / source.blockAlign) * source.blockAlign
    const dataStart = source.data.offset + consumed
    const dataLength = Math.max(source.blockAlign, alignedSize)
    chunks.push({
      blob: buildWavChunk(source, dataStart, dataLength),
      offset: consumed / source.byteRate,
      duration: dataLength / source.byteRate,
    })
    consumed += dataLength
  }

  return chunks
}

async function resolveSourceBlob(project, source) {
  if (source.type === 'asset') {
    const stored = await getAudioLabAsset(source.id)
    if (!stored?.blob) throw new Error('Audio blob is missing locally. Render or re-import the audio first.')
    return {
      blob: stored.blob,
      filename: stored.filename || 'audiolab-audio',
      mimeType: stored.mimeType || stored.blob.type || 'audio/wav',
      cacheKey: `${project.id}:${source.id}`,
    }
  }

  if (source.type === 'url') {
    const response = await fetch(source.url)
    if (!response.ok) throw new Error(`Unable to fetch public audio for transcription: ${response.status}`)
    const blob = await response.blob()
    const url = new URL(source.url, window.location.origin)
    return {
      blob,
      filename: url.searchParams.get('filename') || 'audiolab-public-audio',
      mimeType: response.headers.get('content-type') || blob.type || 'audio/wav',
      cacheKey: source.url,
    }
  }

  throw new Error('No audio source available to transcribe.')
}

async function transcribeBlob({ project, blob, filename, mimeType, language, label }) {
  const form = makeBaseForm(project, language)
  form.set('filename', filename || 'audiolab-audio.wav')
  form.set('mimeType', mimeType || blob.type || 'audio/wav')
  form.set('file', blob, filename || 'audiolab-audio.wav')
  return postTranscription(form, { label, retries: 3 })
}

function normalizeTranscriptForSave(transcript = {}) {
  const cues = Array.isArray(transcript.cues) ? transcript.cues.map((cue) => ({
    id: String(cue.id || makeAudioLabId('cue')),
    start: Math.max(0, Number(cue.start || 0)),
    end: Math.max(0, Number(cue.end || cue.start || 0)),
    speaker: String(cue.speaker || ''),
    text: String(cue.text || ''),
  })).filter((cue) => cue.text.trim()) : []

  return {
    mode: cues.length ? 'timestamped' : 'plain',
    text: String(transcript.text || cues.map((cue) => cue.text).join(' ') || ''),
    cues,
    updatedAt: new Date().toISOString(),
    generatedAt: String(transcript.generatedAt || new Date().toISOString()),
    language: String(transcript.language || ''),
    provider: String(transcript.provider || ''),
    engine: String(transcript.engine || ''),
  }
}

function mergeTranscriptParts(parts = []) {
  const text = parts.map((part) => String(part.text || '').trim()).filter(Boolean).join('\n\n')
  const cues = []
  for (const part of parts) {
    const offset = Number(part.offset || 0)
    for (const cue of Array.isArray(part.cues) ? part.cues : []) {
      cues.push({
        id: makeAudioLabId('cue'),
        start: Math.max(0, Number(cue.start || 0) + offset),
        end: Math.max(0, Number(cue.end || cue.start || 0) + offset),
        speaker: String(cue.speaker || ''),
        text: String(cue.text || ''),
      })
    }
  }
  return {
    mode: cues.length ? 'timestamped' : 'plain',
    text,
    cues,
    language: parts.find((part) => part.language)?.language || '',
    provider: parts.find((part) => part.provider)?.provider || 'cloudflare-workers-ai',
    engine: parts.find((part) => part.engine)?.engine || 'tiny-base64-safe-chunked-transcription',
    generatedAt: new Date().toISOString(),
  }
}

async function transcribeTinyChunks({ shell, project, audio, language }) {
  const chunks = await splitPreparedWav(audio.blob)
  const parts = []
  setStatus(shell, `Prepared audio is ${formatBytes(audio.blob.size)}. Splitting into ${chunks.length} tiny base64-safe chunks…`)

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    const label = `Tiny chunk ${index + 1}/${chunks.length}`
    setStatus(shell, `${label}: ${formatBytes(chunk.blob.size)} covering ${Math.round(chunk.duration)}s from ${Math.round(chunk.offset)}s…`)
    const transcript = await transcribeBlob({
      project,
      blob: chunk.blob,
      filename: `${String(audio.filename || 'audiolab-transcript').replace(/\.wav$/i, '')}-tiny-${String(index + 1).padStart(4, '0')}.wav`,
      mimeType: 'audio/wav',
      language,
      label,
    })
    parts.push({ ...transcript, offset: chunk.offset })
  }

  return mergeTranscriptParts(parts)
}

async function runTinyTranscription(shell, button, textarea) {
  const language = shell.querySelector('#audio-lab-transcript-language')?.value || ''
  const project = await getActiveProject()
  if (!project) throw new Error('No AudioLab project is open.')
  const source = chooseTranscriptionSource(project)
  if (!source) throw new Error('No rendered or source audio available to transcribe.')

  button.disabled = true
  button.textContent = 'Preparing…'
  setStatus(shell, 'Loading audio for tiny chunk transcription…')

  const rawAudio = await resolveSourceBlob(project, source)
  const audio = await prepareTinyTranscriptionBlob(shell, rawAudio)

  button.textContent = 'Transcribing…'
  const transcript = await transcribeTinyChunks({ shell, project, audio, language })

  const nextTranscript = normalizeTranscriptForSave(transcript || {})
  const saved = await saveAudioLabProject({ ...project, transcript: nextTranscript })
  if (textarea) textarea.value = nextTranscript.text || ''
  setStatus(shell, `Transcript created with ${nextTranscript.cues.length} timestamped cues. Tiny chunk saveback complete.`)
  toast(shell, `Auto transcript saved for ${saved.title || 'AudioLab project'}.`)
  window.dispatchEvent(new Event('audiolab-task-navigation'))
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

  runTinyTranscription(shell, button, textarea).catch((error) => {
    setStatus(shell, error.message || 'Automatic transcription failed.')
    toast(shell, error.message || 'Automatic transcription failed.')
  }).finally(() => {
    button.disabled = false
    button.textContent = 'Auto transcribe audio'
  })
}

window.addEventListener('click', handleTranscribeClick, true)
