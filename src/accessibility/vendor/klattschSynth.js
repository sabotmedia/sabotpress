// Adapted from Klattsch by Tony Gies, MIT License. See NOTICE.md.
import { BandpassBiquad, glottalPulse, xorshift, softClip } from './klattschDsp.js'

const PARAMS = [
  'F0', 'voicing', 'F1', 'BW1', 'A1', 'F2', 'BW2', 'A2', 'F3', 'BW3', 'A3', 'gain',
  'vibratoDepth', 'vibratoRate', 'tremoloDepth', 'tremoloRate', 'aspiration', 'tilt', 'effort',
]

const DEFAULT = {
  F0: 120, voicing: 0,
  F1: 500, BW1: 80, A1: 0,
  F2: 1500, BW2: 120, A2: 0,
  F3: 2500, BW3: 160, A3: 0,
  gain: 3.5,
  vibratoDepth: 0, vibratoRate: 5,
  tremoloDepth: 0, tremoloRate: 5,
  aspiration: 0, tilt: 0, effort: 0.5,
}

export class FormantSynth {
  constructor({ sampleRate, initialTarget, schedule } = {}) {
    if (!sampleRate || sampleRate <= 0) throw new Error('FormantSynth requires a positive sampleRate')
    this.sr = sampleRate
    this.current = { ...DEFAULT, ...(initialTarget || {}) }
    this.target = { ...this.current }
    this.increment = {}
    for (const key of PARAMS) this.increment[key] = 0
    this.transitionSamples = 0
    this.glottalPhase = 0
    this.lfsr = 0xACE1ACE1 | 0
    this.vibratoPhase = 0
    this.tremoloPhase = 0
    this.tiltPrev = 0
    this.bp1 = new BandpassBiquad()
    this.bp2 = new BandpassBiquad()
    this.bp3 = new BandpassBiquad()
    this.schedule = (schedule || []).map((event) => ({
      atSample: Math.floor((event.atMs || 0) * this.sr / 1000),
      target: event.target,
      transitionSamples: Math.max(1, Math.floor((event.transitionMs || 30) * this.sr / 1000)),
    }))
    this.scheduleIdx = 0
    this.sampleCounter = 0
  }

  process(out) {
    const cur = this.current
    for (let i = 0; i < out.length; i += 1) {
      while (this.scheduleIdx < this.schedule.length && this.schedule[this.scheduleIdx].atSample <= this.sampleCounter) {
        const event = this.schedule[this.scheduleIdx++]
        const N = event.transitionSamples
        this.transitionSamples = N
        for (const key of PARAMS) {
          if (key in event.target) this.target[key] = event.target[key]
          this.increment[key] = (this.target[key] - this.current[key]) / N
        }
      }
      this.sampleCounter += 1

      if (this.transitionSamples > 0) {
        for (const key of PARAMS) cur[key] += this.increment[key]
        this.transitionSamples -= 1
        if (this.transitionSamples === 0) for (const key of PARAMS) cur[key] = this.target[key]
      }

      this.vibratoPhase += 2 * Math.PI * cur.vibratoRate / this.sr
      this.vibratoPhase -= 2 * Math.PI * Math.floor(this.vibratoPhase / (2 * Math.PI))
      const effF0 = cur.F0 + cur.vibratoDepth * Math.sin(this.vibratoPhase)

      this.tremoloPhase += 2 * Math.PI * cur.tremoloRate / this.sr
      this.tremoloPhase -= 2 * Math.PI * Math.floor(this.tremoloPhase / (2 * Math.PI))
      const tremoloMod = 1 - cur.tremoloDepth * (0.5 + 0.5 * Math.sin(this.tremoloPhase))

      const v = Math.max(0, Math.min(1, cur.voicing))
      this.lfsr = xorshift(this.lfsr)
      const noiseSample = this.lfsr / 2147483648
      const pulseVal = glottalPulse(this.glottalPhase, cur.effort)
      const voicedGain = 1 - cur.aspiration * 0.85
      const exc = v * pulseVal * voicedGain + (1 - v) * noiseSample * 0.35 + cur.aspiration * noiseSample * 0.5
      this.glottalPhase += effF0 / this.sr
      this.glottalPhase -= Math.floor(this.glottalPhase)

      this.bp1.setFreq(cur.F1, cur.BW1, this.sr)
      this.bp2.setFreq(cur.F2, cur.BW2, this.sr)
      this.bp3.setFreq(cur.F3, cur.BW3, this.sr)

      const y = (this.bp1.process(exc) * cur.A1 + this.bp2.process(exc) * cur.A2 + this.bp3.process(exc) * cur.A3) * cur.gain * tremoloMod
      const tilted = y - cur.tilt * this.tiltPrev
      this.tiltPrev = y
      out[i] = softClip(tilted)
    }
  }
}

export function renderToBuffer({ sampleRate = 24000, schedule, totalMs, initialTarget } = {}) {
  const duration = Math.max(80, Number(totalMs) || 0)
  const samples = Math.ceil(duration * sampleRate / 1000)
  const buffer = new Float32Array(samples)
  const synth = new FormantSynth({ sampleRate, initialTarget, schedule })
  synth.process(buffer)
  return buffer
}
