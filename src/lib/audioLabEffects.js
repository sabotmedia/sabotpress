export const AUDIO_EFFECT_TYPES = [
  'amplify',
  'normalize',
  'fade-in',
  'fade-out',
  'compressor',
  'limiter',
  'high-pass',
  'low-pass',
  'noise-gate',
]

export const AUDIO_EFFECT_SCOPES = ['master', 'track', 'clip', 'selection']

export const AUDIO_EFFECT_LABELS = {
  amplify: 'Amplify',
  normalize: 'Normalize',
  'fade-in': 'Fade In',
  'fade-out': 'Fade Out',
  compressor: 'Compressor',
  limiter: 'Limiter',
  'high-pass': 'High-pass Filter',
  'low-pass': 'Low-pass Filter',
  'noise-gate': 'Noise Gate',
}

export const AUDIO_EFFECT_PRESETS = [
  {
    id: 'voice-cleanup',
    label: 'Voice cleanup',
    effects: [
      { type: 'high-pass', scope: 'master', params: { frequencyHz: 80 } },
      { type: 'compressor', scope: 'master', params: { thresholdDb: -18, ratio: 3, attackMs: 10, releaseMs: 120, makeupGainDb: 0 } },
      { type: 'limiter', scope: 'master', params: { ceilingDb: -1 } },
    ],
  },
  {
    id: 'loudness-safety',
    label: 'Loudness safety',
    effects: [
      { type: 'normalize', scope: 'master', params: { targetDb: -1 } },
      { type: 'limiter', scope: 'master', params: { ceilingDb: -1 } },
    ],
  },
  {
    id: 'phone-interview-repair',
    label: 'Phone/interview repair',
    effects: [
      { type: 'high-pass', scope: 'master', params: { frequencyHz: 100 } },
      { type: 'low-pass', scope: 'master', params: { frequencyHz: 9000 } },
      { type: 'compressor', scope: 'master', params: { thresholdDb: -18, ratio: 2.5, attackMs: 10, releaseMs: 140, makeupGainDb: 0 } },
    ],
  },
]

export function dbToGain(db = 0) {
  return Math.pow(10, Number(db || 0) / 20)
}

export function gainToDb(gain = 1) {
  return 20 * Math.log10(Math.max(0.000001, Number(gain || 0)))
}

export function getAudioEffectLabel(type = '') {
  return AUDIO_EFFECT_LABELS[String(type || '')] || 'Effect'
}

export function getDefaultEffectParams(type = '') {
  switch (String(type || '')) {
    case 'amplify':
      return { gainDb: 3 }
    case 'normalize':
      return { targetDb: -1 }
    case 'fade-in':
    case 'fade-out':
      return { curve: 'linear' }
    case 'compressor':
      return { thresholdDb: -18, ratio: 3, attackMs: 10, releaseMs: 120, makeupGainDb: 0 }
    case 'limiter':
      return { ceilingDb: -1 }
    case 'high-pass':
      return { frequencyHz: 80 }
    case 'low-pass':
      return { frequencyHz: 12000 }
    case 'noise-gate':
      return { thresholdDb: -45, reductionDb: -60, attackMs: 5, releaseMs: 100 }
    default:
      return {}
  }
}

export function makeAudioEffectOperation(fields = {}) {
  const type = AUDIO_EFFECT_TYPES.includes(String(fields.type || '')) ? String(fields.type) : 'normalize'
  const scope = AUDIO_EFFECT_SCOPES.includes(String(fields.scope || '')) ? String(fields.scope) : 'master'

  return {
    id: fields.id || `effect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    scope,
    trackId: String(fields.trackId || ''),
    clipId: String(fields.clipId || ''),
    assetId: String(fields.assetId || ''),
    start: Math.max(0, Number(fields.start || 0)),
    end: Math.max(0, Number(fields.end || 0)),
    params: { ...getDefaultEffectParams(type), ...(fields.params || {}) },
    enabled: fields.enabled !== false,
    createdAt: fields.createdAt || new Date().toISOString(),
  }
}

export function normalizeAudioEffect(effect = {}) {
  if (!effect || typeof effect !== 'object') return null
  if (!AUDIO_EFFECT_TYPES.includes(String(effect.type || ''))) return null
  return makeAudioEffectOperation(effect)
}

export function normalizeAudioEffects(effects = []) {
  return Array.isArray(effects) ? effects.map(normalizeAudioEffect).filter(Boolean) : []
}

function createBuffer(numberOfChannels, length, sampleRate) {
  const channels = Math.max(1, Number(numberOfChannels) || 1)
  const safeLength = Math.max(1, Math.floor(Number(length) || 1))
  const rate = Math.max(8000, Number(sampleRate) || 44100)

  if (typeof AudioBuffer !== 'undefined') {
    return new AudioBuffer({ numberOfChannels: channels, length: safeLength, sampleRate: rate })
  }

  const OfflineAudioContextCtor = typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext)
  if (!OfflineAudioContextCtor) throw new Error('This browser cannot create rendered audio buffers')
  const context = new OfflineAudioContextCtor(channels, safeLength, rate)
  return context.createBuffer(channels, safeLength, rate)
}

export function cloneAudioBuffer(sourceBuffer) {
  const next = createBuffer(sourceBuffer.numberOfChannels, sourceBuffer.length, sourceBuffer.sampleRate)
  for (let channel = 0; channel < sourceBuffer.numberOfChannels; channel += 1) {
    next.getChannelData(channel).set(sourceBuffer.getChannelData(channel))
  }
  return next
}

function getFrameRange(buffer, effect = {}) {
  const duration = buffer.duration || 0
  const hasRange = Number(effect.end || 0) > Number(effect.start || 0)
  const start = hasRange ? Math.max(0, Math.min(duration, Number(effect.start || 0))) : 0
  const end = hasRange ? Math.max(start, Math.min(duration, Number(effect.end || duration))) : duration
  return {
    startFrame: Math.max(0, Math.floor(start * buffer.sampleRate)),
    endFrame: Math.min(buffer.length, Math.ceil(end * buffer.sampleRate)),
  }
}

function eachSample(buffer, effect, callback) {
  const { startFrame, endFrame } = getFrameRange(buffer, effect)
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let frame = startFrame; frame < endFrame; frame += 1) {
      data[frame] = callback(data[frame] || 0, frame - startFrame, endFrame - startFrame, channel, data)
    }
  }
}

function getPeak(buffer, effect) {
  const { startFrame, endFrame } = getFrameRange(buffer, effect)
  let peak = 0
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let frame = startFrame; frame < endFrame; frame += 1) {
      peak = Math.max(peak, Math.abs(data[frame] || 0))
    }
  }
  return peak
}

function applyAmplify(buffer, effect) {
  const gain = dbToGain(effect.params?.gainDb ?? 0)
  eachSample(buffer, effect, (sample) => Math.max(-1, Math.min(1, sample * gain)))
}

function applyNormalize(buffer, effect) {
  const peak = getPeak(buffer, effect)
  if (peak <= 0) return
  const target = dbToGain(effect.params?.targetDb ?? -1)
  const gain = target / peak
  eachSample(buffer, effect, (sample) => Math.max(-1, Math.min(1, sample * gain)))
}

function applyFade(buffer, effect, direction) {
  eachSample(buffer, effect, (sample, offset, count) => {
    const pct = count <= 1 ? 1 : offset / Math.max(1, count - 1)
    const ramp = direction === 'in' ? pct : 1 - pct
    return sample * Math.max(0, Math.min(1, ramp))
  })
}

function applyCompressor(buffer, effect) {
  const thresholdDb = Number(effect.params?.thresholdDb ?? -18)
  const ratio = Math.max(1, Number(effect.params?.ratio ?? 3))
  const makeup = dbToGain(effect.params?.makeupGainDb ?? 0)
  eachSample(buffer, effect, (sample) => {
    const abs = Math.abs(sample)
    if (abs <= 0) return 0
    const db = gainToDb(abs)
    let nextDb = db
    if (db > thresholdDb) nextDb = thresholdDb + ((db - thresholdDb) / ratio)
    const nextAbs = dbToGain(nextDb) * makeup
    return Math.max(-1, Math.min(1, Math.sign(sample) * nextAbs))
  })
}

function applyLimiter(buffer, effect) {
  const ceiling = dbToGain(effect.params?.ceilingDb ?? -1)
  eachSample(buffer, effect, (sample) => Math.max(-ceiling, Math.min(ceiling, sample)))
}

function applyLowPass(buffer, effect) {
  const frequency = Math.max(20, Number(effect.params?.frequencyHz ?? 12000))
  const dt = 1 / buffer.sampleRate
  const rc = 1 / (2 * Math.PI * frequency)
  const alpha = dt / (rc + dt)
  const { startFrame, endFrame } = getFrameRange(buffer, effect)

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    let y = data[startFrame] || 0
    for (let frame = startFrame; frame < endFrame; frame += 1) {
      y += alpha * ((data[frame] || 0) - y)
      data[frame] = y
    }
  }
}

function applyHighPass(buffer, effect) {
  const frequency = Math.max(20, Number(effect.params?.frequencyHz ?? 80))
  const dt = 1 / buffer.sampleRate
  const rc = 1 / (2 * Math.PI * frequency)
  const alpha = rc / (rc + dt)
  const { startFrame, endFrame } = getFrameRange(buffer, effect)

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    let y = 0
    let previous = data[startFrame] || 0
    for (let frame = startFrame; frame < endFrame; frame += 1) {
      const x = data[frame] || 0
      y = alpha * (y + x - previous)
      data[frame] = y
      previous = x
    }
  }
}

function applyNoiseGate(buffer, effect) {
  const threshold = dbToGain(effect.params?.thresholdDb ?? -45)
  const reduction = dbToGain(effect.params?.reductionDb ?? -60)
  eachSample(buffer, effect, (sample) => Math.abs(sample) < threshold ? sample * reduction : sample)
}

export function applyAudioEffect(buffer, effect = {}) {
  if (!buffer || effect.enabled === false) return buffer
  const type = String(effect.type || '')
  if (type === 'amplify') applyAmplify(buffer, effect)
  if (type === 'normalize') applyNormalize(buffer, effect)
  if (type === 'fade-in') applyFade(buffer, effect, 'in')
  if (type === 'fade-out') applyFade(buffer, effect, 'out')
  if (type === 'compressor') applyCompressor(buffer, effect)
  if (type === 'limiter') applyLimiter(buffer, effect)
  if (type === 'high-pass') applyHighPass(buffer, effect)
  if (type === 'low-pass') applyLowPass(buffer, effect)
  if (type === 'noise-gate') applyNoiseGate(buffer, effect)
  return buffer
}

export function applyAudioEffects(sourceBuffer, effects = []) {
  let current = cloneAudioBuffer(sourceBuffer)
  for (const effect of normalizeAudioEffects(effects).filter((item) => item.enabled !== false)) {
    current = applyAudioEffect(current, effect)
  }
  return current
}

export function filterEffects(effects = [], scope = '', details = {}) {
  return normalizeAudioEffects(effects)
    .filter((effect) => effect.enabled !== false)
    .filter((effect) => String(effect.scope || 'master') === String(scope || 'master'))
    .filter((effect) => !details.trackId || !effect.trackId || effect.trackId === details.trackId)
    .filter((effect) => !details.clipId || !effect.clipId || effect.clipId === details.clipId)
    .filter((effect) => !details.assetId || !effect.assetId || effect.assetId === details.assetId)
}
