import {
  getAudioLabAsset,
  getAudioLabProject,
  listAudioLabProjects,
  makeAudioLabId,
  saveAudioLabProject,
} from './lib/audioLabStore'

const LARGE_AUDIO_THRESHOLD_BYTES = 1024 * 1024 * 12
const WAV_CHUNK_DATA_BYTES = 1024 * 1024 * 4
const TRANSCRIBE_RETRY_STATUSES = new Set([429, 502, 503, 504])

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
  if (status) status.textContent = message
}

function toast(shell, message) {
  let note = shell?.querySelector?.('.audio-lab-task-toast')
  if (!note && shell) {
    note = document.createElement('div')
    note.className = 'audio-lab-task-toast'
    shell.appendChild(note)
  }
  if (!note) return
  note.textContent = message
  note.classList.add('is-visible')
  window.clearTimeout(toast.timer)
  toast.timer = window.setTimeout(() => note.classList.remove('is-visible'), 1800)
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function postTranscription(form, { label = 'audio', retries = 2 } = {}) {
  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch('/api/audiolab/transcribe', { method: 'POST', body: form })
    const text = await response.text()
    let data = null
    try { data = text ? JSON.parse(text) : {} } catch { data = { error: text } }

    if (response.ok && data?.ok) return data.transcript || {}

    const message = data?.error || `Transcription failed: ${response.status}`
    lastError = new Error(`${label}: ${message}`)
    lastError.status = response.status
    lastError.body = data

    if (!TRANSCRIBE_RETRY_STATUSES.has(response.status) || attempt >= retries) break
    await sleep(1400 * (attempt + 1))
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

function mergeTranscripts(parts = []) {
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
    engine: parts.find((part) => part.engine)?.engine || 'chunked-transcription',
    generatedAt: new Date().toISOString(),
  }
}

function readString(view, offset, length) {
  let value = ''
  for (let index = 0; index < length; index += 1) value += String.fromCharCode(view.getUint8(offset + index))
  return value
}

function writeString(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
}

function parseWav(arrayBuffer) {
  const view = new DataView(arrayBuffer)
  if (arrayBuffer.byteLength < 44) throw new Error('WAV file is too small to split safely.')
  if (readString(view, 0, 4) !== 'RIFF' || readString(view, 8, 4) !== 'WAVE') {
    throw new Error('Only standard RIFF/WAVE audio can be chunked locally right now.')
  }

  let offset = 12
  let fmt = null
  let data = null

  while (offset + 8 <= arrayBuffer.byteLength) {
    const id = readString(view, offset, 4)
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

  if (!fmt || !data) throw new Error('WAV file is missing fmt or data chunks.')
  const audioFormat = view.getUint16(fmt.offset, true)
  const byteRate = view.getUint32(fmt.offset + 8, true)
  const blockAlign = view.getUint16(fmt.offset + 12, true)
  if (!byteRate || !blockAlign) throw new Error('WAV file has invalid byte rate or block alignment.')
  if (![1, 3].includes(audioFormat)) throw new Error('Only PCM or float WAV files can be chunked locally right now.')

  return { arrayBuffer, fmt, data, byteRate, blockAlign }
}

function buildWavChunk(source, dataStart, dataLength) {
  const fmtBytes = new Uint8Array(source.arrayBuffer, source.fmt.offset, source.fmt.size)
  const dataBytes = new Uint8Array(source.arrayBuffer, dataStart, dataLength)
  const totalSize = 12 + 8 + fmtBytes.byteLength + 8 + dataBytes.byteLength
  const out = new ArrayBuffer(totalSize)
  const bytes = new Uint8Array(out)
  const view = new DataView(out)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, totalSize - 8, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, fmtBytes.byteLength, true)
  bytes.set(fmtBytes, 20)
  const dataHeader = 20 + fmtBytes.byteLength
  writeString(view, dataHeader, 'data')
  view.setUint32(dataHeader + 4, dataBytes.byteLength, true)
  bytes.set(dataBytes, dataHeader + 8)

  return new Blob([out], { type: 'audio/wav' })
}

function splitWav(arrayBuffer, maxDataBytes = WAV_CHUNK_DATA_BYTES) {
  const source = parseWav(arrayBuffer)
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

function isWavBlob(blob, filename = '') {
  const type = String(blob?.type || '').toLowerCase()
  const name = String(filename || '').toLowerCase()
  return type.includes('wav') || name.endsWith('.wav') || name.endsWith('.wave')
}

async function transcribeSingleBlob({ project, blob, filename, mimeType, language, label }) {
  const form = makeBaseForm(project, language)
  form.set('filename', filename || 'audiolab-audio')
  form.set('mimeType', mimeType || blob.type || 'audio/wav')
  form.set('file', blob, filename || 'audiolab-audio')
  return postTranscription(form, { label })
}

async function transcribeChunkedWav({ shell, project, blob, filename, language }) {
  setStatus(shell, 'Reading WAV headers and splitting interview into smaller transcription chunks…')
  const chunks = splitWav(await blob.arrayBuffer())
  const parts = []

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    const label = `Chunk ${index + 1}/${chunks.length}`
    setStatus(shell, `${label}: transcribing ${Math.round(chunk.duration)} seconds starting at ${Math.round(chunk.offset)}s…`)
    const transcript = await transcribeSingleBlob({
      project,
      blob: chunk.blob,
      filename: `${String(filename || 'interview').replace(/\.wav$/i, '')}-part-${String(index + 1).padStart(3, '0')}.wav`,
      mimeType: 'audio/wav',
      language,
      label,
    })
    parts.push({ ...transcript, offset: chunk.offset })
  }

  return mergeTranscripts(parts)
}

async function resolveSourceBlob(project, source) {
  if (source.type === 'asset') {
    const stored = await getAudioLabAsset(source.id)
    if (!stored?.blob) throw new Error('Audio blob is missing locally. Render or re-import the audio first.')
    return {
      blob: stored.blob,
      filename: stored.filename || 'audiolab-audio',
      mimeType: stored.mimeType || stored.blob.type || 'audio/wav',
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
    }
  }

  throw new Error('No audio source available to transcribe.')
}

async function runLongTranscription(shell, button, textarea) {
  const language = shell.querySelector('#audio-lab-transcript-language')?.value || ''
  const project = await getActiveProject()
  if (!project) throw new Error('No AudioLab project is open.')
  const source = chooseTranscriptionSource(project)
  if (!source) throw new Error('No rendered or source audio available to transcribe.')

  button.disabled = true
  button.textContent = 'Transcribing…'
  setStatus(shell, 'Preparing audio for transcription…')

  const audio = await resolveSourceBlob(project, source)
  const canChunk = isWavBlob(audio.blob, audio.filename)
  let transcript = null

  if (canChunk && audio.blob.size > LARGE_AUDIO_THRESHOLD_BYTES) {
    transcript = await transcribeChunkedWav({ shell, project, ...audio, language })
  } else {
    try {
      transcript = await transcribeSingleBlob({ project, ...audio, language, label: 'Audio' })
    } catch (error) {
      if (!canChunk || !TRANSCRIBE_RETRY_STATUSES.has(Number(error.status || 0))) throw error
      setStatus(shell, 'Single-pass transcription failed. Falling back to WAV chunk transcription…')
      transcript = await transcribeChunkedWav({ shell, project, ...audio, language })
    }
  }

  const nextTranscript = normalizeTranscriptForSave(transcript || {})
  const saved = await saveAudioLabProject({ ...project, transcript: nextTranscript })
  if (textarea) textarea.value = nextTranscript.text || ''
  setStatus(shell, `Transcript created with ${nextTranscript.cues.length} timestamped cues. Chunked saveback complete.`)
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

  runLongTranscription(shell, button, textarea).catch((error) => {
    setStatus(shell, error.message || 'Automatic transcription failed.')
    toast(shell, error.message || 'Automatic transcription failed.')
  }).finally(() => {
    button.disabled = false
    button.textContent = 'Auto transcribe audio'
  })
}

window.addEventListener('click', handleTranscribeClick, true)
