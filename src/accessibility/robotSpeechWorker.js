import { renderSabotSpeech } from './sabotSpeechEngine.js'
import { normalizeRobotVoiceOptions } from './robotVoicePresets.js'

let siteVoicePromise = null

async function loadSiteVoice() {
  if (siteVoicePromise) return siteVoicePromise
  siteVoicePromise = fetch('/api/public-site-config', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
    .then(async (res) => {
      if (!res.ok) return { flite: {}, legacyVoice: normalizeRobotVoiceOptions({}) }
      const data = await res.json().catch(() => null)
      const accessibility = data?.config?.blocks?.accessibility || data?.received?.publicSite?.blocks?.accessibility || {}
      return {
        flite: accessibility.sabotVoice || accessibility.fliteVoice || {},
        legacyVoice: normalizeRobotVoiceOptions(accessibility.robotVoice || {}),
      }
    })
    .catch(() => ({ flite: {}, legacyVoice: normalizeRobotVoiceOptions({}) }))
  return siteVoicePromise
}

self.onmessage = async (event) => {
  const { id, text, speed, voice } = event.data || {}
  if (!id) return
  try {
    const siteVoice = await loadSiteVoice()
    const options = {
      ...(siteVoice.flite || {}),
      ...(voice && typeof voice === 'object' ? voice : {}),
      legacyVoice: siteVoice.legacyVoice,
    }
    const result = await renderSabotSpeech(text, speed, options)
    self.postMessage({
      id,
      ok: true,
      sampleRate: result.sampleRate,
      durationMs: result.durationMs,
      engine: result.engine,
      voice: result.voice,
      fallbackReason: result.fallbackReason || '',
      pcm: result.pcm.buffer,
    }, [result.pcm.buffer])
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : 'Speech rendering failed.' })
  }
}
