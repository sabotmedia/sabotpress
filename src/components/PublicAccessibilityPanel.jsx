import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

const STORAGE_KEY = 'sabot:public-accessibility:v1'
const DEFAULT_SETTINGS = {
  textSize: 'default',
  lineSpacing: 'default',
  readingWidth: 'default',
  contrast: false,
  lowGlare: false,
  plainReading: false,
  reducedMotion: false,
  imageDescriptions: false,
}

function loadSettings() {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      ...DEFAULT_SETTINGS,
      reducedMotion: saved.reducedMotion ?? window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false,
      ...saved,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function applySettings(settings) {
  const root = document.documentElement
  root.dataset.sabotA11yTextSize = settings.textSize
  root.dataset.sabotA11yLineSpacing = settings.lineSpacing
  root.dataset.sabotA11yReadingWidth = settings.readingWidth
  root.dataset.sabotA11yContrast = settings.contrast ? 'on' : 'off'
  root.dataset.sabotA11yLowGlare = settings.lowGlare ? 'on' : 'off'
  root.dataset.sabotA11yPlainReading = settings.plainReading ? 'on' : 'off'
  root.dataset.sabotA11yReducedMotion = settings.reducedMotion ? 'on' : 'off'
}

function syncImageDescriptions(enabled) {
  document.querySelectorAll('[data-sabot-generated-image-description]').forEach((node) => node.remove())
  if (!enabled) return
  const main = document.getElementById('main-content')
  if (!main) return
  main.querySelectorAll('img[alt]').forEach((image) => {
    const alt = String(image.getAttribute('alt') || '').trim()
    if (!alt || image.closest('[aria-hidden="true"], [hidden]')) return
    const figure = image.closest('figure')
    const caption = figure?.querySelector('figcaption')?.textContent?.trim() || ''
    if (caption && caption.toLowerCase().includes(alt.toLowerCase())) return
    const note = document.createElement('span')
    note.className = 'public-a11y-image-description'
    note.dataset.sabotGeneratedImageDescription = 'true'
    note.textContent = `Image description: ${alt}`
    const anchor = image.closest('picture') || image
    anchor.insertAdjacentElement('afterend', note)
  })
}

function splitReadableText(value, limit = 420) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return []
  if (text.length <= limit) return [text]
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text]
  const chunks = []
  let current = ''
  for (const sentence of sentences) {
    const clean = sentence.trim()
    if (!clean) continue
    if (current && `${current} ${clean}`.length > limit) {
      chunks.push(current)
      current = clean
    } else {
      current = current ? `${current} ${clean}` : clean
    }
  }
  if (current) chunks.push(current)
  return chunks.flatMap((chunk) => chunk.length <= limit ? [chunk] : (chunk.match(new RegExp(`.{1,${limit}}(?:\\s|$)`, 'g')) || [chunk]).map((part) => part.trim()).filter(Boolean))
}

function selectionInsideMain() {
  const selection = window.getSelection?.()
  const main = document.getElementById('main-content')
  if (!selection || selection.isCollapsed || !main || !selection.anchorNode || !main.contains(selection.anchorNode)) return null
  const text = selection.toString().replace(/\s+/g, ' ').trim()
  if (text.length < 2) return null
  const element = selection.anchorNode.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode.parentElement
  return { text, element }
}

function collectReadableBlocks(capturedSelection = null) {
  const selected = capturedSelection || selectionInsideMain()
  if (selected?.text) return splitReadableText(selected.text).map((text) => ({ text, element: selected.element, selected: true }))

  const main = document.getElementById('main-content')
  if (!main) return []
  const root = main.querySelector('.piece-body__content, [data-readable-content], article, main') || main
  const blocks = []
  const title = main.querySelector('.piece-article-lead h1, article h1, main h1')
  if (title && !root.contains(title)) {
    splitReadableText(title.textContent).forEach((text) => blocks.push({ text, element: title }))
  }

  root.querySelectorAll('h1, h2, h3, h4, p, li, blockquote, figcaption, dt, dd, img[alt]').forEach((node) => {
    if (node.closest('nav, form, button, [role="button"], [aria-hidden="true"], [hidden], .public-accessibility, .wp-public-admin-bar, .public-edit-panel')) return
    if (node.matches('li') && node.querySelector('p')) return
    let text = ''
    if (node.matches('img')) {
      const alt = String(node.getAttribute('alt') || '').trim()
      if (!alt) return
      text = `Image. ${alt}`
    } else {
      text = String(node.textContent || '').replace(/\s+/g, ' ').trim()
    }
    if (!text || text.length < 2) return
    splitReadableText(text).forEach((chunk) => blocks.push({ text: chunk, element: node }))
  })

  return blocks
}

function transcriptTarget() {
  return document.querySelector('#transcript, [data-transcript], .podcast-transcript, .transcript')
}

export function PublicAccessibilityPanel() {
  const location = useLocation()
  const [settings, setSettings] = useState(loadSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [playerOpen, setPlayerOpen] = useState(false)
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [blockCount, setBlockCount] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [hasTranscript, setHasTranscript] = useState(false)

  const blocksRef = useRef([])
  const workerRef = useRef(null)
  const pendingRef = useRef(new Map())
  const requestIdRef = useRef(0)
  const cacheRef = useRef(new Map())
  const inFlightRef = useRef(new Map())
  const audioContextRef = useRef(null)
  const sourceRef = useRef(null)
  const playbackTokenRef = useRef(0)
  const sessionRef = useRef(0)
  const statusRef = useRef(status)
  const selectionRef = useRef(null)
  const playButtonRef = useRef(null)

  useEffect(() => { statusRef.current = status }, [status])

  const clearHighlight = useCallback(() => {
    document.querySelectorAll('[data-sabot-reading-current]').forEach((node) => node.removeAttribute('data-sabot-reading-current'))
  }, [])

  const highlight = useCallback((index) => {
    clearHighlight()
    const block = blocksRef.current[index]
    const element = block?.element
    if (!(element instanceof Element)) return
    element.setAttribute('data-sabot-reading-current', 'true')
    const rect = element.getBoundingClientRect()
    const offscreen = rect.top < 80 || rect.bottom > window.innerHeight - 100
    if (offscreen) element.scrollIntoView({
      block: 'center',
      behavior: settings.reducedMotion ? 'auto' : 'smooth',
    })
  }, [clearHighlight, settings.reducedMotion])

  const stopSource = useCallback((suspend = false) => {
    playbackTokenRef.current += 1
    if (sourceRef.current) {
      try { sourceRef.current.stop() } catch { /* already stopped */ }
      try { sourceRef.current.disconnect() } catch { /* no-op */ }
      sourceRef.current = null
    }
    if (suspend && audioContextRef.current?.state === 'running') audioContextRef.current.suspend().catch(() => {})
  }, [])

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current
    const worker = new Worker(new URL('../accessibility/robotSpeechWorker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (event) => {
      const data = event.data || {}
      const pending = pendingRef.current.get(data.id)
      if (!pending) return
      pendingRef.current.delete(data.id)
      if (pending.session !== sessionRef.current) {
        pending.reject(new Error('Reader session changed.'))
        return
      }
      if (!data.ok) pending.reject(new Error(data.error || 'Speech rendering failed.'))
      else pending.resolve({ pcm: data.pcm, sampleRate: data.sampleRate, durationMs: data.durationMs })
    }
    worker.onerror = () => {
      pendingRef.current.forEach(({ reject }) => reject(new Error('The local speech engine could not start.')))
      pendingRef.current.clear()
    }
    workerRef.current = worker
    return worker
  }, [])

  const renderBlock = useCallback((index) => {
    if (index < 0 || index >= blocksRef.current.length) return Promise.reject(new Error('No readable section at that position.'))
    if (cacheRef.current.has(index)) return Promise.resolve(cacheRef.current.get(index))
    if (inFlightRef.current.has(index)) return inFlightRef.current.get(index)

    const worker = ensureWorker()
    const id = `speech-${Date.now()}-${requestIdRef.current += 1}`
    const session = sessionRef.current
    const promise = new Promise((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject, session })
      worker.postMessage({ id, text: blocksRef.current[index].text, speed })
    }).then((result) => {
      if (session === sessionRef.current) cacheRef.current.set(index, result)
      inFlightRef.current.delete(index)
      return result
    }).catch((error) => {
      inFlightRef.current.delete(index)
      throw error
    })
    inFlightRef.current.set(index, promise)
    return promise
  }, [ensureWorker, speed])

  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) throw new Error('This browser does not provide Web Audio playback.')
      audioContextRef.current = new AudioContextClass()
    }
    return audioContextRef.current
  }, [])

  const playAt = useCallback(async (index) => {
    const session = sessionRef.current
    setStatus('loading')
    setMessage(index === 0 ? 'Preparing local robot reader…' : 'Preparing next section…')
    try {
      const result = await renderBlock(index)
      if (session !== sessionRef.current) return
      const context = ensureAudioContext()
      await context.resume()
      stopSource(false)

      const pcm = new Float32Array(result.pcm)
      const buffer = context.createBuffer(1, pcm.length, result.sampleRate)
      buffer.copyToChannel(pcm, 0)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      const playbackToken = playbackTokenRef.current
      sourceRef.current = source
      setCurrentIndex(index)
      highlight(index)
      setStatus('playing')
      setMessage(blocksRef.current[index]?.selected ? 'Reading selected text' : 'Playing locally • no generative AI')

      source.onended = () => {
        if (playbackToken !== playbackTokenRef.current || session !== sessionRef.current) return
        sourceRef.current = null
        const next = index + 1
        if (next < blocksRef.current.length) playAt(next)
        else {
          setStatus('ready')
          setMessage('Finished')
          clearHighlight()
        }
      }
      source.start()
      if (index + 1 < blocksRef.current.length) renderBlock(index + 1).catch(() => {})
    } catch (error) {
      if (session !== sessionRef.current) return
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'The local reader could not prepare this text.')
    }
  }, [clearHighlight, ensureAudioContext, highlight, renderBlock, stopSource])

  const prepareReader = useCallback(async () => {
    const captured = selectionRef.current || selectionInsideMain()
    selectionRef.current = null
    sessionRef.current += 1
    stopSource(true)
    clearHighlight()
    cacheRef.current.clear()
    inFlightRef.current.clear()
    const blocks = collectReadableBlocks(captured)
    blocksRef.current = blocks
    setBlockCount(blocks.length)
    setCurrentIndex(0)
    setPlayerOpen(true)
    setSettingsOpen(false)

    if (!blocks.length) {
      setStatus('error')
      setMessage('No readable text was found on this page.')
      return
    }

    setStatus('loading')
    setMessage(captured ? 'Preparing selected text…' : 'Preparing local robot reader…')
    try {
      ensureAudioContext()
      await renderBlock(0)
      if (!blocksRef.current.length) return
      setStatus('ready')
      setMessage(captured ? 'Selection ready' : 'Ready • local, non-AI speech')
      window.requestAnimationFrame(() => playButtonRef.current?.focus())
      if (blocks.length > 1) renderBlock(1).catch(() => {})
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'The local reader could not prepare this page.')
    }
  }, [clearHighlight, ensureAudioContext, renderBlock, stopSource])

  const togglePlayback = useCallback(async () => {
    if (statusRef.current === 'playing') {
      try {
        await audioContextRef.current?.suspend()
        setStatus('paused')
        setMessage('Paused')
      } catch { /* no-op */ }
      return
    }
    if (statusRef.current === 'paused') {
      try {
        await audioContextRef.current?.resume()
        setStatus('playing')
        setMessage('Playing locally • no generative AI')
      } catch { /* no-op */ }
      return
    }
    if (statusRef.current === 'ready') playAt(currentIndex)
  }, [currentIndex, playAt])

  const moveBy = useCallback(async (delta) => {
    const target = Math.max(0, Math.min(blocksRef.current.length - 1, currentIndex + delta))
    if (target === currentIndex) return
    const wasPlaying = statusRef.current === 'playing'
    stopSource(false)
    setCurrentIndex(target)
    highlight(target)
    if (wasPlaying) playAt(target)
    else {
      setStatus('loading')
      setMessage('Preparing section…')
      try {
        await renderBlock(target)
        setStatus('ready')
        setMessage('Ready')
      } catch (error) {
        setStatus('error')
        setMessage(error instanceof Error ? error.message : 'Could not prepare that section.')
      }
    }
  }, [currentIndex, highlight, playAt, renderBlock, stopSource])

  const resetPlayback = useCallback(() => {
    stopSource(true)
    clearHighlight()
    setCurrentIndex(0)
    setStatus(blocksRef.current.length ? 'ready' : 'idle')
    setMessage(blocksRef.current.length ? 'Ready' : '')
  }, [clearHighlight, stopSource])

  const closePlayer = useCallback(() => {
    sessionRef.current += 1
    stopSource(true)
    clearHighlight()
    cacheRef.current.clear()
    inFlightRef.current.clear()
    blocksRef.current = []
    setBlockCount(0)
    setPlayerOpen(false)
    setStatus('idle')
    setMessage('')
  }, [clearHighlight, stopSource])

  const changeSpeed = useCallback(async (event) => {
    const next = Number(event.target.value) || 1
    stopSource(false)
    cacheRef.current.clear()
    inFlightRef.current.clear()
    setSpeed(next)
    setStatus('ready')
    setMessage('Speed changed • press Play')
  }, [stopSource])

  const updateSetting = useCallback((key, value) => {
    setSettings((current) => {
      const next = { ...current, [key]: value }
      if (key === 'contrast' && value) next.lowGlare = false
      if (key === 'lowGlare' && value) next.contrast = false
      return next
    })
  }, [])

  const resetSettings = useCallback(() => {
    setSettings({
      ...DEFAULT_SETTINGS,
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false,
    })
  }, [])

  const jumpToTranscript = useCallback(() => {
    const target = transcriptTarget()
    if (!target) return
    setSettingsOpen(false)
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
    target.scrollIntoView({ block: 'start', behavior: settings.reducedMotion ? 'auto' : 'smooth' })
    target.focus({ preventScroll: true })
  }, [settings.reducedMotion])

  useEffect(() => {
    applySettings(settings)
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch { /* storage may be blocked */ }
    syncImageDescriptions(settings.imageDescriptions)
  }, [settings, location.pathname])

  useEffect(() => {
    const timer = window.setTimeout(() => setHasTranscript(Boolean(transcriptTarget())), 250)
    return () => window.clearTimeout(timer)
  }, [location.pathname])

  useEffect(() => {
    sessionRef.current += 1
    stopSource(true)
    clearHighlight()
    cacheRef.current.clear()
    inFlightRef.current.clear()
    blocksRef.current = []
    setPlayerOpen(false)
    setSettingsOpen(false)
    setStatus('idle')
    setMessage('')
    setBlockCount(0)
    setCurrentIndex(0)
  }, [clearHighlight, location.pathname, stopSource])

  useEffect(() => () => {
    sessionRef.current += 1
    stopSource(false)
    clearHighlight()
    pendingRef.current.forEach(({ reject }) => reject(new Error('Reader closed.')))
    pendingRef.current.clear()
    workerRef.current?.terminate()
    workerRef.current = null
    audioContextRef.current?.close().catch(() => {})
  }, [clearHighlight, stopSource])

  const primaryLabel = status === 'playing' ? 'Pause' : status === 'paused' ? 'Resume' : 'Play'
  const canPlay = status === 'ready' || status === 'playing' || status === 'paused'

  return (
    <div className={`public-accessibility${playerOpen ? ' public-accessibility--player-open' : ''}`} onClick={(event) => event.stopPropagation()}>
      {!playerOpen ? (
        <div className="public-accessibility__launcher" aria-label="Reading and accessibility tools">
          <button
            type="button"
            className="public-accessibility__read-button"
            onPointerDown={() => { selectionRef.current = selectionInsideMain() }}
            onClick={prepareReader}
          >
            Read aloud
          </button>
          <button
            type="button"
            className="public-accessibility__settings-button"
            aria-expanded={settingsOpen}
            aria-controls="public-accessibility-settings"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            Accessibility
          </button>
        </div>
      ) : (
        <section className="public-accessibility__player" role="region" aria-label="Read aloud player">
          <div className="public-accessibility__player-head">
            <div>
              <strong>Read aloud</strong>
              <span className="public-accessibility__status" aria-live="polite">{message || 'Local robot reader'}</span>
            </div>
            <button type="button" className="public-accessibility__close" onClick={closePlayer} aria-label="Close read aloud player">Close</button>
          </div>
          <div className="public-accessibility__transport">
            <button type="button" onClick={() => moveBy(-1)} disabled={status === 'loading' || currentIndex <= 0}>Previous</button>
            <button ref={playButtonRef} type="button" className="is-primary" onClick={togglePlayback} disabled={!canPlay}>{primaryLabel}</button>
            <button type="button" onClick={resetPlayback} disabled={!blockCount}>Stop</button>
            <button type="button" onClick={() => moveBy(1)} disabled={status === 'loading' || currentIndex >= blockCount - 1}>Next</button>
          </div>
          <div className="public-accessibility__player-meta">
            <span>{blockCount ? `${Math.min(currentIndex + 1, blockCount)} of ${blockCount}` : 'Preparing…'}</span>
            <label>
              <span>Speed</span>
              <select value={speed} onChange={changeSpeed} aria-label="Reading speed">
                <option value="0.8">0.8×</option>
                <option value="1">1×</option>
                <option value="1.2">1.2×</option>
                <option value="1.4">1.4×</option>
              </select>
            </label>
            <button type="button" className="public-accessibility__inline-settings" aria-expanded={settingsOpen} aria-controls="public-accessibility-settings" onClick={() => setSettingsOpen((open) => !open)}>Accessibility</button>
          </div>
        </section>
      )}

      {settingsOpen ? (
        <section id="public-accessibility-settings" className="public-accessibility__settings" role="region" aria-label="Accessibility settings">
          <div className="public-accessibility__settings-head">
            <div>
              <strong>Accessibility</strong>
              <span>Saved only in this browser</span>
            </div>
            <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close accessibility settings">Close</button>
          </div>

          <div className="public-accessibility__setting-grid">
            <label>
              <span>Text size</span>
              <select value={settings.textSize} onChange={(event) => updateSetting('textSize', event.target.value)}>
                <option value="default">Default</option>
                <option value="large">Large</option>
                <option value="larger">Larger</option>
              </select>
            </label>
            <label>
              <span>Line spacing</span>
              <select value={settings.lineSpacing} onChange={(event) => updateSetting('lineSpacing', event.target.value)}>
                <option value="default">Default</option>
                <option value="relaxed">Relaxed</option>
                <option value="spacious">Spacious</option>
              </select>
            </label>
            <label>
              <span>Reading width</span>
              <select value={settings.readingWidth} onChange={(event) => updateSetting('readingWidth', event.target.value)}>
                <option value="default">Default</option>
                <option value="narrow">Narrow</option>
                <option value="wide">Wide</option>
              </select>
            </label>
          </div>

          <div className="public-accessibility__toggles">
            <label><input type="checkbox" checked={settings.contrast} onChange={(event) => updateSetting('contrast', event.target.checked)} /><span>High contrast</span></label>
            <label><input type="checkbox" checked={settings.lowGlare} onChange={(event) => updateSetting('lowGlare', event.target.checked)} /><span>Low-glare colors</span></label>
            <label><input type="checkbox" checked={settings.plainReading} onChange={(event) => updateSetting('plainReading', event.target.checked)} /><span>Plain reading type</span></label>
            <label><input type="checkbox" checked={settings.reducedMotion} onChange={(event) => updateSetting('reducedMotion', event.target.checked)} /><span>Reduce motion</span></label>
            <label><input type="checkbox" checked={settings.imageDescriptions} onChange={(event) => updateSetting('imageDescriptions', event.target.checked)} /><span>Show image descriptions</span></label>
          </div>

          <div className="public-accessibility__settings-actions">
            {hasTranscript ? <button type="button" onClick={jumpToTranscript}>Jump to transcript</button> : null}
            <button type="button" onClick={resetSettings}>Reset reading settings</button>
          </div>
          <p className="public-accessibility__privacy-note">Read aloud is synthesized on your device with deterministic formant speech. Page text is not sent to a speech or generative-AI service.</p>
        </section>
      ) : null}
    </div>
  )
}
