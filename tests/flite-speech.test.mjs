import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SABOT_FLITE_VOICE,
  FLITE_ASSET_PATHS,
  decodeWavePcm,
  normalizeFliteSpeechOptions,
} from '../src/accessibility/fliteSpeechEngine.js'
import { SABOT_SPEECH_ENGINE, SABOT_SPEECH_VOICE } from '../src/accessibility/sabotSpeechEngine.js'

function makeTinyPcmWav() {
  const samples = [0, 8192, -8192, 16384, -16384, 0]
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 24000, true)
  view.setUint32(28, 48000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true))
  return new Uint8Array(buffer)
}

test('Sabot speech defaults to the exact Flite cmu_us_lnh voice', () => {
  assert.equal(SABOT_SPEECH_ENGINE, 'flite')
  assert.equal(SABOT_FLITE_VOICE, 'cmu_us_lnh')
  assert.equal(SABOT_SPEECH_VOICE, 'cmu_us_lnh')
  assert.match(FLITE_ASSET_PATHS.wasm, /^\/tts\//)
  assert.match(FLITE_ASSET_PATHS.voice, /cmu_us_lnh\.flitevox$/)
  assert.ok(!Object.values(FLITE_ASSET_PATHS).some((value) => /^https?:\/\//.test(value)))
})

test('Flite controls preserve the original voice unless pitch override is requested', () => {
  const defaults = normalizeFliteSpeechOptions({}, 1)
  assert.equal(defaults.rate, 1)
  assert.equal(defaults.pitchMeanHz, null)
  assert.equal(defaults.pitchStdDev, null)

  const tuned = normalizeFliteSpeechOptions({ rate: 9, pitchMeanHz: 999, pitchStdDev: -10, gain: 8 }, 1)
  assert.equal(tuned.rate, 1.6)
  assert.equal(tuned.pitchMeanHz, 280)
  assert.equal(tuned.pitchStdDev, 0)
  assert.equal(tuned.gain, 2)
})

test('Flite WAV decoder returns finite mono PCM for local speech playback', () => {
  const decoded = decodeWavePcm(makeTinyPcmWav())
  assert.equal(decoded.sampleRate, 24000)
  assert.equal(decoded.pcm.length, 6)
  assert.ok(decoded.durationMs > 0)
  for (const sample of decoded.pcm) assert.ok(Number.isFinite(sample))
  assert.ok(decoded.pcm.some((sample) => Math.abs(sample) > 0.1))
})
