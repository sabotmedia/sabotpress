import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminFrame } from './AdminRail'
import { adminRoutes } from '../routing/routes'
import {
  createEmptyAudioLabProject,
  formatAudioLabDuration,
  getAudioLabAsset,
  getAudioLabProject,
  listAudioLabProjects,
  makeAudioLabClip,
  makeAudioLabId,
  makeAudioLabTrack,
  normalizeAudioLabProject,
  putAudioLabAssetFromBlob,
  putAudioLabAssetFromFile,
  saveAudioLabProject,
  slugifyAudioLab,
} from '../lib/audioLabStore'
import {
  clampAudioTime,
  computeProjectDuration,
  encodeWav,
  getClipDuration,
  makeAudioDownloadName,
  makeAudioEditOperation,
  normalizeAudioSelection,
  renderMultitrackMixdown,
} from '../lib/audioLabRender'
import {
  AUDIO_EFFECT_PRESETS,
  AUDIO_EFFECT_SCOPES,
  AUDIO_EFFECT_TYPES,
  getAudioEffectLabel,
  getDefaultEffectParams,
  makeAudioEffectOperation,
} from '../lib/audioLabEffects'
import {
  createEmptyNativeEntry,
  loadNativeCollection,
  upsertNativeEntryWithMeta,
} from '../lib/nativePublicContent'
import { uploadAudioLabMedia } from '../lib/nativePublicContentApi'
import {
  buildFeedReadiness,
  encodeAudioBufferForDelivery,
  getAudioFileExtension,
  getPreferredPublicAudioUrl,
  getPreferredRenderedMedia,
  getSupportedAudioDeliveryFormats,
  isLocalAudioUrl,
} from '../lib/audioLabDelivery'

const waveformPeakCount = 900
const timelinePixelsPerSecond = 44
const preferredRecordingMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']

function getAudioContext() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextCtor) throw new Error('This browser does not support Web Audio decoding')
  return new AudioContextCtor()
}

async function decodeAudioBlob(blob) {
  const context = getAudioContext()
  try {
    const arrayBuffer = await blob.arrayBuffer()
    return await context.decodeAudioData(arrayBuffer.slice(0))
  } finally {
    if (typeof context.close === 'function') {
      try { await context.close() } catch { /* ignore */ }
    }
  }
}

function buildWaveformPeaks(audioBuffer, peakCount = waveformPeakCount) {
  if (!audioBuffer?.length) return []
  const channels = Math.max(1, audioBuffer.numberOfChannels || 1)
  const samplesPerPeak = Math.max(1, Math.floor(audioBuffer.length / peakCount))
  const peaks = []

  for (let peakIndex = 0; peakIndex < peakCount; peakIndex += 1) {
    const start = peakIndex * samplesPerPeak
    const end = Math.min(audioBuffer.length, start + samplesPerPeak)
    const scanStep = Math.max(1, Math.floor((end - start) / 80))
    let max = 0

    for (let channel = 0; channel < channels; channel += 1) {
      const data = audioBuffer.getChannelData(channel)
      for (let index = start; index < end; index += scanStep) {
        max = Math.max(max, Math.abs(data[index] || 0))
      }
    }

    peaks.push(Math.min(1, max))
  }

  return peaks
}

function formatBytes(size = 0) {
  const bytes = Number(size || 0)
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function shortDate(value = '') {
  const date = new Date(String(value || ''))
  if (!Number.isFinite(date.getTime())) return 'not saved yet'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function textToHtml(text = '') {
  return String(text || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('\n')
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function stripProjectHistory(project) {
  return JSON.parse(JSON.stringify({ ...project, history: [], redoStack: [] }))
}

function commitProjectHistory(beforeProject, nextProject) {
  const before = stripProjectHistory(beforeProject)
  return normalizeAudioLabProject({ ...nextProject, history: [...(beforeProject.history || []), before].slice(-30), redoStack: [] })
}

function makeRenderSourceHash(project = {}) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify({
      tracks: project.tracks || [],
      edits: project.edits || [],
      effects: project.effects || [],
      markers: project.markers || [],
      title: project.title || '',
    })))).slice(0, 48)
  } catch {
    return `render-${Date.now()}`
  }
}

function transcriptToText(transcript = {}) {
  if (transcript.mode === 'timestamped' && Array.isArray(transcript.cues) && transcript.cues.length) {
    return transcript.cues.map((cue) => `${formatAudioLabDuration(cue.start)} ${cue.speaker ? `${cue.speaker}: ` : ''}${cue.text}`).join('\n')
  }
  return String(transcript.text || '')
}

function secondsToVttTime(seconds = 0) {
  const totalMs = Math.max(0, Math.floor(Number(seconds || 0) * 1000))
  const hrs = Math.floor(totalMs / 3600000)
  const mins = Math.floor((totalMs % 3600000) / 60000)
  const secs = Math.floor((totalMs % 60000) / 1000)
  const ms = totalMs % 1000
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

function parseTimeToSeconds(value = '') {
  const cleaned = String(value || '').replace(',', '.').trim()
  const parts = cleaned.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return Number(cleaned) || 0
}

function parseTranscriptImport(text = '', filename = '') {
  const lower = String(filename || '').toLowerCase()
  const body = String(text || '')
  if (!lower.endsWith('.srt') && !lower.endsWith('.vtt')) return { mode: 'plain', text: body, cues: [], updatedAt: new Date().toISOString() }

  const blocks = body.replace(/^WEBVTT\s*/i, '').split(/\n\s*\n/)
  const cues = []
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    const timeLine = lines.find((line) => line.includes('-->'))
    if (!timeLine) continue
    const [startRaw, endRaw] = timeLine.split('-->').map((item) => item.trim().split(/\s+/)[0])
    cues.push({ id: makeAudioLabId('cue'), start: parseTimeToSeconds(startRaw), end: parseTimeToSeconds(endRaw), speaker: '', text: lines.slice(lines.indexOf(timeLine) + 1).join(' ') })
  }
  return { mode: 'timestamped', text: '', cues, updatedAt: new Date().toISOString() }
}

function transcriptToVtt(transcript = {}) {
  const cues = transcript.mode === 'timestamped' ? transcript.cues || [] : []
  if (!cues.length) return `WEBVTT\n\n00:00:00.000 --> 00:00:05.000\n${String(transcript.text || '').trim()}\n`
  return `WEBVTT\n\n${cues.map((cue, index) => `${index + 1}\n${secondsToVttTime(cue.start)} --> ${secondsToVttTime(cue.end || cue.start + 2)}\n${cue.speaker ? `${cue.speaker}: ` : ''}${cue.text}`).join('\n\n')}\n`
}

function canUseRecorder() {
  return typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && typeof window.navigator?.mediaDevices?.getUserMedia === 'function'
}

function getPreferredRecordingMimeType() {
  if (typeof window === 'undefined' || !window.MediaRecorder) return ''
  return preferredRecordingMimeTypes.find((mimeType) => typeof window.MediaRecorder.isTypeSupported === 'function' && window.MediaRecorder.isTypeSupported(mimeType)) || ''
}

function getRecordingExtension(mimeType = '') {
  const value = String(mimeType || '').toLowerCase()
  if (value.includes('ogg')) return 'ogg'
  if (value.includes('mp4')) return 'm4a'
  if (value.includes('mpeg')) return 'mp3'
  if (value.includes('wav')) return 'wav'
  return 'webm'
}

function makeRecordingFilename(mimeType = '') {
  const date = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `audiolab-take-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.${getRecordingExtension(mimeType)}`
}

function makeMediaFromUpload(media, fallback = {}) {
  return {
    mediaId: media.mediaId || media.id || fallback.mediaId || '',
    id: media.mediaId || media.id || fallback.mediaId || '',
    assetId: fallback.assetId || fallback.localAssetId || '',
    localAssetId: fallback.localAssetId || fallback.assetId || '',
    filename: media.filename || fallback.filename || '',
    mimeType: media.mimeType || fallback.mimeType || 'audio/wav',
    size: Number(media.size || fallback.size || 0),
    duration: Number(media.duration || fallback.duration || 0),
    publicUrl: media.publicUrl || fallback.publicUrl || '',
    url: media.publicUrl || fallback.url || '',
    storageKey: media.storageKey || fallback.storageKey || '',
    role: media.role || fallback.role || '',
    codec: media.codec || fallback.codec || '',
    bitrateKbps: Number(media.bitrateKbps || fallback.bitrateKbps || 0),
    sourceMediaId: media.sourceMediaId || fallback.sourceMediaId || '',
    createdAt: media.createdAt || fallback.createdAt || new Date().toISOString(),
    uploadedAt: new Date().toISOString(),
    status: 'uploaded',
    source: 'audiolab-render',
  }
}

function getRenderedLocalAssetId(rendered = {}) {
  return String(
    rendered?.localAssetId ||
    rendered?.assetId ||
    rendered?.master?.localAssetId ||
    rendered?.master?.assetId ||
    (isLocalAudioUrl(rendered?.url) ? String(rendered.url).replace('audiolab-local://', '') : '') ||
    ''
  )
}

function getDeliveryLocalAssetId(rendered = {}) {
  return String(rendered?.delivery?.localAssetId || rendered?.delivery?.assetId || '')
}

function ProjectSidebar({ projects, activeProjectId, onNewProject, onOpenProject }) {
  return (
    <aside className="audio-lab-sidebar" aria-label="AudioLab projects">
      <div className="audio-lab-sidebar__header">
        <div><p className="audio-lab-eyebrow">Projects</p><h2>AudioLab</h2></div>
        <button type="button" className="button button--primary" onClick={onNewProject}>New</button>
      </div>
      <div className="audio-lab-project-list">
        {projects.length ? projects.map((project) => (
          <button type="button" key={project.id} className={`audio-lab-project-card${project.id === activeProjectId ? ' is-active' : ''}`} onClick={() => onOpenProject(project.id)}>
            <strong>{project.title || 'Untitled AudioLab Project'}</strong>
            <span>{project.tracks?.length || 0} tracks · {project.sourceAssets?.length || 0} sources · {project.renderedEpisode?.preferredPublicUrl ? 'public' : project.renderedEpisode ? 'rendered' : 'unrendered'}</span>
            <small>{shortDate(project.updatedAt)}</small>
          </button>
        )) : <p className="audio-lab-empty">No projects yet. Import, record, or create a new project.</p>}
      </div>
    </aside>
  )
}

function WaveformCanvas({ peaks, duration, currentTime, selection, onSeek, onSelectionChange, isLoading }) {
  const canvasRef = useRef(null)
  const dragRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    let frame = 0

    function draw() {
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(720, Math.floor(rect.width || 720))
      const height = Math.max(220, Math.floor(rect.height || 220))
      const ratio = window.devicePixelRatio || 1
      const context = canvas.getContext('2d')
      canvas.width = Math.floor(width * ratio)
      canvas.height = Math.floor(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)
      context.fillStyle = '#101820'
      context.fillRect(0, 0, width, height)
      const mid = height / 2
      const usable = height - 48
      context.strokeStyle = 'rgba(255,255,255,0.16)'
      context.beginPath()
      context.moveTo(0, mid)
      context.lineTo(width, mid)
      context.stroke()

      if (!peaks?.length) {
        context.fillStyle = 'rgba(255,255,255,0.72)'
        context.font = '600 14px system-ui, sans-serif'
        context.textAlign = 'center'
        context.fillText(isLoading ? 'Rendering preview…' : 'Import or record audio to generate waveform', width / 2, mid)
        return
      }

      const barWidth = Math.max(1, width / peaks.length)
      context.fillStyle = '#72aee6'
      peaks.forEach((peak, index) => {
        const x = index * barWidth
        const barHeight = Math.max(1, peak * usable * 0.5)
        context.fillRect(x, mid - barHeight, Math.max(1, barWidth * 0.72), barHeight * 2)
      })

      const normalized = normalizeAudioSelection(selection.start, selection.end, duration)
      if (normalized.hasSelection) {
        const sx = (normalized.start / Math.max(0.001, duration)) * width
        const ex = (normalized.end / Math.max(0.001, duration)) * width
        context.fillStyle = 'rgba(240,195,60,0.22)'
        context.fillRect(sx, 0, Math.max(2, ex - sx), height)
      }

      const progressX = (duration ? Math.max(0, Math.min(1, currentTime / duration)) : 0) * width
      context.strokeStyle = '#f0c33c'
      context.lineWidth = 2
      context.beginPath()
      context.moveTo(progressX, 0)
      context.lineTo(progressX, height)
      context.stroke()
    }

    frame = window.requestAnimationFrame(draw)
    window.addEventListener('resize', draw)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', draw)
    }
  }, [peaks, duration, currentTime, selection.start, selection.end, isLoading])

  function timeFromPointer(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const pct = (event.clientX - rect.left) / Math.max(1, rect.width)
    return clampAudioTime(pct * duration, duration)
  }

  return (
    <canvas
      ref={canvasRef}
      className="audio-lab-waveform"
      role="img"
      aria-label="Audio waveform overview"
      onMouseDown={(event) => {
        if (!duration) return
        const start = timeFromPointer(event)
        dragRef.current = { start, moved: false }
        onSeek(start)
        onSelectionChange(start, start)
      }}
      onMouseMove={(event) => {
        if (!dragRef.current || !duration) return
        const end = timeFromPointer(event)
        dragRef.current.moved = true
        onSelectionChange(dragRef.current.start, end)
      }}
      onMouseUp={(event) => {
        if (!dragRef.current || !duration) return
        const end = timeFromPointer(event)
        const drag = dragRef.current
        dragRef.current = null
        if (!drag.moved || Math.abs(end - drag.start) < 0.02) {
          onSeek(end)
          onSelectionChange(0, 0)
        } else {
          onSelectionChange(drag.start, end)
        }
      }}
      onMouseLeave={() => { dragRef.current = null }}
    />
  )
}

function RecordPanel({ canRecord, recordStatus, recordMimeType, recordElapsed, recordLevel, canPauseRecording, onStart, onPause, onResume, onStop }) {
  const isRecording = recordStatus === 'recording'
  const isPaused = recordStatus === 'paused'
  const isBusy = recordStatus === 'requesting' || recordStatus === 'saving'
  return (
    <section className="audio-lab-record-panel" aria-label="Audio recording controls">
      <div className="audio-lab-record-panel__meta">
        <p className="audio-lab-eyebrow">Record</p>
        <strong>{recordStatus}</strong>
        <span>{formatAudioLabDuration(recordElapsed)}</span>
        <small>{recordMimeType || 'Recorder will choose the best supported format.'}</small>
      </div>
      <div className="audio-lab-record-meter" aria-label="Live microphone level"><span style={{ width: `${Math.round(Math.max(0, Math.min(1, recordLevel || 0)) * 100)}%` }} /></div>
      <div className="audio-lab-record-actions">
        <button type="button" className="button button--primary" onClick={onStart} disabled={!canRecord || isBusy || isRecording || isPaused}>{recordStatus === 'ready' ? 'Record Another Take' : 'Record'}</button>
        <button type="button" className="button" onClick={onPause} disabled={!canPauseRecording || !isRecording}>Pause</button>
        <button type="button" className="button" onClick={onResume} disabled={!canPauseRecording || !isPaused}>Resume</button>
        <button type="button" className="button" onClick={onStop} disabled={!isRecording && !isPaused}>Stop</button>
      </div>
      {!canRecord ? <p className="description audio-lab-record-warning">This browser does not support MediaRecorder microphone capture.</p> : null}
    </section>
  )
}

function SelectionToolbar({ selection, duration, canUndo, canRedo, isRendering, hasAudio, onSelectionChange, onClear, onSelectAll, onEdit, onUndo, onRedo, onExport }) {
  const disabled = !selection.hasSelection || isRendering
  return (
    <section className="audio-lab-selection-toolbar" aria-label="Selection and edit controls">
      <div className="audio-lab-selection-fields">
        <label><span>Start</span><input type="number" min="0" step="0.01" value={selection.start.toFixed(2)} onChange={(event) => onSelectionChange(event.target.value, selection.end)} disabled={!hasAudio} /></label>
        <label><span>End</span><input type="number" min="0" step="0.01" value={selection.end.toFixed(2)} onChange={(event) => onSelectionChange(selection.start, event.target.value)} disabled={!hasAudio} /></label>
        <label><span>Duration</span><input value={formatAudioLabDuration(selection.duration)} readOnly /></label>
      </div>
      <div className="audio-lab-edit-actions">
        <button type="button" className="button" onClick={onSelectAll} disabled={!hasAudio || !duration}>Select All</button>
        <button type="button" className="button" onClick={onClear} disabled={!selection.hasSelection}>Clear</button>
        <button type="button" className="button" onClick={() => onEdit('trim')} disabled={disabled}>Trim</button>
        <button type="button" className="button" onClick={() => onEdit('delete')} disabled={disabled}>Delete</button>
        <button type="button" className="button" onClick={() => onEdit('silence')} disabled={disabled}>Silence</button>
        <button type="button" className="button" onClick={onUndo} disabled={!canUndo || isRendering}>Undo</button>
        <button type="button" className="button" onClick={onRedo} disabled={!canRedo || isRendering}>Redo</button>
        <button type="button" className="button button--primary" onClick={onExport} disabled={!hasAudio || isRendering}>Export WAV</button>
      </div>
    </section>
  )
}

function SourceBin({ assets, selectedTrackId, onAddToTrack }) {
  return (
    <section className="audio-lab-panel audio-lab-source-bin">
      <p className="audio-lab-eyebrow">Sources</p><h2>Project assets</h2>
      {assets.length ? <div className="audio-lab-source-bin__list">{assets.map((asset) => (
        <div key={asset.id} className="audio-lab-source-bin__item">
          <strong>{asset.filename}</strong>
          <span>{formatAudioLabDuration(asset.duration)} · {asset.source || 'upload'} · {formatBytes(asset.size)}</span>
          <button type="button" className="button" onClick={() => onAddToTrack(asset.id)} disabled={!selectedTrackId}>Add to selected track</button>
        </div>
      ))}</div> : <p className="description">No sources yet. Import or record something.</p>}
    </section>
  )
}

function MultitrackTimeline({ project, duration, currentTime, selectedTrackId, selectedClipId, onAddTrack, onSelectTrack, onSelectClip, onUpdateTrack, onDeleteTrack, onDuplicateTrack, onStartClipDrag }) {
  const tracks = project?.tracks || []
  const timelineDuration = Math.max(duration || 0, computeProjectDuration(project), 10)
  const width = Math.max(900, Math.ceil(timelineDuration * timelinePixelsPerSecond) + 160)
  return (
    <section className="audio-lab-multitrack" aria-label="Multitrack timeline">
      <div className="audio-lab-timeline-actions"><button type="button" className="button" onClick={onAddTrack}>Add Track</button><span>{tracks.length} track{tracks.length === 1 ? '' : 's'}</span></div>
      <div className="audio-lab-multitrack-scroll">
        <div className="audio-lab-multitrack-inner" style={{ minWidth: `${width}px` }}>
          <div className="audio-lab-multitrack-ruler"><span>0:00</span><span>{formatAudioLabDuration(timelineDuration / 2)}</span><span>{formatAudioLabDuration(timelineDuration)}</span></div>
          <div className="audio-lab-playhead" style={{ left: `${150 + currentTime * timelinePixelsPerSecond}px` }} />
          {tracks.map((track) => (
            <div key={track.id} className={`audio-lab-multitrack-row${track.id === selectedTrackId ? ' is-selected' : ''}`}>
              <div className="audio-lab-multitrack-controls" onClick={() => onSelectTrack(track.id)}>
                <input value={track.name} onChange={(event) => onUpdateTrack(track.id, { name: event.target.value })} aria-label="Track name" />
                <div className="audio-lab-track-buttons">
                  <button type="button" className={track.muted ? 'is-active' : ''} onClick={(event) => { event.stopPropagation(); onUpdateTrack(track.id, { muted: !track.muted }) }}>Mute</button>
                  <button type="button" className={track.solo ? 'is-active' : ''} onClick={(event) => { event.stopPropagation(); onUpdateTrack(track.id, { solo: !track.solo }) }}>Solo</button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); onDuplicateTrack(track.id) }}>Dup</button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); onDeleteTrack(track.id) }} disabled={(track.clips || []).length > 0}>Del</button>
                </div>
                <label>Gain <input type="number" min="0" step="0.05" value={track.gain} onChange={(event) => onUpdateTrack(track.id, { gain: Number(event.target.value) || 0 })} /></label>
                <label>Pan <input type="number" min="-1" max="1" step="0.05" value={track.pan} onChange={(event) => onUpdateTrack(track.id, { pan: Number(event.target.value) || 0 })} /></label>
              </div>
              <div className="audio-lab-multitrack-lane" onClick={() => onSelectTrack(track.id)}>
                {(track.clips || []).map((clip) => {
                  const clipDuration = getClipDuration(clip)
                  return (
                    <button
                      type="button"
                      key={clip.id}
                      className={`audio-lab-clip${clip.id === selectedClipId ? ' is-selected' : ''}${clip.muted ? ' is-muted' : ''}`}
                      style={{ left: `${clip.timelineStart * timelinePixelsPerSecond}px`, width: `${Math.max(36, clipDuration * timelinePixelsPerSecond)}px` }}
                      onMouseDown={(event) => onStartClipDrag(event, track.id, clip)}
                      onClick={(event) => { event.stopPropagation(); onSelectClip(track.id, clip.id) }}
                    >
                      <strong>{clip.name}</strong><span>{formatAudioLabDuration(clipDuration)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ClipInspector({ project, selectedTrack, selectedClip, assets, currentTime, onUpdateClip, onDeleteClip, onSplitClip, onMoveClipToTrack }) {
  if (!selectedClip || !selectedTrack) {
    return <section className="audio-lab-panel audio-lab-clip-inspector"><p className="audio-lab-eyebrow">Clip inspector</p><h2>No clip selected</h2><p className="description">Select a clip in the timeline to trim, split, move, rename, or delete it.</p></section>
  }
  const asset = assets.find((item) => item.id === selectedClip.assetId)
  const clipDuration = getClipDuration(selectedClip)
  return (
    <section className="audio-lab-panel audio-lab-clip-inspector">
      <p className="audio-lab-eyebrow">Clip inspector</p><h2>{selectedClip.name || 'Selected clip'}</h2>
      <label className="audio-lab-field"><span>Clip name</span><input value={selectedClip.name || ''} onChange={(event) => onUpdateClip({ name: event.target.value })} /></label>
      <label className="audio-lab-field"><span>Track</span><select value={selectedTrack.id} onChange={(event) => onMoveClipToTrack(event.target.value)}>{(project?.tracks || []).map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label>
      <label className="audio-lab-field"><span>Timeline start</span><input type="number" min="0" step="0.01" value={Number(selectedClip.timelineStart || 0)} onChange={(event) => onUpdateClip({ timelineStart: Math.max(0, Number(event.target.value) || 0) })} /></label>
      <label className="audio-lab-field"><span>Source start</span><input type="number" min="0" step="0.01" value={Number(selectedClip.sourceStart || 0)} onChange={(event) => onUpdateClip({ sourceStart: Math.max(0, Number(event.target.value) || 0) })} /></label>
      <label className="audio-lab-field"><span>Source end</span><input type="number" min="0" step="0.01" value={Number(selectedClip.sourceEnd || 0)} onChange={(event) => onUpdateClip({ sourceEnd: Math.max(0, Number(event.target.value) || 0) })} /></label>
      <label className="audio-lab-field"><span>Clip gain</span><input type="number" min="0" step="0.05" value={Number(selectedClip.gain ?? 1)} onChange={(event) => onUpdateClip({ gain: Math.max(0, Number(event.target.value) || 0) })} /></label>
      <label className="audio-lab-checkbox"><input type="checkbox" checked={Boolean(selectedClip.muted)} onChange={(event) => onUpdateClip({ muted: event.target.checked })} /> Muted</label>
      <p className="description">{asset?.filename || 'Unknown source'} · {formatAudioLabDuration(clipDuration)} · playhead {formatAudioLabDuration(currentTime)}</p>
      <div className="audio-lab-edit-actions"><button type="button" className="button" onClick={onSplitClip}>Split at playhead</button><button type="button" className="button" onClick={onDeleteClip}>Delete clip</button></div>
    </section>
  )
}

function EffectParamControls({ type, params, onChange }) {
  function update(key, value) { onChange({ ...params, [key]: value }) }
  if (type === 'amplify') return <label className="audio-lab-field"><span>Gain dB</span><input type="number" step="0.5" value={params.gainDb ?? 3} onChange={(event) => update('gainDb', Number(event.target.value))} /></label>
  if (type === 'normalize') return <label className="audio-lab-field"><span>Target dB</span><input type="number" step="0.5" value={params.targetDb ?? -1} onChange={(event) => update('targetDb', Number(event.target.value))} /></label>
  if (type === 'limiter') return <label className="audio-lab-field"><span>Ceiling dB</span><input type="number" step="0.5" value={params.ceilingDb ?? -1} onChange={(event) => update('ceilingDb', Number(event.target.value))} /></label>
  if (type === 'high-pass' || type === 'low-pass') return <label className="audio-lab-field"><span>Frequency Hz</span><input type="number" min="20" step="10" value={params.frequencyHz ?? (type === 'high-pass' ? 80 : 12000)} onChange={(event) => update('frequencyHz', Number(event.target.value))} /></label>
  if (type === 'compressor') return <div className="audio-lab-effect-param-grid"><label className="audio-lab-field"><span>Threshold dB</span><input type="number" step="1" value={params.thresholdDb ?? -18} onChange={(event) => update('thresholdDb', Number(event.target.value))} /></label><label className="audio-lab-field"><span>Ratio</span><input type="number" min="1" step="0.5" value={params.ratio ?? 3} onChange={(event) => update('ratio', Number(event.target.value))} /></label><label className="audio-lab-field"><span>Makeup dB</span><input type="number" step="0.5" value={params.makeupGainDb ?? 0} onChange={(event) => update('makeupGainDb', Number(event.target.value))} /></label></div>
  if (type === 'noise-gate') return <div className="audio-lab-effect-param-grid"><label className="audio-lab-field"><span>Threshold dB</span><input type="number" step="1" value={params.thresholdDb ?? -45} onChange={(event) => update('thresholdDb', Number(event.target.value))} /></label><label className="audio-lab-field"><span>Reduction dB</span><input type="number" step="1" value={params.reductionDb ?? -60} onChange={(event) => update('reductionDb', Number(event.target.value))} /></label></div>
  return <p className="description">No parameters for this effect.</p>
}

function EffectsPanel({ project, selectedTrack, selectedClip, selection, onAddEffect, onAddPreset, onToggleEffect, onDeleteEffect, onUpdateEffect, onMoveEffect }) {
  const [type, setType] = useState('normalize')
  const [scope, setScope] = useState('master')
  const [params, setParams] = useState(getDefaultEffectParams('normalize'))
  useEffect(() => setParams(getDefaultEffectParams(type)), [type])
  const canUseSelection = selection.hasSelection
  const addDisabled = (scope === 'track' && !selectedTrack) || (scope === 'clip' && !selectedClip) || (scope === 'selection' && !canUseSelection)

  return (
    <section className="audio-lab-panel audio-lab-effects-panel">
      <p className="audio-lab-eyebrow">Effects</p><h2>Effects rack</h2>
      <div className="audio-lab-effect-builder">
        <label className="audio-lab-field"><span>Target</span><select value={scope} onChange={(event) => setScope(event.target.value)}>{AUDIO_EFFECT_SCOPES.map((item) => <option key={item} value={item}>{item === 'master' ? 'Master mix' : item === 'track' ? 'Selected track' : item === 'clip' ? 'Selected clip' : 'Current selection'}</option>)}</select></label>
        <label className="audio-lab-field"><span>Effect</span><select value={type} onChange={(event) => setType(event.target.value)}>{AUDIO_EFFECT_TYPES.map((item) => <option key={item} value={item}>{getAudioEffectLabel(item)}</option>)}</select></label>
        <EffectParamControls type={type} params={params} onChange={setParams} />
        <button type="button" className="button button--primary" disabled={addDisabled} onClick={() => onAddEffect({ type, scope, params })}>Add effect</button>
      </div>
      <div className="audio-lab-effect-presets">
        <p className="audio-lab-eyebrow">Presets</p>
        {AUDIO_EFFECT_PRESETS.map((preset) => <button key={preset.id} type="button" className="button" onClick={() => onAddPreset(preset)}>{preset.label}</button>)}
      </div>
      <div className="audio-lab-effect-chain">
        <p className="audio-lab-eyebrow">Chain</p>
        {project?.effects?.length ? project.effects.map((effect, index) => (
          <div key={effect.id} className={`audio-lab-effect-chain__item${effect.enabled === false ? ' is-bypassed' : ''}`}>
            <strong>{index + 1}. {getAudioEffectLabel(effect.type)}</strong>
            <span>{effect.scope}{effect.trackId ? ` · ${effect.trackId}` : ''}{effect.clipId ? ` · ${effect.clipId}` : ''}</span>
            <div className="audio-lab-effect-chain__actions">
              <button type="button" className="button" onClick={() => onToggleEffect(effect.id)}>{effect.enabled === false ? 'Enable' : 'Bypass'}</button>
              <button type="button" className="button" onClick={() => onMoveEffect(effect.id, -1)} disabled={index === 0}>Up</button>
              <button type="button" className="button" onClick={() => onMoveEffect(effect.id, 1)} disabled={index === project.effects.length - 1}>Down</button>
              <button type="button" className="button" onClick={() => onDeleteEffect(effect.id)}>Delete</button>
            </div>
            <EffectParamControls type={effect.type} params={effect.params || {}} onChange={(nextParams) => onUpdateEffect(effect.id, { params: nextParams })} />
          </div>
        )) : <p className="description">No effects yet.</p>}
      </div>
    </section>
  )
}

function RenderedEpisodePanel({ project, deliveryFormats, deliveryFormatId, setDeliveryFormatId, readiness, diagnostics, isRendering, deliveryBusy, onRender, onDownload, onUploadMaster, onCreateDelivery, onUploadDelivery, onCopyUrl, onOpenUrl, onRunChecks, onAttach, episodeEditLink }) {
  const rendered = project?.renderedEpisode
  const master = rendered?.master
  const delivery = rendered?.delivery
  const preferredUrl = getPreferredPublicAudioUrl(rendered || {})
  return (
    <section className="audio-lab-panel audio-lab-rendered-panel audio-lab-stabilized-panel">
      <p className="audio-lab-eyebrow">Rendered Episode</p><h2>Publishable audio</h2>
      <div className="audio-lab-delivery-section">
        <h3>WAV master</h3>
        <button type="button" className="button button--primary" onClick={onRender} disabled={!project || isRendering}>{rendered ? 'Render updated WAV master' : 'Render WAV master'}</button>
        <button type="button" className="button" onClick={onDownload} disabled={!rendered && !project}>Download WAV master</button>
        <button type="button" className="button" onClick={onUploadMaster} disabled={!master?.localAssetId || deliveryBusy}>Upload WAV master</button>
        {master ? <dl className="audio-lab-facts"><div><dt>File</dt><dd>{master.filename}</dd></div><div><dt>Status</dt><dd>{master.publicUrl ? 'public' : master.status || 'local'}</dd></div><div><dt>Size</dt><dd>{formatBytes(master.size)}</dd></div><div><dt>MIME</dt><dd>{master.mimeType}</dd></div></dl> : <p className="description">Render a WAV master before publishing.</p>}
      </div>
      <div className="audio-lab-delivery-section">
        <h3>Compressed delivery</h3>
        <label className="audio-lab-field"><span>Format</span><select value={deliveryFormatId} onChange={(event) => setDeliveryFormatId(event.target.value)} disabled={!deliveryFormats.length}>{deliveryFormats.length ? deliveryFormats.map((format) => <option key={format.id} value={format.id}>{format.label}</option>) : <option value="">No browser delivery encoder available</option>}</select></label>
        <div className="audio-lab-edit-actions">
          <button type="button" className="button" onClick={onCreateDelivery} disabled={!project || !rendered || !deliveryFormats.length || deliveryBusy}>Create delivery audio</button>
          <button type="button" className="button" onClick={onUploadDelivery} disabled={!delivery?.localAssetId || deliveryBusy}>Upload delivery audio</button>
        </div>
        {delivery ? <dl className="audio-lab-facts"><div><dt>File</dt><dd>{delivery.filename}</dd></div><div><dt>Status</dt><dd>{delivery.publicUrl ? 'public' : delivery.status || 'local'}</dd></div><div><dt>Size</dt><dd>{formatBytes(delivery.size)}</dd></div><div><dt>MIME</dt><dd>{delivery.mimeType}</dd></div></dl> : <p className="description">Delivery audio is preferred for public playback and RSS. WAV remains the fallback.</p>}
      </div>
      <div className="audio-lab-delivery-section">
        <h3>Feed readiness</h3>
        <p className={`audio-lab-feed-status is-${readiness.status}`}>{readiness.status.replace(/-/g, ' ')}</p>
        <ul className="audio-lab-readiness-list">{readiness.checks.map((check) => <li key={check.id} className={check.ok ? 'is-ok' : check.critical ? 'is-critical' : 'is-warning'}>{check.ok ? '✓' : '!'} {check.label}</li>)}</ul>
        <div className="audio-lab-edit-actions">
          <button type="button" className="button" onClick={onCopyUrl} disabled={!preferredUrl}>Copy public URL</button>
          <button type="button" className="button" onClick={onOpenUrl} disabled={!preferredUrl}>Open public URL</button>
          <a className="button" href="/rss/podcast.xml" target="_blank" rel="noreferrer">Open RSS</a>
          <button type="button" className="button" onClick={onRunChecks}>Run delivery checks</button>
          <button type="button" className="button button--primary" onClick={onAttach} disabled={!project}>Attach/update podcast draft</button>
        </div>
        {diagnostics.length ? <ul className="audio-lab-diagnostics">{diagnostics.map((item) => <li key={item.id} className={item.ok ? 'is-ok' : 'is-warning'}>{item.label}: {item.message}</li>)}</ul> : null}
      </div>
      {project?.episode?.nativeEntryId ? <Link className="button audio-lab-edit-episode" to={episodeEditLink}>Open attached draft</Link> : null}
      {rendered && !preferredUrl ? <p className="description">Local render only. Upload master or delivery audio before publishing.</p> : null}
    </section>
  )
}

function TranscriptPanel({ transcript, onChange, onImport, onExport }) {
  const cues = transcript?.cues || []
  const mode = transcript?.mode || 'plain'

  function updateCue(cueId, patch) {
    onChange({ cues: cues.map((cue) => (cue.id === cueId ? { ...cue, ...patch } : cue)) })
  }

  return (
    <section className="audio-lab-panel audio-lab-transcript-panel">
      <p className="audio-lab-eyebrow">Transcript</p><h2>Manual transcript</h2>
      <label className="audio-lab-field"><span>Mode</span><select value={mode} onChange={(event) => onChange({ mode: event.target.value })}><option value="plain">Plain text</option><option value="timestamped">Timestamped cues</option></select></label>
      {mode === 'timestamped' ? (
        <div className="audio-lab-cue-list">
          {cues.map((cue) => (
            <div key={cue.id} className="audio-lab-cue-row">
              <input type="number" min="0" step="0.01" value={cue.start} onChange={(event) => updateCue(cue.id, { start: Number(event.target.value) || 0 })} />
              <input type="number" min="0" step="0.01" value={cue.end} onChange={(event) => updateCue(cue.id, { end: Number(event.target.value) || 0 })} />
              <input placeholder="Speaker" value={cue.speaker || ''} onChange={(event) => updateCue(cue.id, { speaker: event.target.value })} />
              <textarea rows={2} value={cue.text || ''} onChange={(event) => updateCue(cue.id, { text: event.target.value })} />
              <button type="button" className="button" onClick={() => onChange({ cues: cues.filter((item) => item.id !== cue.id) })}>Delete</button>
            </div>
          ))}
          <button type="button" className="button" onClick={() => onChange({ cues: [...cues, { id: makeAudioLabId('cue'), start: 0, end: 5, speaker: '', text: '' }] })}>Add cue</button>
        </div>
      ) : (
        <label className="audio-lab-field"><span>Plain transcript</span><textarea rows={9} value={transcript?.text || ''} onChange={(event) => onChange({ text: event.target.value })} /></label>
      )}
      <div className="audio-lab-edit-actions">
        <label className="button">Import .txt/.srt/.vtt<input type="file" accept=".txt,.srt,.vtt,text/plain" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onImport(file) }} /></label>
        <button type="button" className="button" onClick={() => onExport('txt')}>Export TXT</button>
        <button type="button" className="button" onClick={() => onExport('vtt')}>Export VTT</button>
      </div>
    </section>
  )
}

function MarkersPanel({ markers, playhead, onAdd, onUpdate, onDelete }) {
  return (
    <section className="audio-lab-panel audio-lab-markers-panel">
      <p className="audio-lab-eyebrow">Markers</p><h2>Chapters</h2>
      <button type="button" className="button button--primary" onClick={onAdd}>Add marker at playhead</button>
      {markers?.length ? <div className="audio-lab-marker-list">{markers.map((marker) => <div key={marker.id} className="audio-lab-marker-row"><input type="number" min="0" step="0.01" value={marker.time} onChange={(event) => onUpdate(marker.id, { time: Number(event.target.value) || 0 })} /><input value={marker.title} onChange={(event) => onUpdate(marker.id, { title: event.target.value })} /><textarea rows={2} value={marker.note} onChange={(event) => onUpdate(marker.id, { note: event.target.value })} /><button type="button" className="button" onClick={() => onDelete(marker.id)}>Delete</button></div>)}</div> : <p className="description">No markers yet. Current playhead: {formatAudioLabDuration(playhead)}.</p>}
    </section>
  )
}

function EpisodeMetadataPanel({ episode, renderedEpisode, onChange }) {
  const preferred = getPreferredRenderedMedia(renderedEpisode || {})
  return (
    <section className="audio-lab-panel audio-lab-episode-meta-panel">
      <p className="audio-lab-eyebrow">Episode Metadata</p><h2>Draft details</h2>
      <label className="audio-lab-field"><span>Episode title</span><input value={episode?.title || ''} onChange={(event) => onChange({ title: event.target.value })} /></label>
      <label className="audio-lab-field"><span>Slug</span><input value={episode?.slug || ''} onChange={(event) => onChange({ slug: slugifyAudioLab(event.target.value) })} /></label>
      <label className="audio-lab-field"><span>Description / show notes</span><textarea rows={7} value={episode?.description || ''} onChange={(event) => onChange({ description: event.target.value })} /></label>
      <label className="audio-lab-field"><span>Credits</span><input value={episode?.credits || ''} onChange={(event) => onChange({ credits: event.target.value })} /></label>
      <label className="audio-lab-field"><span>License</span><input value={episode?.license || ''} onChange={(event) => onChange({ license: event.target.value })} /></label>
      <div className="audio-lab-effect-param-grid"><label className="audio-lab-field"><span>Season</span><input value={episode?.season || ''} onChange={(event) => onChange({ season: event.target.value })} /></label><label className="audio-lab-field"><span>Episode #</span><input value={episode?.episodeNumber || ''} onChange={(event) => onChange({ episodeNumber: event.target.value })} /></label></div>
      <label className="audio-lab-field"><span>Cover image ref</span><input value={episode?.coverImage || ''} onChange={(event) => onChange({ coverImage: event.target.value })} /></label>
      <label className="audio-lab-checkbox"><input type="checkbox" checked={Boolean(episode?.explicit)} onChange={(event) => onChange({ explicit: event.target.checked })} /> Explicit</label>
      <p className="description">Podcast audio: {preferred?.publicUrl ? `public ${preferred.mimeType || 'audio'}` : 'local-only or missing'}</p>
    </section>
  )
}

export function AudioLabPage() {
  const audioRef = useRef(null)
  const fileInputRef = useRef(null)
  const activeProjectRef = useRef(null)
  const previewUrlRef = useRef('')
  const mediaRecorderRef = useRef(null)
  const recordingChunksRef = useRef([])
  const recordingStreamRef = useRef(null)
  const recordingAudioContextRef = useRef(null)
  const recordingSourceRef = useRef(null)
  const recordingAnalyserRef = useRef(null)
  const recordingAnimationRef = useRef(0)
  const recordingStartedAtRef = useRef(0)
  const recordingAccumulatedMsRef = useRef(0)
  const clipDragRef = useRef(null)

  const [projects, setProjects] = useState([])
  const [activeProject, setActiveProject] = useState(null)
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [renderedBuffer, setRenderedBuffer] = useState(null)
  const [peaks, setPeaks] = useState([])
  const [audioUrl, setAudioUrl] = useState('')
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [deliveryBusy, setDeliveryBusy] = useState(false)
  const [selectionRange, setSelectionRange] = useState({ start: 0, end: 0 })
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [recordStatus, setRecordStatus] = useState('idle')
  const [recordMimeType, setRecordMimeType] = useState('')
  const [recordElapsed, setRecordElapsed] = useState(0)
  const [recordLevel, setRecordLevel] = useState(0)
  const [canPauseRecording, setCanPauseRecording] = useState(false)
  const [deliveryFormatId, setDeliveryFormatId] = useState('')
  const [diagnostics, setDiagnostics] = useState([])

  const recorderSupported = canUseRecorder()
  const deliveryFormats = useMemo(() => getSupportedAudioDeliveryFormats(), [])
  const selectedDeliveryFormat = deliveryFormats.find((format) => format.id === deliveryFormatId) || deliveryFormats[0] || null

  useEffect(() => {
    if (!deliveryFormatId && deliveryFormats[0]) setDeliveryFormatId(deliveryFormats[0].id)
  }, [deliveryFormatId, deliveryFormats])

  useEffect(() => {
    refreshProjects()
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      cleanupRecordingResources({ clearChunks: true })
    }
  }, [])

  useEffect(() => { activeProjectRef.current = activeProject }, [activeProject])

  useEffect(() => {
    const project = activeProject
    let cancelled = false
    async function renderPreview() {
      if (!project?.sourceAssets?.length) {
        setRenderedBuffer(null)
        setPeaks([])
        setDuration(0)
        setAudioUrl('')
        return
      }
      try {
        setIsRendering(true)
        const sourceBuffers = new Map()
        for (const asset of project.sourceAssets || []) {
          const stored = await getAudioLabAsset(asset.id)
          if (stored?.blob) {
            sourceBuffers.set(asset.id, await decodeAudioBlob(stored.blob))
          }
        }
        if (cancelled) return
        const buffer = renderMultitrackMixdown(project, sourceBuffers)
        const wav = encodeWav(buffer)
        const url = URL.createObjectURL(wav)
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = url
        setRenderedBuffer(buffer)
        setPeaks(buildWaveformPeaks(buffer))
        setDuration(buffer.duration || computeProjectDuration(project) || 0)
        setAudioUrl(url)
        setCurrentTime(Math.min(currentTime, buffer.duration || 0))
      } catch (error) {
        if (!cancelled) setErrorMessage(error.message || 'Unable to render AudioLab preview')
      } finally {
        if (!cancelled) setIsRendering(false)
      }
    }
    renderPreview()
    return () => { cancelled = true }
  }, [activeProject?.id, activeProject?.updatedAt, JSON.stringify(activeProject?.tracks || []), JSON.stringify(activeProject?.edits || []), JSON.stringify(activeProject?.effects || [])])

  useEffect(() => {
    if (recordStatus !== 'recording') return undefined
    const interval = window.setInterval(() => {
      const live = recordingStartedAtRef.current ? Date.now() - recordingStartedAtRef.current : 0
      setRecordElapsed((recordingAccumulatedMsRef.current + live) / 1000)
    }, 250)
    return () => window.clearInterval(interval)
  }, [recordStatus])

  const selection = normalizeAudioSelection(selectionRange.start, selectionRange.end, duration)
  const selectedAsset = useMemo(() => (activeProject?.sourceAssets || []).find((asset) => asset.id === selectedAssetId) || activeProject?.sourceAssets?.[0] || null, [activeProject, selectedAssetId])
  const selectedTrackId = activeProject?.transport?.selectedTrackId || activeProject?.tracks?.[0]?.id || ''
  const selectedClipId = activeProject?.transport?.selectedClipId || ''
  const selectedTrack = (activeProject?.tracks || []).find((track) => track.id === selectedTrackId) || null
  const selectedClip = selectedTrack?.clips?.find((clip) => clip.id === selectedClipId) || null
  const totalClips = (activeProject?.tracks || []).reduce((count, track) => count + (track.clips?.length || 0), 0)
  const canUndo = Boolean(activeProject?.history?.length)
  const canRedo = Boolean(activeProject?.redoStack?.length)
  const transcriptText = transcriptToText(activeProject?.transcript || {})
  const readiness = buildFeedReadiness({ project: activeProject, renderedEpisode: activeProject?.renderedEpisode, episode: activeProject?.episode, transcriptText })
  const episodeEditLink = activeProject?.episode?.nativeEntryId ? `${adminRoutes.posts}?edit=${encodeURIComponent(activeProject.episode.nativeEntryId)}` : adminRoutes.posts

  async function refreshProjects(activeId = activeProjectRef.current?.id) {
    const nextProjects = await listAudioLabProjects()
    setProjects(nextProjects)
    if (!activeProjectRef.current && nextProjects[0]) openProjectInState(activeId ? nextProjects.find((project) => project.id === activeId) || nextProjects[0] : nextProjects[0])
  }

  function openProjectInState(project) {
    const normalized = normalizeAudioLabProject(project)
    setActiveProject(normalized)
    setSelectedAssetId(normalized.transport?.audioAssetId || normalized.sourceAssets?.[0]?.id || '')
    setSelectionRange({ start: normalized.transport?.selectionStart || 0, end: normalized.transport?.selectionEnd || 0 })
    setCurrentTime(normalized.transport?.playhead || 0)
    activeProjectRef.current = normalized
  }

  function updateActiveProject(project) {
    const normalized = normalizeAudioLabProject(project)
    setActiveProject(normalized)
    activeProjectRef.current = normalized
  }

  function updateProjectWithHistory(updater, message = 'Project updated.') {
    const before = activeProjectRef.current
    if (!before) return
    const draft = updater(stripProjectHistory(before))
    updateActiveProject(commitProjectHistory(before, draft))
    setStatusMessage(message)
  }

  async function handleNewProject() {
    const project = await saveAudioLabProject(createEmptyAudioLabProject({ title: 'Untitled AudioLab Project' }))
    openProjectInState(project)
    setStatusMessage('New AudioLab project created.')
    await refreshProjects(project.id)
  }

  async function handleOpenProject(id) {
    const project = await getAudioLabProject(id)
    if (!project) return
    openProjectInState(project)
    setStatusMessage(`Opened ${project.title || 'AudioLab project'}.`)
  }

  async function handleSaveProject(project = activeProjectRef.current) {
    if (!project) return null
    const saved = await saveAudioLabProject(project)
    openProjectInState(saved)
    await refreshProjects(saved.id)
    setStatusMessage('Project saved. Sources preserved. Publish metadata stored as JSON.')
    return saved
  }

  function updateProjectFields(fields) {
    if (!activeProjectRef.current) return
    updateActiveProject({ ...activeProjectRef.current, ...fields })
  }

  function updateEpisodeFields(fields) {
    if (!activeProjectRef.current) return
    const nextEpisode = { ...(activeProjectRef.current.episode || {}), ...fields }
    if (fields.title && !fields.slug) nextEpisode.slug = slugifyAudioLab(fields.title)
    updateActiveProject({ ...activeProjectRef.current, episode: nextEpisode })
  }

  function updateSelection(start, end) {
    const next = normalizeAudioSelection(start, end, duration)
    setSelectionRange({ start: next.start, end: next.end })
    if (!activeProjectRef.current) return
    updateActiveProject({ ...activeProjectRef.current, transport: { ...(activeProjectRef.current.transport || {}), selectionStart: next.start, selectionEnd: next.end } })
  }

  async function attachAssetToProject(asset, sourceLabel = 'Imported') {
    const baseProject = activeProjectRef.current || createEmptyAudioLabProject({ title: asset.title })
    const tracks = baseProject.tracks?.length ? baseProject.tracks : [makeAudioLabTrack({ name: 'Main Track' })]
    const selected = baseProject.transport?.selectedTrackId || tracks[0].id
    const title = baseProject.title === 'Untitled AudioLab Project' ? asset.title : baseProject.title
    const nextProject = normalizeAudioLabProject({
      ...baseProject,
      title,
      sourceAssets: [asset, ...(baseProject.sourceAssets || []).filter((item) => item.id !== asset.id)],
      tracks: tracks.map((track) => track.id === selected ? { ...track, clips: [...(track.clips || []), makeAudioLabClip(asset, { timelineStart: computeProjectDuration(baseProject) || 0 })] } : track),
      episode: { ...(baseProject.episode || {}), title, slug: baseProject.episode?.slug || slugifyAudioLab(title), audioAssetId: asset.id },
      transport: { ...(baseProject.transport || {}), selectedTrackId: selected },
    })
    const saved = await saveAudioLabProject(nextProject)
    openProjectInState(saved)
    setSelectedAssetId(asset.id)
    setStatusMessage(`${sourceLabel} ${asset.filename}. Source preserved and inserted as a clip.`)
    await refreshProjects(saved.id)
    return saved
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!String(file.type || '').startsWith('audio/')) { setErrorMessage('Choose an audio file.'); return }
    try {
      setErrorMessage('')
      setIsRendering(true)
      setStatusMessage(`Importing ${file.name}…`)
      const decoded = await decodeAudioBlob(file)
      const asset = await putAudioLabAssetFromFile(file, { duration: decoded.duration || 0 })
      await attachAssetToProject(asset, 'Imported')
    } catch (error) {
      setErrorMessage(error.message || 'Unable to import audio')
    } finally {
      setIsRendering(false)
    }
  }

  function stopInputMeter() {
    if (recordingAnimationRef.current) window.cancelAnimationFrame(recordingAnimationRef.current)
    recordingAnimationRef.current = 0
    try { recordingSourceRef.current?.disconnect?.() } catch { /* ignore */ }
    try { recordingAudioContextRef.current?.close?.() } catch { /* ignore */ }
    recordingSourceRef.current = null
    recordingAnalyserRef.current = null
    recordingAudioContextRef.current = null
    setRecordLevel(0)
  }

  function releaseRecordingStream() {
    const stream = recordingStreamRef.current
    if (stream) stream.getTracks().forEach((track) => track.stop())
    recordingStreamRef.current = null
  }

  function cleanupRecordingResources({ clearChunks = false } = {}) {
    stopInputMeter()
    releaseRecordingStream()
    mediaRecorderRef.current = null
    recordingStartedAtRef.current = 0
    recordingAccumulatedMsRef.current = 0
    if (clearChunks) recordingChunksRef.current = []
    setCanPauseRecording(false)
  }

  function setupInputMeter(stream) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextCtor) return
    const context = new AudioContextCtor()
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.72
    source.connect(analyser)
    recordingAudioContextRef.current = context
    recordingSourceRef.current = source
    recordingAnalyserRef.current = analyser
    function tick() {
      const liveAnalyser = recordingAnalyserRef.current
      if (!liveAnalyser) return
      liveAnalyser.getByteTimeDomainData(data)
      let max = 0
      for (let index = 0; index < data.length; index += 1) max = Math.max(max, Math.abs((data[index] || 128) - 128) / 128)
      setRecordLevel(Math.min(1, max * 1.4))
      recordingAnimationRef.current = window.requestAnimationFrame(tick)
    }
    tick()
  }

  async function handleStartRecording() {
    if (!recorderSupported) { setRecordStatus('error'); setErrorMessage('This browser does not support native MediaRecorder microphone capture.'); return }
    try {
      if (audioRef.current) audioRef.current.pause()
      setErrorMessage('')
      setRecordElapsed(0)
      setRecordLevel(0)
      setRecordStatus('requesting')
      let stream
      try { stream = await window.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } }) } catch { stream = await window.navigator.mediaDevices.getUserMedia({ audio: true }) }
      const preferredMimeType = getPreferredRecordingMimeType()
      const recorder = new window.MediaRecorder(stream, preferredMimeType ? { mimeType: preferredMimeType } : undefined)
      recordingChunksRef.current = []
      recordingAccumulatedMsRef.current = 0
      recordingStartedAtRef.current = Date.now()
      recordingStreamRef.current = stream
      mediaRecorderRef.current = recorder
      setRecordMimeType(recorder.mimeType || preferredMimeType || 'browser default')
      setCanPauseRecording(typeof recorder.pause === 'function' && typeof recorder.resume === 'function')
      setupInputMeter(stream)
      recorder.ondataavailable = (event) => { if (event.data?.size) recordingChunksRef.current.push(event.data) }
      recorder.onerror = (event) => { setRecordStatus('error'); setErrorMessage(event.error?.message || 'Recording failed'); cleanupRecordingResources({ clearChunks: true }) }
      recorder.onstop = () => { finishRecordingTake(recorder).catch((error) => { setRecordStatus('error'); setErrorMessage(error.message || 'Unable to save recorded take'); cleanupRecordingResources({ clearChunks: true }); setIsRendering(false) }) }
      recorder.start(1000)
      setRecordStatus('recording')
      setStatusMessage('Recording.')
    } catch (error) {
      setRecordStatus('error')
      setErrorMessage(error?.name === 'NotAllowedError' ? 'Microphone permission was denied.' : (error.message || 'Unable to start recording'))
      cleanupRecordingResources({ clearChunks: true })
    }
  }

  function handlePauseRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== 'recording' || typeof recorder.pause !== 'function') return
    recordingAccumulatedMsRef.current += Date.now() - recordingStartedAtRef.current
    recordingStartedAtRef.current = 0
    recorder.pause()
    setRecordStatus('paused')
  }

  function handleResumeRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== 'paused' || typeof recorder.resume !== 'function') return
    recordingStartedAtRef.current = Date.now()
    recorder.resume()
    setRecordStatus('recording')
  }

  function handleStopRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    if (recorder.state === 'recording' && recordingStartedAtRef.current) recordingAccumulatedMsRef.current += Date.now() - recordingStartedAtRef.current
    recordingStartedAtRef.current = 0
    setRecordElapsed(recordingAccumulatedMsRef.current / 1000)
    setRecordStatus('saving')
    stopInputMeter()
    recorder.stop()
  }

  async function finishRecordingTake(recorder) {
    try {
      setRecordStatus('saving')
      setIsRendering(true)
      const mimeType = recorder.mimeType || getPreferredRecordingMimeType() || 'audio/webm'
      const blob = new Blob(recordingChunksRef.current, { type: mimeType })
      if (!blob.size) throw new Error('Recording produced an empty audio file')
      releaseRecordingStream()
      const decoded = await decodeAudioBlob(blob)
      const filename = makeRecordingFilename(blob.type || mimeType)
      const asset = await putAudioLabAssetFromBlob(blob, { filename, title: filename.replace(/\.[^.]+$/, ''), mimeType: blob.type || mimeType, size: blob.size, duration: decoded.duration || recordElapsed || 0, source: 'browser-recording' })
      await attachAssetToProject(asset, 'Recorded')
      setRecordStatus('ready')
      setRecordElapsed(decoded.duration || recordElapsed || 0)
    } finally {
      cleanupRecordingResources({ clearChunks: true })
      setIsRendering(false)
    }
  }

  async function handleTransportToggle() {
    const element = audioRef.current
    if (!element || !audioUrl) return
    if (isPlaying) { element.pause(); return }
    try { await element.play() } catch (error) { setErrorMessage(error.message || 'Playback failed') }
  }

  function handleSeek(value) {
    const nextTime = clampAudioTime(value, duration || 0)
    if (audioRef.current) audioRef.current.currentTime = nextTime
    setCurrentTime(nextTime)
    if (activeProjectRef.current) updateActiveProject({ ...activeProjectRef.current, transport: { ...(activeProjectRef.current.transport || {}), playhead: nextTime } })
  }

  async function handleExportWav() {
    if (!renderedBuffer) return
    try {
      const wav = encodeWav(renderedBuffer)
      const filename = makeAudioDownloadName(activeProject?.title || 'audiolab-mixdown', 'wav')
      downloadBlob(wav, filename)
      setStatusMessage(`Exported ${filename}.`)
    } catch (error) {
      setErrorMessage(error.message || 'Unable to export WAV')
    }
  }

  function handleLegacyEdit(type) {
    if (!activeProjectRef.current || !selectedAsset?.id || !selection.hasSelection) return
    const edit = makeAudioEditOperation(type, selectedAsset.id, selection.start, selection.end)
    updateProjectWithHistory((project) => ({ ...project, edits: [...(project.edits || []), edit], transport: { ...(project.transport || {}), selectionStart: 0, selectionEnd: 0 } }), `${type} operation added.`)
    setSelectionRange({ start: 0, end: 0 })
  }

  function handleUndo() {
    const project = activeProjectRef.current
    const previous = project?.history?.[project.history.length - 1]
    if (!previous?.tracks) return
    updateActiveProject(normalizeAudioLabProject({ ...previous, history: (project.history || []).slice(0, -1), redoStack: [stripProjectHistory(project), ...(project.redoStack || [])] }))
    setStatusMessage('Undo applied. Preview re-rendering.')
  }

  function handleRedo() {
    const project = activeProjectRef.current
    const redoStack = Array.isArray(project?.redoStack) ? project.redoStack : []
    const next = redoStack[0]
    if (!next?.tracks) return
    updateActiveProject(normalizeAudioLabProject({ ...next, history: [...(project.history || []), stripProjectHistory(project)].slice(-30), redoStack: redoStack.slice(1) }))
    setStatusMessage('Redo applied. Preview re-rendering.')
  }

  function handleAddTrack() { updateProjectWithHistory((project) => { const track = makeAudioLabTrack({ name: `Audio Track ${(project.tracks?.length || 0) + 1}` }); return { ...project, tracks: [...(project.tracks || []), track], transport: { ...(project.transport || {}), selectedTrackId: track.id } } }, 'Track added.') }
  function handleUpdateTrack(trackId, patch) { updateProjectWithHistory((project) => ({ ...project, tracks: (project.tracks || []).map((track) => track.id === trackId ? { ...track, ...patch, gain: patch.gain ?? track.gain, pan: patch.pan ?? track.pan } : track), transport: { ...(project.transport || {}), selectedTrackId: trackId } }), 'Track updated.') }
  function handleDeleteTrack(trackId) { const track = activeProjectRef.current?.tracks?.find((item) => item.id === trackId); if (track?.clips?.length) return; updateProjectWithHistory((project) => { const tracks = (project.tracks || []).filter((item) => item.id !== trackId); return { ...project, tracks, transport: { ...(project.transport || {}), selectedTrackId: tracks[0]?.id || '', selectedClipId: '' } } }, 'Empty track deleted.') }
  function handleDuplicateTrack(trackId) { const track = activeProjectRef.current?.tracks?.find((item) => item.id === trackId); if (!track) return; updateProjectWithHistory((project) => { const copy = makeAudioLabTrack({ ...track, id: makeAudioLabId('track'), name: `${track.name} Copy`, clips: (track.clips || []).map((clip) => ({ ...clip, id: makeAudioLabId('clip') })) }); return { ...project, tracks: [...(project.tracks || []), copy], transport: { ...(project.transport || {}), selectedTrackId: copy.id, selectedClipId: '' } } }, 'Track duplicated.') }
  function handleSelectTrack(trackId) { if (!activeProjectRef.current) return; updateActiveProject({ ...activeProjectRef.current, transport: { ...(activeProjectRef.current.transport || {}), selectedTrackId: trackId } }) }
  function handleSelectClip(trackId, clipId) { const project = activeProjectRef.current; if (!project) return; const clip = project.tracks?.find((track) => track.id === trackId)?.clips?.find((item) => item.id === clipId); updateActiveProject({ ...project, transport: { ...(project.transport || {}), selectedTrackId: trackId, selectedClipId: clipId, playhead: clip?.timelineStart ?? project.transport?.playhead ?? 0 } }); if (clip) setSelectedAssetId(clip.assetId) }
  function handleAddAssetToTrack(assetId) { const asset = activeProjectRef.current?.sourceAssets?.find((item) => item.id === assetId); if (!asset) return; updateProjectWithHistory((project) => { const tracks = project.tracks?.length ? project.tracks : [makeAudioLabTrack({ name: 'Main Track' })]; const targetId = project.transport?.selectedTrackId || tracks[0].id; return { ...project, tracks: tracks.map((track) => track.id === targetId ? { ...track, clips: [...(track.clips || []), makeAudioLabClip(asset, { timelineStart: currentTime || computeProjectDuration(project) || 0 })] } : track), transport: { ...(project.transport || {}), selectedTrackId: targetId } } }, 'Source added as a clip.') }
  function handleUpdateSelectedClip(patch) { if (!selectedClip || !selectedTrack) return; updateProjectWithHistory((project) => ({ ...project, tracks: (project.tracks || []).map((track) => track.id !== selectedTrack.id ? track : { ...track, clips: (track.clips || []).map((clip) => clip.id === selectedClip.id ? { ...clip, ...patch } : clip) }) }), 'Clip updated.') }
  function handleDeleteSelectedClip() { if (!selectedClip || !selectedTrack) return; updateProjectWithHistory((project) => ({ ...project, tracks: (project.tracks || []).map((track) => track.id !== selectedTrack.id ? track : { ...track, clips: (track.clips || []).filter((clip) => clip.id !== selectedClip.id) }), transport: { ...(project.transport || {}), selectedClipId: '' } }), 'Clip deleted.') }
  function handleSplitSelectedClip() { if (!selectedClip || !selectedTrack) return; const clipStart = Number(selectedClip.timelineStart || 0); const splitOffset = currentTime - clipStart; const clipDuration = getClipDuration(selectedClip); if (splitOffset <= 0.02 || splitOffset >= clipDuration - 0.02) { setErrorMessage('Move the playhead inside the selected clip before splitting.'); return } updateProjectWithHistory((project) => ({ ...project, tracks: (project.tracks || []).map((track) => track.id !== selectedTrack.id ? track : { ...track, clips: (track.clips || []).flatMap((clip) => { if (clip.id !== selectedClip.id) return [clip]; const first = { ...clip, sourceEnd: Number(clip.sourceStart || 0) + splitOffset }; const second = { ...clip, id: makeAudioLabId('clip'), timelineStart: currentTime, sourceStart: Number(clip.sourceStart || 0) + splitOffset, name: `${clip.name} split` }; return [first, second] }) }) }), 'Clip split at playhead.') }
  function handleMoveClipToTrack(targetTrackId) { if (!selectedClip || !selectedTrack || targetTrackId === selectedTrack.id) return; updateProjectWithHistory((project) => ({ ...project, tracks: (project.tracks || []).map((track) => { if (track.id === selectedTrack.id) return { ...track, clips: (track.clips || []).filter((clip) => clip.id !== selectedClip.id) }; if (track.id === targetTrackId) return { ...track, clips: [...(track.clips || []), selectedClip] }; return track }), transport: { ...(project.transport || {}), selectedTrackId: targetTrackId, selectedClipId: selectedClip.id } }), 'Clip moved to another track.') }

  function handleStartClipDrag(event, trackId, clip) {
    event.preventDefault()
    event.stopPropagation()
    const before = activeProjectRef.current
    if (!before) return
    handleSelectClip(trackId, clip.id)
    const startX = event.clientX
    const startTime = Number(clip.timelineStart || 0)
    clipDragRef.current = { before: stripProjectHistory(before), trackId, clipId: clip.id, startX, startTime }
    const handleMove = (moveEvent) => {
      const drag = clipDragRef.current
      if (!drag || !activeProjectRef.current) return
      const delta = (moveEvent.clientX - drag.startX) / timelinePixelsPerSecond
      const nextStart = Math.max(0, drag.startTime + delta)
      const project = activeProjectRef.current
      updateActiveProject({ ...project, tracks: (project.tracks || []).map((track) => track.id !== drag.trackId ? track : { ...track, clips: (track.clips || []).map((item) => item.id === drag.clipId ? { ...item, timelineStart: nextStart } : item) }) })
    }
    const handleUp = () => {
      const drag = clipDragRef.current
      clipDragRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      if (drag && activeProjectRef.current) {
        updateActiveProject(commitProjectHistory(drag.before, activeProjectRef.current))
        setStatusMessage('Clip moved on the timeline.')
      }
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  function scopeDetailsForEffect(scope) { if (scope === 'track') return { trackId: selectedTrack?.id || '' }; if (scope === 'clip') return { trackId: selectedTrack?.id || '', clipId: selectedClip?.id || '', assetId: selectedClip?.assetId || '' }; if (scope === 'selection') return { start: selection.start, end: selection.end }; return {} }
  function handleAddEffect(fields) { const effect = makeAudioEffectOperation({ ...fields, ...scopeDetailsForEffect(fields.scope) }); updateProjectWithHistory((project) => ({ ...project, effects: [...(project.effects || []), effect] }), `${getAudioEffectLabel(effect.type)} effect added.`) }
  function handleAddPreset(preset) { const effects = (preset.effects || []).map((effect) => makeAudioEffectOperation({ ...effect, ...scopeDetailsForEffect(effect.scope || 'master') })); updateProjectWithHistory((project) => ({ ...project, effects: [...(project.effects || []), ...effects] }), `${preset.label} preset added.`) }
  function handleToggleEffect(effectId) { updateProjectWithHistory((project) => ({ ...project, effects: (project.effects || []).map((effect) => effect.id === effectId ? { ...effect, enabled: effect.enabled === false } : effect) }), 'Effect bypass toggled.') }
  function handleDeleteEffect(effectId) { updateProjectWithHistory((project) => ({ ...project, effects: (project.effects || []).filter((effect) => effect.id !== effectId) }), 'Effect deleted.') }
  function handleUpdateEffect(effectId, patch) { updateProjectWithHistory((project) => ({ ...project, effects: (project.effects || []).map((effect) => effect.id === effectId ? { ...effect, ...patch } : effect) }), 'Effect updated.') }
  function handleMoveEffect(effectId, direction) { updateProjectWithHistory((project) => { const effects = [...(project.effects || [])]; const index = effects.findIndex((effect) => effect.id === effectId); const nextIndex = index + direction; if (index < 0 || nextIndex < 0 || nextIndex >= effects.length) return project; const [effect] = effects.splice(index, 1); effects.splice(nextIndex, 0, effect); return { ...project, effects } }, 'Effect order changed.') }

  async function handleRenderFinalEpisode() {
    if (!activeProjectRef.current || !renderedBuffer) return
    try {
      setErrorMessage('')
      setIsRendering(true)
      const project = activeProjectRef.current
      const wav = encodeWav(renderedBuffer)
      const filename = makeAudioDownloadName(project.episode?.slug || project.title || 'audiolab-episode', 'wav')
      const asset = await putAudioLabAssetFromBlob(wav, { filename, title: filename.replace(/\.[^.]+$/, ''), mimeType: 'audio/wav', size: wav.size, duration: renderedBuffer.duration || duration || 0, source: 'audiolab-render-master' })
      const master = { mediaId: '', assetId: asset.id, localAssetId: asset.id, filename: asset.filename, mimeType: asset.mimeType, size: asset.size, duration: asset.duration, publicUrl: '', url: `audiolab-local://${asset.id}`, role: 'master', createdAt: asset.createdAt, status: 'local', source: 'audiolab-render' }
      const existing = project.renderedEpisode || {}
      const delivery = existing.delivery || null
      const renderedEpisode = { ...existing, mediaId: master.mediaId, assetId: asset.id, localAssetId: asset.id, filename: master.filename, mimeType: master.mimeType, size: master.size, duration: master.duration, url: master.url, publicUrl: delivery?.publicUrl || existing.publicUrl || '', master, delivery, preferredPublicUrl: delivery?.publicUrl || existing.preferredPublicUrl || existing.publicUrl || '', preferredMimeType: delivery?.mimeType || '', preferredFileSize: delivery?.size || 0, createdAt: existing.createdAt || new Date().toISOString(), uploadedAt: existing.uploadedAt || '', renderSourceHash: makeRenderSourceHash(project), status: delivery?.publicUrl ? 'delivery-ready' : 'master-local', source: 'audiolab-render', projectId: project.id }
      const saved = await saveAudioLabProject({ ...project, renderedEpisode })
      openProjectInState(saved)
      await refreshProjects(saved.id)
      setStatusMessage(`Rendered WAV master: ${filename}.`)
    } catch (error) { setErrorMessage(error.message || 'Unable to render final episode audio') } finally { setIsRendering(false) }
  }

  async function handleDownloadRenderedEpisode() {
    try {
      const rendered = activeProjectRef.current?.renderedEpisode
      const assetId = getRenderedLocalAssetId(rendered)
      if (assetId) {
        const stored = await getAudioLabAsset(assetId)
        if (stored?.blob) { downloadBlob(stored.blob, rendered?.master?.filename || rendered?.filename || 'audiolab-render.wav'); return }
      }
      if (renderedBuffer) downloadBlob(encodeWav(renderedBuffer), makeAudioDownloadName(activeProject?.title || 'audiolab-render', 'wav'))
    } catch (error) { setErrorMessage(error.message || 'Unable to download rendered episode') }
  }

  async function uploadRenderedRole(role) {
    const project = activeProjectRef.current
    const rendered = project?.renderedEpisode
    if (!project || !rendered) throw new Error('Render final episode audio first.')
    const sourceMediaId = rendered.master?.mediaId || rendered.mediaId || ''
    const localAssetId = role === 'delivery' ? getDeliveryLocalAssetId(rendered) : getRenderedLocalAssetId(rendered)
    const media = role === 'delivery' ? rendered.delivery : rendered.master
    const stored = await getAudioLabAsset(localAssetId)
    if (!stored?.blob) throw new Error(role === 'delivery' ? 'Create delivery audio before uploading it.' : 'Rendered WAV blob is missing. Re-render the episode.')
    const file = new File([stored.blob], media?.filename || stored.filename || `audiolab-${role}.${getAudioFileExtension(stored.mimeType)}`, { type: media?.mimeType || stored.mimeType || 'audio/wav' })
    const uploaded = await uploadAudioLabMedia({ file, projectId: project.id, title: project.episode?.title || project.title, filename: file.name, mimeType: file.type, duration: media?.duration || stored.duration || duration || 0, role, codec: media?.codec || '', bitrateKbps: media?.bitrateKbps || 0, sourceMediaId })
    const nextMedia = makeMediaFromUpload(uploaded, { ...media, localAssetId: stored.id, assetId: stored.id, role })
    const nextRendered = { ...rendered, [role]: nextMedia, publicUrl: role === 'delivery' ? nextMedia.publicUrl : (rendered.delivery?.publicUrl || nextMedia.publicUrl), url: role === 'delivery' ? nextMedia.publicUrl : (rendered.delivery?.publicUrl || nextMedia.publicUrl), preferredPublicUrl: role === 'delivery' ? nextMedia.publicUrl : (rendered.delivery?.publicUrl || nextMedia.publicUrl), preferredMimeType: role === 'delivery' ? nextMedia.mimeType : (rendered.delivery?.mimeType || nextMedia.mimeType), preferredFileSize: role === 'delivery' ? nextMedia.size : (rendered.delivery?.size || nextMedia.size), uploadedAt: new Date().toISOString(), status: role === 'delivery' ? 'delivery-ready' : 'master-uploaded' }
    const saved = await saveAudioLabProject({ ...project, renderedEpisode: nextRendered, episode: { ...(project.episode || {}), audioStatus: role === 'delivery' ? 'delivery-public' : 'master-public', updatedAt: new Date().toISOString() } })
    openProjectInState(saved)
    await refreshProjects(saved.id)
    setStatusMessage(role === 'delivery' ? 'Delivery audio uploaded and preferred for RSS.' : 'WAV master uploaded as public fallback.')
  }

  async function handleUploadMaster() {
    try { setDeliveryBusy(true); setErrorMessage(''); await uploadRenderedRole('master') } catch (error) { setErrorMessage(error.message || 'Unable to upload WAV master') } finally { setDeliveryBusy(false) }
  }

  async function handleCreateDeliveryAudio() {
    const project = activeProjectRef.current
    if (!project || !renderedBuffer) return
    try {
      setDeliveryBusy(true)
      setErrorMessage('')
      if (!selectedDeliveryFormat) throw new Error('No supported delivery encoder is available in this browser.')
      const blob = await encodeAudioBufferForDelivery(renderedBuffer, selectedDeliveryFormat)
      const filename = makeAudioDownloadName(project.episode?.slug || project.title || 'audiolab-delivery', selectedDeliveryFormat.extension)
      const asset = await putAudioLabAssetFromBlob(blob, { filename, title: filename.replace(/\.[^.]+$/, ''), mimeType: blob.type || selectedDeliveryFormat.mimeType, size: blob.size, duration: renderedBuffer.duration || duration || 0, source: 'audiolab-render-delivery' })
      const delivery = { mediaId: '', assetId: asset.id, localAssetId: asset.id, filename: asset.filename, mimeType: asset.mimeType, size: asset.size, duration: asset.duration, publicUrl: '', url: `audiolab-local://${asset.id}`, role: 'delivery', codec: selectedDeliveryFormat.codec, bitrateKbps: selectedDeliveryFormat.bitrateKbps, createdAt: asset.createdAt, status: 'local', source: 'audiolab-render' }
      const rendered = project.renderedEpisode || { createdAt: new Date().toISOString() }
      const saved = await saveAudioLabProject({ ...project, renderedEpisode: { ...rendered, delivery, status: 'delivery-local' } })
      openProjectInState(saved)
      await refreshProjects(saved.id)
      setStatusMessage(`Created delivery audio: ${filename} (${formatBytes(blob.size)}).`)
    } catch (error) { setErrorMessage(error.message || 'Unable to create delivery audio') } finally { setDeliveryBusy(false) }
  }

  async function handleUploadDelivery() {
    try { setDeliveryBusy(true); setErrorMessage(''); await uploadRenderedRole('delivery') } catch (error) { setErrorMessage(error.message || 'Unable to upload delivery audio') } finally { setDeliveryBusy(false) }
  }

  async function handleCopyPublicUrl() {
    const url = getPreferredPublicAudioUrl(activeProjectRef.current?.renderedEpisode || {})
    if (!url) { setErrorMessage('No public audio URL yet. Upload master or delivery audio first.'); return }
    await navigator.clipboard?.writeText?.(url)
    setStatusMessage('Public audio URL copied.')
  }

  function handleOpenPublicUrl() {
    const url = getPreferredPublicAudioUrl(activeProjectRef.current?.renderedEpisode || {})
    if (!url) { setErrorMessage('No public audio URL yet. Upload master or delivery audio first.'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleRunDeliveryChecks() {
    const rendered = activeProjectRef.current?.renderedEpisode || {}
    const url = getPreferredPublicAudioUrl(rendered)
    const results = []
    if (!url) {
      results.push({ id: 'public-url', ok: false, label: 'Public audio URL', message: 'missing' })
    } else {
      try {
        const res = await fetch(url, { method: 'HEAD' })
        results.push({ id: 'public-url', ok: res.ok, label: 'Public audio URL', message: `${res.status} ${res.headers.get('content-type') || ''} ${res.headers.get('content-length') || ''}` })
      } catch (error) {
        results.push({ id: 'public-url', ok: false, label: 'Public audio URL', message: error.message || 'failed' })
      }
    }
    try {
      const rss = await fetch('/rss/podcast.xml', { method: 'GET' })
      results.push({ id: 'rss', ok: rss.ok, label: 'RSS endpoint', message: `${rss.status} ${rss.headers.get('content-type') || ''}` })
    } catch (error) {
      results.push({ id: 'rss', ok: false, label: 'RSS endpoint', message: error.message || 'failed' })
    }
    setDiagnostics(results)
  }

  function handleTranscriptChange(patch) {
    updateProjectWithHistory((project) => ({ ...project, transcript: { ...(project.transcript || { mode: 'plain', text: '', cues: [] }), ...patch, updatedAt: new Date().toISOString() } }), 'Transcript updated.')
  }
  async function handleImportTranscript(file) { const text = await file.text(); handleTranscriptChange(parseTranscriptImport(text, file.name)) }
  function handleExportTranscript(format) { const transcript = activeProject?.transcript || {}; const body = format === 'vtt' ? transcriptToVtt(transcript) : transcriptToText(transcript); downloadBlob(new Blob([body], { type: format === 'vtt' ? 'text/vtt' : 'text/plain' }), makeAudioDownloadName(activeProject?.episode?.slug || activeProject?.title || 'transcript', format === 'vtt' ? 'vtt' : 'txt')) }
  function handleAddMarker() { updateProjectWithHistory((project) => ({ ...project, markers: [...(project.markers || []), { id: makeAudioLabId('marker'), time: currentTime || 0, title: `Marker ${(project.markers?.length || 0) + 1}`, note: '', createdAt: new Date().toISOString() }] }), 'Marker added.') }
  function handleUpdateMarker(id, patch) { updateProjectWithHistory((project) => ({ ...project, markers: (project.markers || []).map((marker) => marker.id === id ? { ...marker, ...patch } : marker) }), 'Marker updated.') }
  function handleDeleteMarker(id) { updateProjectWithHistory((project) => ({ ...project, markers: (project.markers || []).filter((marker) => marker.id !== id) }), 'Marker deleted.') }

  async function handleCreateEpisodeDraft() {
    if (!activeProject) return
    try {
      setErrorMessage('')
      const savedProject = await handleSaveProject(activeProject)
      const project = savedProject || activeProject
      const episode = project.episode || {}
      const rendered = project.renderedEpisode || null
      const preferred = getPreferredRenderedMedia(rendered || {})
      const audioUrl = preferred?.publicUrl || ''
      const nativeEntry = createEmptyNativeEntry()
      const items = await loadNativeCollection({ includeFuture: 1 })
      const title = episode.title || project.title || 'Untitled AudioLab Episode'
      const description = episode.description || ''
      const markerLines = (project.markers || []).map((marker) => `${formatAudioLabDuration(marker.time)} ${marker.title}${marker.note ? `: ${marker.note}` : ''}`).join('\n')
      const bodyParts = [description, episode.credits ? `Credits: ${episode.credits}` : '', episode.license ? `License: ${episode.license}` : '', markerLines ? `Chapters:\n${markerLines}` : '', transcriptText ? `Transcript:\n${transcriptText}` : ''].filter(Boolean)
      const relatedAssets = []
      if (rendered?.master) relatedAssets.push({ type: 'audiolab-master', role: 'master', projectId: project.id, ...rendered.master, url: rendered.master.publicUrl || rendered.master.url || '' })
      if (rendered?.delivery) relatedAssets.push({ type: 'audiolab-delivery', role: 'delivery', projectId: project.id, ...rendered.delivery, url: rendered.delivery.publicUrl || rendered.delivery.url || '' })
      const payload = {
        ...nativeEntry,
        id: episode.nativeEntryId || `audiolab-${project.id}`,
        contentType: 'podcast',
        status: 'draft',
        workflowState: 'draft',
        title,
        slug: episode.slug || slugifyAudioLab(title),
        excerpt: description,
        body: bodyParts.join('\n\n'),
        bodyHtml: textToHtml(bodyParts.join('\n\n')),
        sourceType: 'audiolab',
        sourceKind: 'audiolab',
        sourceLabel: audioUrl ? 'AudioLab public episode' : 'AudioLab project local-only',
        sourceExternalId: project.id,
        sourcePostId: project.id,
        sourceNotes: [episode.credits ? `Credits: ${episode.credits}` : '', episode.license ? `License: ${episode.license}` : '', episode.explicit ? 'Explicit: yes' : 'Explicit: no', audioUrl ? 'Audio: public' : 'Audio: local-only until uploaded'].filter(Boolean).join('\n'),
        audioSourceUrl: audioUrl,
        podcastAudioUrl: audioUrl,
        podcastRssEnclosureUrl: audioUrl,
        podcastDuration: formatAudioLabDuration(preferred?.duration || rendered?.duration || duration || 0),
        podcastSummary: description,
        podcastTranscript: transcriptText,
        fullTranscript: transcriptText,
        podcastEpisodeNumber: episode.episodeNumber || '',
        podcastSeason: episode.season || '',
        podcastCoverImage: episode.coverImage || '',
        podcastMimeType: preferred?.mimeType || '',
        podcastFileSize: preferred?.size ? String(preferred.size) : '',
        podcastExplicit: Boolean(episode.explicit),
        podcastCredits: episode.credits || '',
        podcastLicense: episode.license || '',
        podcastMarkers: project.markers || [],
        podcastTranscriptCues: project.transcript?.cues || [],
        podcastAudioMediaId: preferred?.mediaId || preferred?.id || '',
        podcastAudioStorageKey: preferred?.storageKey || '',
        podcastMasterAudioUrl: rendered?.master?.publicUrl || '',
        podcastDeliveryAudioUrl: rendered?.delivery?.publicUrl || '',
        podcastDeliveryStatus: rendered?.delivery?.publicUrl ? 'delivery-public' : rendered?.master?.publicUrl ? 'master-public' : 'local-only',
        relatedAssets,
      }
      const result = await upsertNativeEntryWithMeta(items, payload, 'AudioLab episode draft')
      const nextProject = await saveAudioLabProject({ ...project, episode: { ...episode, title, slug: payload.slug, description, status: 'draft', nativeEntryId: result.item.id, nativeEntrySlug: result.item.slug, updatedAt: new Date().toISOString(), audioStatus: payload.podcastDeliveryStatus } })
      openProjectInState(nextProject)
      await refreshProjects(nextProject.id)
      setStatusMessage(audioUrl ? 'Episode draft attached with public audio metadata.' : 'Episode draft attached as local-only. Upload audio before publishing.')
    } catch (error) { setErrorMessage(error.message || 'Unable to attach episode draft') }
  }

  return (
    <AdminFrame>
      <main className="page wp-admin-screen audio-lab-page">
        <div className="wp-screen-header audio-lab-header">
          <div><p className="audio-lab-eyebrow">Native SabotPress audio desk</p><h1>AudioLab</h1><p className="description">AudioLab v1 stabilized: local editing, rendered master, public delivery audio, podcast drafts, and RSS-ready metadata.</p></div>
          <div className="review-card__actions"><button type="button" className="button" onClick={() => fileInputRef.current?.click()}>Import Audio</button><button type="button" className="button button--primary" onClick={() => handleSaveProject()} disabled={!activeProject}>Save Project</button></div>
        </div>
        <input ref={fileInputRef} className="audio-lab-file-input" type="file" accept="audio/*" onChange={handleImportFile} />
        {errorMessage ? <p className="notice notice-error audio-lab-notice">{errorMessage}</p> : null}
        {statusMessage ? <p className="notice notice-info audio-lab-notice">{statusMessage}</p> : null}
        <section className="audio-lab-workbench audio-lab-workbench--phase4 audio-lab-workbench--phase5 audio-lab-workbench--phase6 audio-lab-workbench--phase8">
          <ProjectSidebar projects={projects} activeProjectId={activeProject?.id || ''} onNewProject={handleNewProject} onOpenProject={handleOpenProject} />
          <section className="audio-lab-editor" aria-label="Audio editor">
            <div className="audio-lab-project-strip">
              <label className="audio-lab-field"><span>Project title</span><input value={activeProject?.title || ''} placeholder="Untitled AudioLab Project" onChange={(event) => updateProjectFields({ title: event.target.value })} /></label>
              <div className="audio-lab-source-picker"><span>Selected source</span>{activeProject?.sourceAssets?.length ? <select value={selectedAsset?.id || ''} onChange={(event) => setSelectedAssetId(event.target.value)}>{activeProject.sourceAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select> : <button type="button" className="button" onClick={() => fileInputRef.current?.click()}>Choose audio</button>}</div>
            </div>
            <RecordPanel canRecord={recorderSupported} recordStatus={recordStatus} recordMimeType={recordMimeType} recordElapsed={recordElapsed} recordLevel={recordLevel} canPauseRecording={canPauseRecording} onStart={handleStartRecording} onPause={handlePauseRecording} onResume={handleResumeRecording} onStop={handleStopRecording} />
            <SelectionToolbar selection={selection} duration={duration} canUndo={canUndo} canRedo={canRedo} isRendering={isRendering} hasAudio={Boolean(activeProject?.sourceAssets?.length)} onSelectionChange={updateSelection} onClear={() => updateSelection(0, 0)} onSelectAll={() => updateSelection(0, duration || 0)} onEdit={handleLegacyEdit} onUndo={handleUndo} onRedo={handleRedo} onExport={handleExportWav} />
            <div className="audio-lab-transport" aria-label="Playback transport">
              <button type="button" className="button button--primary audio-lab-play" onClick={handleTransportToggle} disabled={!audioUrl || isRendering}>{isPlaying ? 'Pause' : 'Play'}</button>
              <button type="button" className="button" onClick={() => handleSeek(0)} disabled={!audioUrl}>Stop</button>
              <div className="audio-lab-time-readout"><strong>{formatAudioLabDuration(currentTime)}</strong><span>/ {formatAudioLabDuration(duration)}</span></div>
              <input className="audio-lab-seeker" type="range" min="0" max={duration || 0} step="0.01" value={Math.min(currentTime, duration || 0)} onChange={(event) => handleSeek(event.target.value)} disabled={!audioUrl} aria-label="Seek audio timeline" />
            </div>
            <div className="audio-lab-timeline-shell">
              <div className="audio-lab-ruler"><span>Master overview</span><span>{isRendering ? 'Rendering…' : `${activeProject?.tracks?.length || 0} tracks · ${totalClips} clips · ${activeProject?.effects?.length || 0} effects`}</span><span>{formatAudioLabDuration(duration || 0)}</span></div>
              <WaveformCanvas peaks={peaks} duration={duration} currentTime={currentTime} selection={selection} isLoading={isRendering} onSeek={handleSeek} onSelectionChange={updateSelection} />
              <MultitrackTimeline project={activeProject} duration={duration} currentTime={currentTime} selectedTrackId={selectedTrackId} selectedClipId={selectedClipId} onAddTrack={handleAddTrack} onSelectTrack={handleSelectTrack} onSelectClip={handleSelectClip} onUpdateTrack={handleUpdateTrack} onDeleteTrack={handleDeleteTrack} onDuplicateTrack={handleDuplicateTrack} onStartClipDrag={handleStartClipDrag} />
            </div>
            <audio ref={audioRef} src={audioUrl} preload="metadata" onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || duration || 0)} />
          </section>
          <aside className="audio-lab-project-sidebar" aria-label="Project details">
            <RenderedEpisodePanel project={activeProject} deliveryFormats={deliveryFormats} deliveryFormatId={deliveryFormatId} setDeliveryFormatId={setDeliveryFormatId} readiness={readiness} diagnostics={diagnostics} isRendering={isRendering} deliveryBusy={deliveryBusy} onRender={handleRenderFinalEpisode} onDownload={handleDownloadRenderedEpisode} onUploadMaster={handleUploadMaster} onCreateDelivery={handleCreateDeliveryAudio} onUploadDelivery={handleUploadDelivery} onCopyUrl={handleCopyPublicUrl} onOpenUrl={handleOpenPublicUrl} onRunChecks={handleRunDeliveryChecks} onAttach={handleCreateEpisodeDraft} episodeEditLink={episodeEditLink} />
            <SourceBin assets={activeProject?.sourceAssets || []} selectedTrackId={selectedTrackId} onAddToTrack={handleAddAssetToTrack} />
            <ClipInspector project={activeProject} selectedTrack={selectedTrack} selectedClip={selectedClip} assets={activeProject?.sourceAssets || []} currentTime={currentTime} onUpdateClip={handleUpdateSelectedClip} onDeleteClip={handleDeleteSelectedClip} onSplitClip={handleSplitSelectedClip} onMoveClipToTrack={handleMoveClipToTrack} />
            <EffectsPanel project={activeProject} selectedTrack={selectedTrack} selectedClip={selectedClip} selection={selection} onAddEffect={handleAddEffect} onAddPreset={handleAddPreset} onToggleEffect={handleToggleEffect} onDeleteEffect={handleDeleteEffect} onUpdateEffect={handleUpdateEffect} onMoveEffect={handleMoveEffect} />
            <TranscriptPanel transcript={activeProject?.transcript || { mode: 'plain', text: '', cues: [] }} onChange={handleTranscriptChange} onImport={handleImportTranscript} onExport={handleExportTranscript} />
            <MarkersPanel markers={activeProject?.markers || []} playhead={currentTime} onAdd={handleAddMarker} onUpdate={handleUpdateMarker} onDelete={handleDeleteMarker} />
            <EpisodeMetadataPanel episode={activeProject?.episode || {}} renderedEpisode={activeProject?.renderedEpisode} onChange={updateEpisodeFields} />
            <section className="audio-lab-panel"><p className="audio-lab-eyebrow">Project JSON</p><h2>Preserved source model</h2><dl className="audio-lab-facts"><div><dt>Project ID</dt><dd>{activeProject?.id || 'none'}</dd></div><div><dt>Sources</dt><dd>{activeProject?.sourceAssets?.length || 0}</dd></div><div><dt>Tracks</dt><dd>{activeProject?.tracks?.length || 0}</dd></div><div><dt>Clips</dt><dd>{totalClips}</dd></div><div><dt>Effects</dt><dd>{activeProject?.effects?.length || 0}</dd></div><div><dt>Markers</dt><dd>{activeProject?.markers?.length || 0}</dd></div><div><dt>Public audio</dt><dd>{getPreferredPublicAudioUrl(activeProject?.renderedEpisode || {}) ? 'yes' : 'no'}</dd></div></dl><p className="description">No build-time source patching. No DOM bridge controls. Source blobs remain preserved.</p></section>
          </aside>
        </section>
      </main>
    </AdminFrame>
  )
}
