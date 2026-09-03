export const SABOT_FLITE_VOICE = 'cmu_us_lnh'
export const FLITE_ASSET_PATHS = Object.freeze({
  wasm: '/tts/flite/flite.wasm',
  voice: '/tts/flite/cmu_us_lnh.flitevox',
  wasi: '/tts/vendor/browser-wasi-shim/wasi.js',
  wasiFs: '/tts/vendor/browser-wasi-shim/fs_mem.js',
})

let runtimePromise = null
let wasmModulePromise = null
let voiceBytesPromise = null

function clamp(value, min, max, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export function normalizeFliteSpeechOptions(input = {}, speed = 1) {
  const requestedRate = Number(input.rate ?? speed)
  const rate = clamp(requestedRate, 0.65, 1.6, 1)
  const rawPitch = input.pitchMeanHz
  const rawPitchVariation = input.pitchStdDev
  const pitchMeanHz = rawPitch === '' || rawPitch == null ? null : clamp(rawPitch, 70, 280, null)
  const pitchStdDev = rawPitchVariation === '' || rawPitchVariation == null ? null : clamp(rawPitchVariation, 0, 80, null)
  const gain = clamp(input.gain, 0.25, 2, 1)
  return { rate, pitchMeanHz, pitchStdDev, gain }
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'force-cache',
  })
  if (!response.ok) throw new Error(`Local Sabot Voice asset failed to load (${response.status}).`)
  return new Uint8Array(await response.arrayBuffer())
}

function runtimeUrl(pathname) {
  if (typeof globalThis.location?.origin !== 'string') throw new Error('Sabot Voice needs a browser origin.')
  return new URL(pathname, globalThis.location.origin).href
}

async function loadRuntimeModules() {
  if (!runtimePromise) {
    const wasiUrl = runtimeUrl(FLITE_ASSET_PATHS.wasi)
    const wasiFsUrl = runtimeUrl(FLITE_ASSET_PATHS.wasiFs)
    runtimePromise = Promise.all([
      import(/* @vite-ignore */ wasiUrl),
      import(/* @vite-ignore */ wasiFsUrl),
    ]).then(([wasiModule, fsModule]) => ({
      WASI: wasiModule.default,
      File: fsModule.File,
      OpenFile: fsModule.OpenFile,
      ConsoleStdout: fsModule.ConsoleStdout,
      PreopenDirectory: fsModule.PreopenDirectory,
    }))
  }
  return runtimePromise
}

async function loadFliteModule() {
  if (!wasmModulePromise) {
    wasmModulePromise = fetchBytes(FLITE_ASSET_PATHS.wasm).then((bytes) => WebAssembly.compile(bytes))
  }
  return wasmModulePromise
}

async function loadVoiceBytes() {
  if (!voiceBytesPromise) voiceBytesPromise = fetchBytes(FLITE_ASSET_PATHS.voice)
  return voiceBytesPromise
}

function readAscii(view, offset, length) {
  let out = ''
  for (let index = 0; index < length; index += 1) out += String.fromCharCode(view.getUint8(offset + index))
  return out
}

export function decodeWavePcm(bytesLike) {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike || [])
  if (bytes.byteLength < 44) throw new Error('Sabot Voice returned an invalid WAV file.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    throw new Error('Sabot Voice returned an unsupported audio container.')
  }

  let audioFormat = 0
  let channels = 0
  let sampleRate = 0
  let bitsPerSample = 0
  let dataOffset = 0
  let dataSize = 0
  let offset = 12

  while (offset + 8 <= view.byteLength) {
    const chunkId = readAscii(view, offset, 4)
    const chunkSize = view.getUint32(offset + 4, true)
    const bodyOffset = offset + 8
    if (bodyOffset + chunkSize > view.byteLength) break

    if (chunkId === 'fmt ' && chunkSize >= 16) {
      audioFormat = view.getUint16(bodyOffset, true)
      channels = view.getUint16(bodyOffset + 2, true)
      sampleRate = view.getUint32(bodyOffset + 4, true)
      bitsPerSample = view.getUint16(bodyOffset + 14, true)
    } else if (chunkId === 'data') {
      dataOffset = bodyOffset
      dataSize = chunkSize
    }

    offset = bodyOffset + chunkSize + (chunkSize % 2)
  }

  if (!channels || !sampleRate || !dataOffset || !dataSize) throw new Error('Sabot Voice WAV data was incomplete.')
  if (![1, 3].includes(audioFormat)) throw new Error(`Sabot Voice returned unsupported WAV format ${audioFormat}.`)

  const bytesPerSample = Math.ceil(bitsPerSample / 8)
  const frameSize = bytesPerSample * channels
  const frameCount = Math.floor(dataSize / frameSize)
  if (!frameCount) throw new Error('Sabot Voice returned empty audio.')

  const pcm = new Float32Array(frameCount)
  const sampleAt = (sampleOffset) => {
    if (audioFormat === 3 && bitsPerSample === 32) return view.getFloat32(sampleOffset, true)
    if (bitsPerSample === 8) return (view.getUint8(sampleOffset) - 128) / 128
    if (bitsPerSample === 16) return view.getInt16(sampleOffset, true) / 32768
    if (bitsPerSample === 24) {
      let value = view.getUint8(sampleOffset) | (view.getUint8(sampleOffset + 1) << 8) | (view.getUint8(sampleOffset + 2) << 16)
      if (value & 0x800000) value |= 0xff000000
      return value / 8388608
    }
    if (bitsPerSample === 32) return view.getInt32(sampleOffset, true) / 2147483648
    throw new Error(`Sabot Voice returned unsupported ${bitsPerSample}-bit WAV audio.`)
  }

  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0
    const frameOffset = dataOffset + frame * frameSize
    for (let channel = 0; channel < channels; channel += 1) {
      sum += sampleAt(frameOffset + channel * bytesPerSample)
    }
    pcm[frame] = Math.max(-1, Math.min(1, sum / channels))
  }

  return {
    pcm,
    sampleRate,
    durationMs: (frameCount / sampleRate) * 1000,
  }
}

function applyGain(pcm, gain) {
  if (gain === 1) return pcm
  for (let index = 0; index < pcm.length; index += 1) {
    pcm[index] = Math.max(-1, Math.min(1, pcm[index] * gain))
  }
  return pcm
}

export async function preloadFliteSpeech() {
  await Promise.all([loadRuntimeModules(), loadFliteModule(), loadVoiceBytes()])
  return true
}

export async function renderFliteSpeech(text, speed = 1, options = {}) {
  const cleanText = String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleanText) throw new Error('Nothing readable was found in this section.')
  const config = normalizeFliteSpeechOptions(options, speed)
  const [{ WASI, File, OpenFile, ConsoleStdout, PreopenDirectory }, module, voiceBytes] = await Promise.all([
    loadRuntimeModules(),
    loadFliteModule(),
    loadVoiceBytes(),
  ])

  const outputName = 'sabot-voice.wav'
  const trace = []
  const errors = []
  const root = new PreopenDirectory('.', new Map([
    [`${SABOT_FLITE_VOICE}.flitevox`, new File(voiceBytes, { readonly: true })],
  ]))
  const fds = [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered((line) => trace.push(String(line || ''))),
    ConsoleStdout.lineBuffered((line) => errors.push(String(line || ''))),
    root,
  ]
  const args = [
    '--',
    '-psdur',
    '-voice', `${SABOT_FLITE_VOICE}.flitevox`,
    '--setf', `duration_stretch=${1 / config.rate}`,
  ]
  if (config.pitchMeanHz != null) args.push('--setf', `int_f0_target_mean=${config.pitchMeanHz}`)
  if (config.pitchStdDev != null) args.push('--setf', `int_f0_target_stddev=${config.pitchStdDev}`)
  args.push(` ${cleanText} `, outputName)

  const wasi = new WASI(args, [], fds)
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.wasiImport,
  })
  const exitCode = wasi.start(instance)
  if (exitCode !== 0) {
    throw new Error(`Sabot Voice synthesis failed${errors.length ? `: ${errors.join(' ').trim()}` : ` (exit ${exitCode})`}`)
  }

  const output = root.dir?.contents?.get(outputName)
  const waveBytes = output?.data
  if (!(waveBytes instanceof Uint8Array) || !waveBytes.byteLength) throw new Error('Sabot Voice did not produce audio.')
  const decoded = decodeWavePcm(waveBytes)
  applyGain(decoded.pcm, config.gain)

  const traceText = trace.join(' ').trim()
  const phoneCount = traceText ? traceText.split(/\s+/).filter(Boolean).length : 0
  return {
    ...decoded,
    phoneCount,
    engine: 'flite',
    voice: SABOT_FLITE_VOICE,
    config,
  }
}
