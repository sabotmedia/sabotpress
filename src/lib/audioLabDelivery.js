export const AUDIO_LAB_DELIVERY_FORMATS = [
  { id: 'webm-opus', label: 'WebM / Opus', mimeType: 'audio/webm;codecs=opus', extension: 'webm', codec: 'opus', bitrateKbps: 128 },
  { id: 'webm', label: 'WebM audio', mimeType: 'audio/webm', extension: 'webm', codec: 'webm', bitrateKbps: 128 },
  { id: 'mp4', label: 'M4A / MP4 audio', mimeType: 'audio/mp4', extension: 'm4a', codec: 'aac', bitrateKbps: 128 },
]

export function isLocalAudioUrl(value = '') {
  return String(value || '').startsWith('audiolab-local://')
}

export function isPublicAudioUrl(value = '') {
  const url = String(value || '').trim()
  return /^https?:\/\//i.test(url) || url.startsWith('/api/') || url.startsWith('/media/')
}

export function getSupportedAudioDeliveryFormats() {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') return []
  return AUDIO_LAB_DELIVERY_FORMATS.filter((format) => {
    if (typeof window.MediaRecorder.isTypeSupported !== 'function') return format.mimeType === 'audio/webm'
    return window.MediaRecorder.isTypeSupported(format.mimeType)
  })
}

export function pickPreferredDeliveryFormat() {
  return getSupportedAudioDeliveryFormats()[0] || null
}

export function getAudioFileExtension(mimeType = '') {
  const value = String(mimeType || '').toLowerCase()
  if (value.includes('mp4') || value.includes('aac')) return 'm4a'
  if (value.includes('mpeg')) return 'mp3'
  if (value.includes('ogg')) return 'ogg'
  if (value.includes('wav')) return 'wav'
  return 'webm'
}

export function getDeliveryMedia(renderedEpisode = {}) {
  return renderedEpisode?.delivery?.publicUrl ? renderedEpisode.delivery : null
}

export function getMasterMedia(renderedEpisode = {}) {
  return renderedEpisode?.master?.publicUrl ? renderedEpisode.master : renderedEpisode?.master || null
}

export function getPreferredRenderedMedia(renderedEpisode = {}) {
  if (renderedEpisode?.delivery?.publicUrl) return renderedEpisode.delivery
  if (renderedEpisode?.master?.publicUrl) return renderedEpisode.master
  if (renderedEpisode?.publicUrl) return renderedEpisode
  return null
}

export function getPreferredPublicAudioUrl(renderedEpisode = {}) {
  const media = getPreferredRenderedMedia(renderedEpisode)
  const url = media?.publicUrl || renderedEpisode?.preferredPublicUrl || renderedEpisode?.publicUrl || renderedEpisode?.url || ''
  return isLocalAudioUrl(url) ? '' : String(url || '')
}

export async function encodeAudioBufferForDelivery(audioBuffer, format = pickPreferredDeliveryFormat()) {
  if (!audioBuffer) throw new Error('Render a WAV master before creating delivery audio.')
  if (!format?.mimeType) throw new Error('This browser does not expose a supported delivery audio encoder.')
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') throw new Error('MediaRecorder is not available in this browser.')

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextCtor) throw new Error('Web Audio is not available in this browser.')

  const context = new AudioContextCtor({ sampleRate: audioBuffer.sampleRate || 44100 })
  const destination = context.createMediaStreamDestination()
  const source = context.createBufferSource()
  source.buffer = audioBuffer
  source.connect(destination)

  const recorderOptions = { mimeType: format.mimeType }
  if (format.bitrateKbps) recorderOptions.audioBitsPerSecond = format.bitrateKbps * 1000

  const chunks = []
  const recorder = new window.MediaRecorder(destination.stream, recorderOptions)

  const done = new Promise((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data)
    }
    recorder.onerror = (event) => reject(event.error || new Error('Delivery audio encoding failed.'))
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || format.mimeType })
      if (!blob.size) reject(new Error('Delivery audio encoder produced an empty file.'))
      else resolve(blob)
    }
  })

  source.onended = () => {
    try {
      if (recorder.state !== 'inactive') recorder.stop()
    } catch {
      // ignored
    }
  }

  recorder.start(1000)
  source.start(0)
  const blob = await done

  try { source.disconnect() } catch { /* ignore */ }
  try { await context.close() } catch { /* ignore */ }

  return blob
}

export function buildFeedReadiness({ project, renderedEpisode, episode, transcriptText = '' } = {}) {
  const preferred = getPreferredRenderedMedia(renderedEpisode)
  const url = getPreferredPublicAudioUrl(renderedEpisode)
  const checks = [
    { id: 'title', label: 'Episode title', ok: Boolean(episode?.title || project?.title) },
    { id: 'slug', label: 'Episode slug', ok: Boolean(episode?.slug) },
    { id: 'description', label: 'Description/show notes', ok: Boolean(episode?.description) },
    { id: 'public-url', label: 'Public audio URL', ok: Boolean(url), critical: true },
    { id: 'mime-type', label: 'MIME type', ok: Boolean(preferred?.mimeType), critical: true },
    { id: 'file-size', label: 'File size', ok: Number(preferred?.size || 0) > 0, critical: true },
    { id: 'duration', label: 'Duration', ok: Number(preferred?.duration || renderedEpisode?.duration || 0) > 0 },
    { id: 'not-local', label: 'Not local-only audio', ok: !isLocalAudioUrl(renderedEpisode?.url || '') && !isLocalAudioUrl(url), critical: true },
    { id: 'delivery', label: 'Compressed delivery audio', ok: Boolean(renderedEpisode?.delivery?.publicUrl), warning: true },
    { id: 'transcript', label: 'Transcript present or intentionally blank', ok: Boolean(transcriptText) || true },
  ]
  const criticalMissing = checks.some((check) => check.critical && !check.ok)
  const warnings = checks.some((check) => !check.ok && !check.critical)
  return { status: criticalMissing ? 'not-ready' : warnings ? 'ready-with-warnings' : 'ready', checks }
}
