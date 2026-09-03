import { useEffect, useMemo, useRef, useState } from 'react'
import { renderRobotSpeech } from '../accessibility/robotSpeechEngine'
import {
  DEFAULT_ROBOT_VOICE_PRESET,
  ROBOT_VOICE_PRESETS,
  normalizeRobotVoiceOptions,
  robotVoiceConfigForStorage,
} from '../accessibility/robotVoicePresets'
import { buildPublicConfigPayload } from '../lib/publicDraftExport'
import { loadPublicConfigPayload, savePublicConfigPayload } from '../lib/publicConfigApi'

const TEST_LINE = 'SabotPress. This is the local robot reader. No cloud speech service is involved.'

function number(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function makeAudioBuffer(context, pcm, sampleRate) {
  const samples = pcm instanceof Float32Array ? pcm : new Float32Array(pcm)
  const buffer = context.createBuffer(1, samples.length, sampleRate)
  buffer.copyToChannel(samples, 0)
  return buffer
}

export function RobotVoiceSettingsCard() {
  const [config, setConfig] = useState(null)
  const [voice, setVoice] = useState(() => normalizeRobotVoiceOptions({ preset: DEFAULT_ROBOT_VOICE_PRESET }))
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('Loading public reader settings…')
  const [previewText, setPreviewText] = useState(TEST_LINE)
  const audioContextRef = useRef(null)
  const sourceRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    loadPublicConfigPayload()
      .then((data) => {
        if (cancelled) return
        const loaded = data?.config || data?.received?.publicSite || { text: {}, styles: {}, blocks: {} }
        setConfig(loaded)
        setVoice(normalizeRobotVoiceOptions(loaded?.blocks?.accessibility?.robotVoice || {}))
        setStatus('ready')
        setMessage('These defaults are used by the public Read aloud control.')
      })
      .catch((error) => {
        if (cancelled) return
        setStatus('error')
        setMessage(String(error?.message || error))
      })
    return () => {
      cancelled = true
      try { sourceRef.current?.stop() } catch { /* no-op */ }
      audioContextRef.current?.close?.().catch?.(() => {})
    }
  }, [])

  const presetOptions = useMemo(() => Object.values(ROBOT_VOICE_PRESETS), [])

  function setPreset(id) {
    setVoice(normalizeRobotVoiceOptions({ preset: id }))
  }

  function patchVoice(key, value) {
    setVoice((current) => normalizeRobotVoiceOptions({ ...current, [key]: number(value, current[key]) }, current.preset))
  }

  async function preview() {
    try {
      setStatus('previewing')
      setMessage('Rendering locally…')
      try { sourceRef.current?.stop() } catch { /* no-op */ }
      const result = renderRobotSpeech(previewText, 1, voice)
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext
      if (!AudioContextCtor) throw new Error('This browser does not support Web Audio playback.')
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') audioContextRef.current = new AudioContextCtor()
      const context = audioContextRef.current
      await context.resume()
      const source = context.createBufferSource()
      source.buffer = makeAudioBuffer(context, result.pcm, result.sampleRate)
      source.connect(context.destination)
      sourceRef.current = source
      source.onended = () => {
        if (sourceRef.current === source) sourceRef.current = null
        setStatus('ready')
        setMessage('Preview finished. Adjust and preview again as needed.')
      }
      source.start()
      setStatus('playing')
      setMessage('Playing local preview…')
    } catch (error) {
      setStatus('error')
      setMessage(String(error?.message || error))
    }
  }

  async function save() {
    try {
      setStatus('saving')
      setMessage('Saving reader defaults to D1…')
      const latestData = await loadPublicConfigPayload()
      const latest = latestData?.config || latestData?.received?.publicSite || config || { text: {}, styles: {}, blocks: {} }
      const next = {
        ...latest,
        blocks: {
          ...(latest.blocks || {}),
          accessibility: {
            ...(latest.blocks?.accessibility || {}),
            robotVoice: robotVoiceConfigForStorage(voice),
          },
        },
      }
      const result = await savePublicConfigPayload(buildPublicConfigPayload(next))
      const saved = result?.received?.publicSite || next
      setConfig(saved)
      setVoice(normalizeRobotVoiceOptions(saved?.blocks?.accessibility?.robotVoice || voice))
      setStatus('saved')
      setMessage('Saved. New Read aloud sessions will use this voice by default.')
    } catch (error) {
      setStatus('error')
      setMessage(String(error?.message || error))
    }
  }

  return (
    <section className="wp-meta-box robot-voice-settings" aria-labelledby="robot-voice-settings-title">
      <div className="robot-voice-settings__header">
        <div>
          <h2 id="robot-voice-settings-title">Read aloud voice</h2>
          <p className="description">Site-wide local formant speech. No neural voice, LLM, account, or remote TTS service.</p>
        </div>
        <button className="button button--primary" type="button" onClick={save} disabled={status === 'loading' || status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Save voice defaults'}
        </button>
      </div>

      <div className="robot-voice-settings__grid">
        <label>
          <span>Preset</span>
          <select value={voice.preset} onChange={(event) => setPreset(event.target.value)} disabled={status === 'loading'}>
            {presetOptions.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
          <small>{ROBOT_VOICE_PRESETS[voice.preset]?.description}</small>
        </label>
        <label><span>Pitch <strong>{Math.round(voice.baseF0)} Hz</strong></span><input type="range" min="80" max="180" step="1" value={voice.baseF0} onChange={(event) => patchVoice('baseF0', event.target.value)} /></label>
        <label><span>Articulation <strong>{Math.round(voice.rateMs)} ms</strong></span><input type="range" min="82" max="160" step="1" value={voice.rateMs} onChange={(event) => patchVoice('rateMs', event.target.value)} /></label>
        <label><span>Word spacing <strong>{Math.round(voice.wordGapMs)} ms</strong></span><input type="range" min="20" max="90" step="1" value={voice.wordGapMs} onChange={(event) => patchVoice('wordGapMs', event.target.value)} /></label>
        <label><span>Smoothing <strong>{Math.round(voice.transitionMs)} ms</strong></span><input type="range" min="12" max="60" step="1" value={voice.transitionMs} onChange={(event) => patchVoice('transitionMs', event.target.value)} /></label>
        <label><span>Breath / hiss <strong>{voice.aspiration.toFixed(3)}</strong></span><input type="range" min="0" max="0.08" step="0.001" value={voice.aspiration} onChange={(event) => patchVoice('aspiration', event.target.value)} /></label>
        <label><span>Effort <strong>{voice.effort.toFixed(2)}</strong></span><input type="range" min="0.25" max="0.85" step="0.01" value={voice.effort} onChange={(event) => patchVoice('effort', event.target.value)} /></label>
      </div>

      <div className="robot-voice-settings__preview">
        <label>
          <span>Test phrase</span>
          <textarea rows="2" value={previewText} onChange={(event) => setPreviewText(event.target.value)} />
        </label>
        <button className="button" type="button" onClick={preview} disabled={!previewText.trim() || status === 'previewing'}>Preview locally</button>
      </div>
      <p className={`description robot-voice-settings__status${status === 'error' ? ' is-error' : ''}`} role="status">{message}</p>
    </section>
  )
}
