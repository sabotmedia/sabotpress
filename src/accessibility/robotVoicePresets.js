export const ROBOT_VOICE_PRESETS = Object.freeze({
  clear: Object.freeze({
    id: 'clear',
    label: 'Clear Reader',
    description: 'Slow, smoother articulation for public read-aloud.',
    sampleRate: 24000,
    baseF0: 122,
    rateMs: 122,
    wordGapMs: 46,
    stressF0Lift: 7,
    stressDuration: 1.12,
    transitionMs: 38,
    aspiration: 0.008,
    effort: 0.47,
    tilt: 0.08,
    gain: 3.15,
  }),
  terminal: Object.freeze({
    id: 'terminal',
    label: 'Terminal',
    description: 'Dry early-computer voice with clearer consonants.',
    sampleRate: 24000,
    baseF0: 118,
    rateMs: 112,
    wordGapMs: 48,
    stressF0Lift: 8,
    stressDuration: 1.13,
    transitionMs: 32,
    aspiration: 0.014,
    effort: 0.52,
    tilt: 0.055,
    gain: 3.25,
  }),
  mainframe: Object.freeze({
    id: 'mainframe',
    label: 'Mainframe',
    description: 'Lower, slower machine voice for production use.',
    sampleRate: 24000,
    baseF0: 101,
    rateMs: 124,
    wordGapMs: 54,
    stressF0Lift: 6,
    stressDuration: 1.14,
    transitionMs: 37,
    aspiration: 0.011,
    effort: 0.49,
    tilt: 0.09,
    gain: 3.2,
  }),
  packet: Object.freeze({
    id: 'packet',
    label: 'Packet Radio',
    description: 'Sharper, faster retro radio-computer voice.',
    sampleRate: 24000,
    baseF0: 132,
    rateMs: 104,
    wordGapMs: 43,
    stressF0Lift: 8,
    stressDuration: 1.1,
    transitionMs: 27,
    aspiration: 0.021,
    effort: 0.58,
    tilt: 0.035,
    gain: 3.35,
  }),
})

export const DEFAULT_ROBOT_VOICE_PRESET = 'clear'

const LIMITS = Object.freeze({
  sampleRate: [16000, 48000],
  baseF0: [70, 220],
  rateMs: [70, 180],
  wordGapMs: [15, 120],
  stressF0Lift: [0, 30],
  stressDuration: [1, 1.5],
  transitionMs: [4, 70],
  aspiration: [0, 0.12],
  effort: [0.2, 1],
  tilt: [0, 0.25],
  gain: [1, 6],
})

function clamp(value, min, max, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export function getRobotVoicePreset(value = DEFAULT_ROBOT_VOICE_PRESET) {
  const key = String(value || '').trim().toLowerCase()
  return ROBOT_VOICE_PRESETS[key] || ROBOT_VOICE_PRESETS[DEFAULT_ROBOT_VOICE_PRESET]
}

export function normalizeRobotVoiceOptions(input = {}, fallbackPreset = DEFAULT_ROBOT_VOICE_PRESET) {
  const requestedPreset = String(input?.preset || input?.id || fallbackPreset || DEFAULT_ROBOT_VOICE_PRESET).trim().toLowerCase()
  const preset = getRobotVoicePreset(requestedPreset)
  const out = { ...preset, preset: ROBOT_VOICE_PRESETS[requestedPreset] ? requestedPreset : DEFAULT_ROBOT_VOICE_PRESET }

  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    out[key] = clamp(input?.[key], min, max, preset[key])
  }

  return out
}

export function robotVoiceConfigForStorage(input = {}) {
  const voice = normalizeRobotVoiceOptions(input)
  return {
    preset: voice.preset,
    baseF0: voice.baseF0,
    rateMs: voice.rateMs,
    wordGapMs: voice.wordGapMs,
    transitionMs: voice.transitionMs,
    aspiration: voice.aspiration,
    effort: voice.effort,
    tilt: voice.tilt,
    gain: voice.gain,
  }
}
