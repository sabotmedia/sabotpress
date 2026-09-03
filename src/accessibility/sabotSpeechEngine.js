import { renderFliteSpeech, SABOT_FLITE_VOICE } from './fliteSpeechEngine.js'
import { renderRobotSpeech } from './robotSpeechEngine.js'

export const SABOT_SPEECH_ENGINE = 'flite'
export const SABOT_SPEECH_VOICE = SABOT_FLITE_VOICE

export async function renderSabotSpeech(text, speed = 1, options = {}) {
  try {
    return await renderFliteSpeech(text, speed, options)
  } catch (error) {
    if (options?.disableFallback) throw error
    const fallback = renderRobotSpeech(text, speed, options?.legacyVoice || options?.voice || {})
    return {
      ...fallback,
      engine: 'klatt-fallback',
      voice: 'legacy-klatt',
      fallbackReason: error instanceof Error ? error.message : String(error || 'Flite unavailable'),
    }
  }
}
