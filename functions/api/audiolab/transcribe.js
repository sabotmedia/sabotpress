import { resolvePublicSitePermission } from '../_lib/publicSiteAuth.js'

const MAX_TRANSCRIBE_BYTES = 1024 * 1024 * 16
const MAX_WORKERS_AI_BYTES = 1024 * 384
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/flac',
])

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      allow: 'GET,POST,OPTIONS',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  })
}

export async function onRequestGet(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permission.canEdit) {
      return json({ ok: false, error: permission.reason || 'valid session required', canEdit: false }, 403)
    }

    return json({
      ok: true,
      diagnostics: getProviderDiagnostics(context),
    })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

export async function onRequestPost(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permission.canEdit) {
      return json({ ok: false, error: permission.reason || 'valid session required', canEdit: false }, 403)
    }

    const openAiEnabled = paidOpenAiTranscriptionEnabled(context)
    const workersAiEnabled = workersAiTranscriptionEnabled(context)

    if (!openAiEnabled && !workersAiEnabled) {
      return json({
        ok: false,
        error: 'Server transcription is disabled by default. AudioLab now uses browser-local transcription so it does not call OpenAI or Cloudflare AI. Hard refresh /wp-admin/audiolab?task=transcript so the local transcription handler loads. To intentionally re-enable paid OpenAI transcription, set SABOT_ALLOW_OPENAI_TRANSCRIPTION=true.',
        diagnostics: getProviderDiagnostics(context),
      }, 409)
    }

    const form = await context.request.formData()
    const source = await resolveAudioSource(context, form)
    if (!source.bytes?.byteLength) return json({ ok: false, error: 'missing audio file or public audio URL' }, 400)
    if (source.bytes.byteLength > MAX_TRANSCRIBE_BYTES) {
      return json({
        ok: false,
        error: `audio file is too large for a single transcription request (${formatBytes(source.bytes.byteLength)}). Use browser-local transcription instead.`,
      }, 413)
    }

    const mimeType = normalizeAudioMimeType(form.get('mimeType') || source.mimeType || 'audio/wav')
    if (!ALLOWED_AUDIO_TYPES.has(mimeType)) return json({ ok: false, error: `unsupported audio MIME type: ${mimeType}` }, 415)

    const language = String(form.get('language') || context.env?.SABOT_TRANSCRIPTION_LANGUAGE || '').trim()
    const prompt = String(form.get('prompt') || context.env?.SABOT_TRANSCRIPTION_PROMPT || '').trim()
    const filename = sanitizeFilename(form.get('filename') || source.filename || `audiolab-transcription.${extensionForMime(mimeType)}`)

    const input = { bytes: source.bytes, mimeType, filename, language, prompt }
    const result = openAiEnabled
      ? await transcribeWithOpenAi(context, input)
      : await transcribeWithWorkersAi(context, input, getWorkersAiBinding(context))

    return json({
      ok: true,
      diagnostics: getProviderDiagnostics(context),
      transcript: normalizeTranscriptResult(result, { filename, mimeType, language }),
    })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error), diagnostics: getProviderDiagnostics(context) }, 500)
  }
}

async function resolveAudioSource(context, form) {
  const file = form.get('file') || form.get('audio')
  if (file && typeof file.arrayBuffer === 'function') {
    return {
      bytes: await file.arrayBuffer(),
      mimeType: file.type || form.get('mimeType') || 'audio/wav',
      filename: file.name || form.get('filename') || 'audiolab-audio',
    }
  }

  const mediaUrl = String(form.get('mediaUrl') || form.get('audioUrl') || '').trim()
  if (!mediaUrl) return { bytes: null, mimeType: '', filename: '' }
  const requestUrl = new URL(context.request.url)
  const targetUrl = new URL(mediaUrl, requestUrl.origin)
  if (targetUrl.origin !== requestUrl.origin) throw new Error('Only same-origin audio URLs can be transcribed by this endpoint')
  if (!targetUrl.pathname.startsWith('/api/audiolab/media')) throw new Error('Unsupported audio URL for transcription')

  const response = await fetch(targetUrl.toString())
  if (!response.ok) throw new Error(`Unable to fetch audio URL for transcription: ${response.status}`)
  return {
    bytes: await response.arrayBuffer(),
    mimeType: response.headers.get('content-type') || form.get('mimeType') || 'audio/wav',
    filename: targetUrl.searchParams.get('filename') || 'audiolab-audio',
  }
}

function truthyEnv(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

function paidOpenAiTranscriptionEnabled(context) {
  return Boolean(context.env?.OPENAI_API_KEY) && truthyEnv(context.env?.SABOT_ALLOW_OPENAI_TRANSCRIPTION)
}

function workersAiTranscriptionEnabled(context) {
  return Boolean(getWorkersAiBinding(context)?.run) && truthyEnv(context.env?.SABOT_ALLOW_WORKERS_AI_TRANSCRIPTION)
}

function getWorkersAiBinding(context) {
  return context?.env?.AI || null
}

function getProviderDiagnostics(context) {
  const env = context?.env || {}
  const envKeys = Object.keys(env).sort()
  const aiBinding = env.AI
  return {
    defaultMode: 'browser-local transcription',
    openAi: {
      hasKey: Boolean(env.OPENAI_API_KEY),
      enabled: paidOpenAiTranscriptionEnabled(context),
      enableWith: 'SABOT_ALLOW_OPENAI_TRANSCRIPTION=true',
      configuredModel: String(env.SABOT_OPENAI_TRANSCRIPTION_MODEL || env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe'),
    },
    workersAi: {
      hasAI: Boolean(aiBinding),
      hasRun: typeof aiBinding?.run === 'function',
      enabled: workersAiTranscriptionEnabled(context),
      enableWith: 'SABOT_ALLOW_WORKERS_AI_TRANSCRIPTION=true',
      bindingType: aiBinding ? Object.prototype.toString.call(aiBinding) : '',
      configuredModel: String(env.SABOT_TRANSCRIPTION_MODEL || '@cf/openai/whisper-large-v3-turbo'),
      maxSingleRequest: workersAiTranscriptionEnabled(context) ? formatBytes(MAX_WORKERS_AI_BYTES) : 'disabled by default',
    },
    environment: {
      exposedKeys: envKeys.filter((key) => /AI|OPENAI|TRANSCRIPTION|SABOT|CF/i.test(key)).slice(0, 60),
      hasSessionSecret: Boolean(env.SABOT_SESSION_SECRET),
      hasAdminToken: Boolean(env.SABOT_ADMIN_TOKEN),
    },
  }
}

async function transcribeWithWorkersAi(context, { bytes, language, prompt }, workersAi = getWorkersAiBinding(context)) {
  if (!workersAi?.run) throw new Error('Workers AI is not available in this deployment.')
  if (bytes.byteLength > MAX_WORKERS_AI_BYTES) throw new Error(`Workers AI transcription is opt-in and only allowed for tiny clips up to ${formatBytes(MAX_WORKERS_AI_BYTES)}.`)

  const model = String(context.env?.SABOT_TRANSCRIPTION_MODEL || '@cf/openai/whisper-large-v3-turbo')
  const payload = {
    task: 'transcribe',
    vad_filter: true,
    condition_on_previous_text: false,
    audio: arrayBufferToBase64(bytes),
  }
  if (language) payload.language = language
  if (prompt) payload.initial_prompt = prompt

  const result = await workersAi.run(model, payload)
  return {
    provider: 'cloudflare-workers-ai',
    engine: model,
    transport: 'base64-small-opt-in',
    raw: result,
    text: result?.text || result?.transcription || result?.transcription_info?.text || '',
    language: result?.language || result?.transcription_info?.language || language || '',
    segments: result?.segments || result?.chunks || result?.transcription_info?.segments || [],
    words: result?.words || [],
    vtt: result?.vtt || '',
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function transcribeWithOpenAi(context, { bytes, mimeType, filename, language, prompt }) {
  const model = String(context.env?.SABOT_OPENAI_TRANSCRIPTION_MODEL || context.env?.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe')
  const form = new FormData()
  form.set('model', model)
  form.set('file', new Blob([bytes], { type: mimeType }), filename)
  form.set('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'segment')
  if (language) form.set('language', language)
  if (prompt) form.set('prompt', prompt)

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${context.env.OPENAI_API_KEY}` },
    body: form,
  })

  const textBody = await response.text()
  let data = null
  try { data = JSON.parse(textBody) } catch { data = { text: textBody } }
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI transcription failed: ${response.status}`)
  return {
    provider: 'openai',
    engine: model,
    raw: data,
    text: data?.text || '',
    language: data?.language || language || '',
    segments: data?.segments || [],
    words: data?.words || [],
  }
}

function normalizeTranscriptResult(result = {}, fallback = {}) {
  const raw = result.raw && typeof result.raw === 'object' ? result.raw : {}
  const cues = normalizeCues(result.segments || raw.segments || raw.chunks || [])
  const text = String(result.text || raw.text || cues.map((cue) => cue.text).join(' ') || '').trim()
  return {
    mode: cues.length ? 'timestamped' : 'plain',
    text,
    cues,
    words: Array.isArray(result.words || raw.words) ? (result.words || raw.words).slice(0, 20000) : [],
    language: String(result.language || raw.language || fallback.language || ''),
    provider: String(result.provider || ''),
    engine: String(result.engine || ''),
    transport: String(result.transport || ''),
    filename: String(fallback.filename || ''),
    mimeType: String(fallback.mimeType || ''),
    generatedAt: new Date().toISOString(),
  }
}

function normalizeCues(segments) {
  if (!Array.isArray(segments)) return []
  return segments.map((segment, index) => {
    const start = Number(segment.start ?? segment.timestamp?.[0] ?? segment.from ?? 0)
    const end = Number(segment.end ?? segment.timestamp?.[1] ?? segment.to ?? start)
    const text = String(segment.text || segment.chunk || segment.sentence || '').trim()
    if (!text) return null
    return {
      id: `cue-${index + 1}`,
      start: Math.max(0, Number.isFinite(start) ? start : 0),
      end: Math.max(0, Number.isFinite(end) ? end : start),
      speaker: String(segment.speaker || ''),
      text,
    }
  }).filter(Boolean)
}

function normalizeAudioMimeType(value) {
  const type = String(value || '').split(';')[0].trim().toLowerCase()
  if (type === 'audio/x-wav' || type === 'audio/wave') return 'audio/wav'
  return type || 'audio/wav'
}

function sanitizeFilename(value) {
  const cleaned = String(value || 'audio.wav').split(/[\\/]/).pop().trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return (cleaned || 'audio.wav').slice(0, 160)
}

function extensionForMime(mimeType = '') {
  const lower = String(mimeType).toLowerCase()
  if (lower.includes('webm')) return 'webm'
  if (lower.includes('ogg')) return 'ogg'
  if (lower.includes('mpeg')) return 'mp3'
  if (lower.includes('mp4') || lower.includes('aac')) return 'm4a'
  if (lower.includes('flac')) return 'flac'
  return 'wav'
}

function formatBytes(value = 0) {
  const bytes = Math.max(0, Number(value) || 0)
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}
