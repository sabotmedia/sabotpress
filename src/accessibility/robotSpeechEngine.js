import { textToSpeechTokens } from './englishG2p.js'
import { normalizeRobotVoiceOptions } from './robotVoicePresets.js'
import { KLATT_PHONEMES } from './vendor/klatt1980Bank.js'
import { renderToBuffer } from './vendor/klattschSynth.js'

function clamp(value, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return min
  return Math.min(max, Math.max(min, parsed))
}

function soundTarget(phone, F0, voice, glideTo = null) {
  const source = glideTo ? { ...phone, ...glideTo } : phone
  return {
    ...phone,
    ...(glideTo || {}),
    F0,
    F1: source.F1,
    F2: source.F2,
    F3: source.F3,
    BW1: source.BW1,
    BW2: source.BW2,
    BW3: source.BW3,
    gain: voice.gain,
    aspiration: voice.aspiration,
    effort: voice.effort,
    tilt: voice.tilt,
  }
}

function silenceTarget() {
  return { A1: 0, A2: 0, A3: 0, voicing: 0, aspiration: 0 }
}

export function buildRobotSchedule(text, speed = 1, voiceOptions = {}) {
  const voice = normalizeRobotVoiceOptions(voiceOptions)
  const speechSpeed = clamp(speed, 0.7, 1.7)
  const tokens = textToSpeechTokens(text)
  const schedule = [{ atMs: 0, target: silenceTarget(), transitionMs: 4 }]
  let timeMs = 18
  let phoneCount = 0

  const silence = (ms) => {
    schedule.push({ atMs: timeMs, target: silenceTarget(), transitionMs: Math.min(voice.transitionMs, 24) })
    timeMs += Math.max(0, ms)
  }

  for (const token of tokens) {
    if (token.type === 'pause') {
      silence(token.ms / Math.sqrt(speechSpeed))
      continue
    }

    for (const item of token.phones) {
      const phone = KLATT_PHONEMES[item.code]
      if (!phone) continue
      phoneCount += 1
      const duration = (voice.rateMs / speechSpeed) * (item.stressed ? voice.stressDuration : 1)
      const F0 = voice.baseF0 + (item.stressed ? voice.stressF0Lift : 0)

      if (phone.isStop) {
        // Keep stop consonants crisp, but shorten the dead closure compared with the
        // first reader preset. Long closures were a major source of the "rough" sound.
        const quiet = duration * 0.48
        silence(quiet)
        schedule.push({ atMs: timeMs, target: soundTarget(phone, F0, voice), transitionMs: 4 })
        timeMs += duration - quiet
        continue
      }

      schedule.push({
        atMs: timeMs,
        target: soundTarget(phone, F0, voice),
        transitionMs: Math.min(voice.transitionMs, duration * 0.42),
      })

      if (phone.glideTo) {
        schedule.push({
          atMs: timeMs + duration * 0.5,
          target: soundTarget(phone, F0 - 2, voice, phone.glideTo),
          transitionMs: Math.max(18, Math.min(voice.transitionMs + 8, duration * 0.42)),
        })
      }
      timeMs += duration
    }

    silence(voice.wordGapMs / Math.sqrt(speechSpeed))
  }

  silence(140)
  return { schedule, totalMs: timeMs, phoneCount, voice }
}

export function renderRobotSpeech(text, speed = 1, voiceOptions = {}) {
  const cleanText = String(text || '').replace(/\s+/g, ' ').trim()
  if (!cleanText) throw new Error('Nothing readable was found in this section.')
  const { schedule, totalMs, phoneCount, voice } = buildRobotSchedule(cleanText, speed, voiceOptions)
  if (!phoneCount) throw new Error('This section could not be converted to speech.')
  const pcm = renderToBuffer({
    sampleRate: voice.sampleRate,
    schedule,
    totalMs,
    initialTarget: { gain: voice.gain, effort: voice.effort },
  })
  return { pcm, sampleRate: voice.sampleRate, durationMs: totalMs, voice }
}
