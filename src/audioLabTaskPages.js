import {
  formatAudioLabDuration,
  getAudioLabAsset,
  getAudioLabProject,
  listAudioLabProjects,
  makeAudioLabId,
  saveAudioLabProject,
  slugifyAudioLab,
} from './lib/audioLabStore'

const TASKS = [
  { id: 'publish', label: 'Publish' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'markers', label: 'Markers' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'effects', label: 'Effects' },
  { id: 'sources', label: 'Sources' },
]

function isAudioLabRoute() {
  return typeof window !== 'undefined' && /\/wp-admin\/audiolab(?:\/|$)/.test(window.location.pathname)
}

function page() {
  return document.querySelector('.audio-lab-page')
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function currentSearch() {
  return new URLSearchParams(window.location.search || '')
}

function taskUrl(task, projectId = '') {
  const params = new URLSearchParams()
  params.set('task', task)
  if (projectId) params.set('project', projectId)
  return `/wp-admin/audiolab?${params.toString()}`
}

function editorUrl(projectId = '') {
  const params = new URLSearchParams()
  if (projectId) params.set('project', projectId)
  const qs = params.toString()
  return qs ? `/wp-admin/audiolab?${qs}` : '/wp-admin/audiolab'
}

async function getActiveProject() {
  const params = currentSearch()
  const projectId = params.get('project') || ''
  const projects = await listAudioLabProjects()
  const project = projectId ? await getAudioLabProject(projectId) : projects[0]
  return { projects, project: project || projects[0] || null }
}

function syncEditorNav(projectId = '') {
  const root = page()
  if (!root) return
  let nav = root.querySelector('.audio-lab-workflow-nav')
  if (!nav) {
    nav = document.createElement('nav')
    nav.className = 'audio-lab-workflow-nav'
    nav.setAttribute('aria-label', 'AudioLab workflow pages')
    root.appendChild(nav)
  }
  nav.innerHTML = [
    `<a href="${editorUrl(projectId)}">Editor</a>`,
    ...TASKS.map((task) => `<a href="${taskUrl(task.id, projectId)}">${task.label}</a>`),
  ].join('')
}

function setTaskState(task) {
  const root = page()
  if (!root) return
  if (task) root.dataset.audiolabTask = task
  else delete root.dataset.audiolabTask
}

function ensureTaskShell(root) {
  let shell = root.querySelector('.audio-lab-task-shell')
  if (!shell) {
    shell = document.createElement('section')
    shell.className = 'audio-lab-task-shell'
    root.appendChild(shell)
  }
  return shell
}

function renderEmpty(shell) {
  shell.innerHTML = `
    <div class="audio-lab-task-card audio-lab-task-card--empty">
      <h1>No AudioLab project yet</h1>
      <p>Go back to the editor, import or record audio, then use the workflow pages.</p>
      <a class="button button--primary" href="/wp-admin/audiolab">Back to editor</a>
    </div>
  `
}

function renderTaskHeader({ task, project, projects }) {
  const title = TASKS.find((item) => item.id === task)?.label || 'Workflow'
  return `
    <header class="audio-lab-task-header">
      <div>
        <p class="audio-lab-eyebrow">AudioLab workflow page</p>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(project?.title || 'Untitled AudioLab Project')}</p>
      </div>
      <div class="audio-lab-task-actions">
        <label>
          <span>Project</span>
          <select id="audio-lab-task-project-select">
            ${projects.map((item) => `<option value="${escapeHtml(item.id)}"${item.id === project.id ? ' selected' : ''}>${escapeHtml(item.title || 'Untitled')}</option>`).join('')}
          </select>
        </label>
        <a class="button" href="${editorUrl(project.id)}">Back to editor</a>
      </div>
    </header>
    <nav class="audio-lab-task-tabs" aria-label="AudioLab task pages">
      ${TASKS.map((item) => `<a class="${item.id === task ? 'is-active' : ''}" href="${taskUrl(item.id, project.id)}">${item.label}</a>`).join('')}
    </nav>
  `
}

function attachProjectSelect() {
  const select = document.getElementById('audio-lab-task-project-select')
  if (!select) return
  select.addEventListener('change', () => {
    const params = currentSearch()
    params.set('project', select.value)
    const nextUrl = `/wp-admin/audiolab?${params.toString()}`
    window.history.pushState({}, '', nextUrl)
    renderTaskPage()
  })
}

function getRenderedLocalAssetId(rendered = {}) {
  return String(
    rendered?.delivery?.localAssetId ||
    rendered?.delivery?.assetId ||
    rendered?.master?.localAssetId ||
    rendered?.master?.assetId ||
    rendered?.localAssetId ||
    rendered?.assetId ||
    ''
  )
}

function getPublicAudioUrl(rendered = {}) {
  return String(rendered?.preferredPublicUrl || rendered?.delivery?.publicUrl || rendered?.master?.publicUrl || rendered?.publicUrl || '')
}

function chooseTranscriptionSource(project = {}) {
  const rendered = project.renderedEpisode || {}
  const renderedAssetId = getRenderedLocalAssetId(rendered)
  if (renderedAssetId) return { type: 'asset', id: renderedAssetId, label: 'Rendered episode audio' }
  const publicUrl = getPublicAudioUrl(rendered)
  if (publicUrl) return { type: 'url', url: publicUrl, label: 'Public rendered audio URL' }
  const episodeAssetId = project.episode?.audioAssetId || ''
  if (episodeAssetId) return { type: 'asset', id: episodeAssetId, label: 'Episode source audio' }
  const first = project.sourceAssets?.[0]
  if (first?.id) return { type: 'asset', id: first.id, label: first.filename || 'First source asset' }
  return null
}

function normalizeTranscriptForSave(transcript = {}) {
  const cues = Array.isArray(transcript.cues) ? transcript.cues.map((cue, index) => ({
    id: String(cue.id || makeAudioLabId('cue')),
    start: Math.max(0, Number(cue.start || 0)),
    end: Math.max(0, Number(cue.end || cue.start || 0)),
    speaker: String(cue.speaker || ''),
    text: String(cue.text || ''),
  })).filter((cue) => cue.text.trim()) : []
  return {
    mode: cues.length ? 'timestamped' : 'plain',
    text: String(transcript.text || cues.map((cue) => cue.text).join(' ') || ''),
    cues,
    updatedAt: new Date().toISOString(),
    generatedAt: String(transcript.generatedAt || new Date().toISOString()),
    language: String(transcript.language || ''),
    provider: String(transcript.provider || ''),
    engine: String(transcript.engine || ''),
  }
}

function cuesSummary(cues = []) {
  if (!Array.isArray(cues) || !cues.length) return '<p class="description">No timestamped cues yet.</p>'
  return `
    <ol class="audio-lab-transcript-cues">
      ${cues.slice(0, 24).map((cue) => `<li><time>${formatAudioLabDuration(cue.start)}${cue.end ? `–${formatAudioLabDuration(cue.end)}` : ''}</time><span>${escapeHtml(cue.text)}</span></li>`).join('')}
    </ol>
    ${cues.length > 24 ? `<p class="description">Showing 24 of ${cues.length} cues. Full text is in the editor.</p>` : ''}
  `
}

async function runAutoTranscription({ shell, project, textarea }) {
  const status = shell.querySelector('#audio-lab-transcript-status')
  const button = shell.querySelector('#audio-lab-transcribe-run')
  const language = shell.querySelector('#audio-lab-transcript-language')?.value || ''
  const source = chooseTranscriptionSource(project)
  if (!source) {
    toast(shell, 'No rendered or source audio available to transcribe.')
    return
  }

  try {
    button.disabled = true
    button.textContent = 'Transcribing…'
    status.textContent = 'Preparing audio for transcription…'
    const form = new FormData()
    form.set('projectId', project.id)
    form.set('title', project.episode?.title || project.title || 'AudioLab episode')
    if (language) form.set('language', language)

    if (source.type === 'asset') {
      const stored = await getAudioLabAsset(source.id)
      if (!stored?.blob) throw new Error('Audio blob is missing locally. Render or re-import the audio first.')
      form.set('filename', stored.filename || 'audiolab-audio')
      form.set('mimeType', stored.mimeType || stored.blob.type || 'audio/wav')
      form.set('file', stored.blob, stored.filename || 'audiolab-audio')
    } else {
      form.set('mediaUrl', source.url)
      form.set('filename', 'audiolab-public-audio')
    }

    status.textContent = 'Sending audio to transcription provider…'
    const response = await fetch('/api/audiolab/transcribe', { method: 'POST', body: form })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.ok) throw new Error(data.error || `Transcription failed: ${response.status}`)

    const nextTranscript = normalizeTranscriptForSave(data.transcript || {})
    const saved = await saveAudioLabProject({ ...project, transcript: nextTranscript })
    textarea.value = nextTranscript.text || ''
    status.textContent = `Transcript created with ${nextTranscript.cues.length} timestamped cues. Saveback complete.`
    toast(shell, `Auto transcript saved for ${saved.title || 'AudioLab project'}.`)
    renderTaskPage()
  } catch (error) {
    status.textContent = error.message || 'Automatic transcription failed.'
    toast(shell, error.message || 'Automatic transcription failed.')
  } finally {
    button.disabled = false
    button.textContent = 'Auto transcribe audio'
  }
}

function renderTranscript({ shell, project, projects }) {
  const transcript = project.transcript || { mode: 'plain', text: '', cues: [] }
  const source = chooseTranscriptionSource(project)
  shell.innerHTML = `
    ${renderTaskHeader({ task: 'transcript', project, projects })}
    <section class="audio-lab-task-grid audio-lab-task-grid--transcript">
      <article class="audio-lab-task-card audio-lab-task-card--wide">
        <div class="audio-lab-task-card__header">
          <div>
            <p class="audio-lab-eyebrow">Transcript workspace</p>
            <h2>Transcript and correction</h2>
          </div>
          <div class="audio-lab-task-inline-actions">
            <button type="button" class="button" id="audio-lab-transcript-import">Import .txt/.vtt/.srt</button>
            <button type="button" class="button button--primary" id="audio-lab-transcript-save">Save transcript</button>
          </div>
        </div>
        <textarea id="audio-lab-transcript-text" class="audio-lab-transcript-editor" placeholder="Automatic transcript output and human corrections go here.">${escapeHtml(transcript.text || '')}</textarea>
        <input id="audio-lab-transcript-file" type="file" accept=".txt,.vtt,.srt,text/plain,text/vtt" hidden />
      </article>
      <aside class="audio-lab-task-card audio-lab-auto-transcribe-card">
        <p class="audio-lab-eyebrow">Automatic transcript</p>
        <h2>Descript-style first pass</h2>
        <p>This generates a full editable transcript from the rendered episode audio when available, otherwise from the selected/source audio. Manual typing is now demoted to correction, as decency requires.</p>
        <dl class="audio-lab-task-facts">
          <div><dt>Source</dt><dd>${escapeHtml(source?.label || 'none')}</dd></div>
          <div><dt>Current cues</dt><dd>${transcript.cues?.length || 0}</dd></div>
          <div><dt>Engine</dt><dd>${escapeHtml(transcript.engine || transcript.provider || 'not generated yet')}</dd></div>
          <div><dt>Generated</dt><dd>${escapeHtml(transcript.generatedAt || transcript.updatedAt || 'never')}</dd></div>
        </dl>
        <label class="audio-lab-task-field"><span>Language hint</span><input id="audio-lab-transcript-language" placeholder="optional, e.g. en" value="${escapeHtml(transcript.language || '')}" /></label>
        <button type="button" class="button button--primary audio-lab-transcribe-button" id="audio-lab-transcribe-run" ${source ? '' : 'disabled'}>Auto transcribe audio</button>
        <p id="audio-lab-transcript-status" class="description">${source ? 'Ready to transcribe. Rendered episode audio is preferred.' : 'No audio source available yet.'}</p>
        <div class="audio-lab-transcript-preview">
          <h3>Timestamped cues</h3>
          ${cuesSummary(transcript.cues || [])}
        </div>
      </aside>
    </section>
  `
  attachProjectSelect()
  const textarea = shell.querySelector('#audio-lab-transcript-text')
  shell.querySelector('#audio-lab-transcript-save')?.addEventListener('click', async () => {
    await saveAudioLabProject({
      ...project,
      transcript: {
        ...(project.transcript || {}),
        mode: (project.transcript?.cues || []).length ? 'timestamped' : 'plain',
        text: textarea.value,
        updatedAt: new Date().toISOString(),
      },
    })
    toast(shell, 'Transcript saved.')
  })
  const fileInput = shell.querySelector('#audio-lab-transcript-file')
  shell.querySelector('#audio-lab-transcript-import')?.addEventListener('click', () => fileInput?.click())
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    textarea.value = await file.text()
    toast(shell, `Imported ${file.name}. Save when ready.`)
  })
  shell.querySelector('#audio-lab-transcribe-run')?.addEventListener('click', () => runAutoTranscription({ shell, project, textarea }))
}

function renderMarkers({ shell, project, projects }) {
  const markers = project.markers || []
  shell.innerHTML = `
    ${renderTaskHeader({ task: 'markers', project, projects })}
    <section class="audio-lab-task-card">
      <div class="audio-lab-task-card__header">
        <div><p class="audio-lab-eyebrow">Chapters</p><h2>Markers</h2></div>
        <button type="button" class="button button--primary" id="audio-lab-marker-add">Add marker</button>
      </div>
      <div class="audio-lab-marker-list">
        ${markers.length ? markers.map((marker, index) => `
          <div class="audio-lab-marker-row" data-marker-index="${index}">
            <input data-marker-field="time" type="number" step="0.01" min="0" value="${Number(marker.time || 0)}" aria-label="Marker time" />
            <input data-marker-field="title" value="${escapeHtml(marker.title || '')}" placeholder="Marker title" aria-label="Marker title" />
            <input data-marker-field="note" value="${escapeHtml(marker.note || '')}" placeholder="Note" aria-label="Marker note" />
            <button type="button" class="button" data-marker-delete="${index}">Delete</button>
          </div>
        `).join('') : '<p class="description">No markers yet.</p>'}
      </div>
      <div class="audio-lab-task-footer"><button type="button" class="button button--primary" id="audio-lab-markers-save">Save markers</button></div>
    </section>
  `
  attachProjectSelect()
  const collect = () => Array.from(shell.querySelectorAll('.audio-lab-marker-row')).map((row) => ({
    id: project.markers?.[Number(row.dataset.markerIndex)]?.id || makeAudioLabId('marker'),
    time: Math.max(0, Number(row.querySelector('[data-marker-field="time"]')?.value || 0)),
    title: row.querySelector('[data-marker-field="title"]')?.value || 'Marker',
    note: row.querySelector('[data-marker-field="note"]')?.value || '',
    createdAt: project.markers?.[Number(row.dataset.markerIndex)]?.createdAt || new Date().toISOString(),
  }))
  shell.querySelector('#audio-lab-marker-add')?.addEventListener('click', async () => {
    await saveAudioLabProject({ ...project, markers: [...markers, { id: makeAudioLabId('marker'), time: 0, title: `Marker ${markers.length + 1}`, note: '', createdAt: new Date().toISOString() }] })
    renderTaskPage()
  })
  shell.querySelectorAll('[data-marker-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      const index = Number(button.dataset.markerDelete)
      await saveAudioLabProject({ ...project, markers: markers.filter((_, itemIndex) => itemIndex !== index) })
      renderTaskPage()
    })
  })
  shell.querySelector('#audio-lab-markers-save')?.addEventListener('click', async () => {
    await saveAudioLabProject({ ...project, markers: collect() })
    toast(shell, 'Markers saved.')
  })
}

function renderMetadata({ shell, project, projects }) {
  const episode = project.episode || {}
  shell.innerHTML = `
    ${renderTaskHeader({ task: 'metadata', project, projects })}
    <section class="audio-lab-task-card audio-lab-metadata-form">
      <p class="audio-lab-eyebrow">Episode metadata</p>
      <h2>Podcast fields</h2>
      <label><span>Episode title</span><input id="episode-title" value="${escapeHtml(episode.title || project.title || '')}" /></label>
      <label><span>Slug</span><input id="episode-slug" value="${escapeHtml(episode.slug || '')}" /></label>
      <label><span>Description / show notes</span><textarea id="episode-description">${escapeHtml(episode.description || '')}</textarea></label>
      <div class="audio-lab-task-two-col">
        <label><span>Credits</span><input id="episode-credits" value="${escapeHtml(episode.credits || '')}" /></label>
        <label><span>License</span><input id="episode-license" value="${escapeHtml(episode.license || '')}" /></label>
        <label><span>Season</span><input id="episode-season" value="${escapeHtml(episode.season || '')}" /></label>
        <label><span>Episode number</span><input id="episode-number" value="${escapeHtml(episode.episodeNumber || '')}" /></label>
      </div>
      <label class="audio-lab-task-checkbox"><input id="episode-explicit" type="checkbox" ${episode.explicit ? 'checked' : ''} /> Explicit</label>
      <div class="audio-lab-task-footer"><button type="button" class="button button--primary" id="episode-save">Save metadata</button></div>
    </section>
  `
  attachProjectSelect()
  shell.querySelector('#episode-save')?.addEventListener('click', async () => {
    const title = shell.querySelector('#episode-title')?.value || project.title
    const slug = shell.querySelector('#episode-slug')?.value || slugifyAudioLab(title)
    await saveAudioLabProject({
      ...project,
      episode: {
        ...episode,
        title,
        slug,
        description: shell.querySelector('#episode-description')?.value || '',
        credits: shell.querySelector('#episode-credits')?.value || '',
        license: shell.querySelector('#episode-license')?.value || '',
        season: shell.querySelector('#episode-season')?.value || '',
        episodeNumber: shell.querySelector('#episode-number')?.value || '',
        explicit: Boolean(shell.querySelector('#episode-explicit')?.checked),
        updatedAt: new Date().toISOString(),
      },
    })
    toast(shell, 'Episode metadata saved.')
  })
}

function renderPublish({ shell, project, projects }) {
  const rendered = project.renderedEpisode || {}
  const publicUrl = getPublicAudioUrl(rendered)
  shell.innerHTML = `
    ${renderTaskHeader({ task: 'publish', project, projects })}
    <section class="audio-lab-task-grid">
      <article class="audio-lab-task-card">
        <p class="audio-lab-eyebrow">Publishing status</p>
        <h2>${publicUrl ? 'Public audio ready' : 'No public audio yet'}</h2>
        <dl class="audio-lab-task-facts">
          <div><dt>Rendered</dt><dd>${rendered ? 'yes' : 'no'}</dd></div>
          <div><dt>Status</dt><dd>${escapeHtml(rendered.status || 'local only')}</dd></div>
          <div><dt>Preferred MIME</dt><dd>${escapeHtml(rendered.preferredMimeType || rendered.mimeType || '')}</dd></div>
          <div><dt>Size</dt><dd>${rendered.preferredFileSize || rendered.size || 0} bytes</dd></div>
          <div><dt>Duration</dt><dd>${formatAudioLabDuration(rendered.duration || 0)}</dd></div>
        </dl>
        ${publicUrl ? `<p><a href="${escapeHtml(publicUrl)}" target="_blank" rel="noreferrer">Open public audio URL</a></p>` : '<p class="description">Render and upload from the editor, then this page becomes feed-ready. Publishing buttons stay in the editor because they depend on the rendered buffer.</p>'}
      </article>
      <article class="audio-lab-task-card">
        <p class="audio-lab-eyebrow">RSS readiness</p>
        <h2>Feed checklist</h2>
        <ul class="audio-lab-task-checklist">
          <li class="${project.episode?.title ? 'ok' : 'bad'}">Episode title</li>
          <li class="${project.episode?.description ? 'ok' : 'bad'}">Description / show notes</li>
          <li class="${publicUrl ? 'ok' : 'bad'}">Public audio URL</li>
          <li class="${rendered.preferredMimeType || rendered.mimeType ? 'ok' : 'bad'}">MIME type</li>
          <li class="${rendered.preferredFileSize || rendered.size ? 'ok' : 'bad'}">File size</li>
          <li class="${project.transcript?.text ? 'ok' : 'bad'}">Transcript</li>
        </ul>
      </article>
    </section>
  `
  attachProjectSelect()
}

function renderEffects({ shell, project, projects }) {
  const effects = project.effects || []
  shell.innerHTML = `
    ${renderTaskHeader({ task: 'effects', project, projects })}
    <section class="audio-lab-task-card">
      <p class="audio-lab-eyebrow">Effects rack</p>
      <h2>Current chain</h2>
      ${effects.length ? `<ol class="audio-lab-task-list">${effects.map((effect) => `<li><strong>${escapeHtml(effect.type)}</strong> <span>${escapeHtml(effect.scope)} ${effect.enabled === false ? '(bypassed)' : ''}</span></li>`).join('')}</ol>` : '<p class="description">No effects yet.</p>'}
      <p class="description">Detailed clip/track-scoped effect editing still belongs beside the waveform for now. This page keeps the chain readable without stealing editor space.</p>
    </section>
  `
  attachProjectSelect()
}

function renderSources({ shell, project, projects }) {
  const sources = project.sourceAssets || []
  shell.innerHTML = `
    ${renderTaskHeader({ task: 'sources', project, projects })}
    <section class="audio-lab-task-card">
      <p class="audio-lab-eyebrow">Source assets</p>
      <h2>Preserved audio sources</h2>
      ${sources.length ? `<div class="audio-lab-source-table">${sources.map((asset) => `<div><strong>${escapeHtml(asset.filename)}</strong><span>${formatAudioLabDuration(asset.duration)} · ${escapeHtml(asset.mimeType)} · ${Number(asset.size || 0)} bytes</span></div>`).join('')}</div>` : '<p class="description">No sources yet.</p>'}
    </section>
  `
  attachProjectSelect()
}

function toast(shell, message) {
  let note = shell.querySelector('.audio-lab-task-toast')
  if (!note) {
    note = document.createElement('div')
    note.className = 'audio-lab-task-toast'
    shell.appendChild(note)
  }
  note.textContent = message
  note.classList.add('is-visible')
  window.clearTimeout(toast.timer)
  toast.timer = window.setTimeout(() => note.classList.remove('is-visible'), 1600)
}

export async function renderTaskPage() {
  if (!isAudioLabRoute()) return
  const root = page()
  if (!root) return
  const task = currentSearch().get('task') || ''
  const { projects, project } = await getActiveProject()
  syncEditorNav(project?.id || '')
  setTaskState(task)
  const existing = root.querySelector('.audio-lab-task-shell')
  if (!task) {
    existing?.remove()
    return
  }
  const shell = ensureTaskShell(root)
  if (!project) {
    renderEmpty(shell)
    return
  }
  if (task === 'transcript') renderTranscript({ shell, project, projects })
  else if (task === 'markers') renderMarkers({ shell, project, projects })
  else if (task === 'metadata') renderMetadata({ shell, project, projects })
  else if (task === 'effects') renderEffects({ shell, project, projects })
  else if (task === 'sources') renderSources({ shell, project, projects })
  else renderPublish({ shell, project, projects })
}

window.addEventListener('load', renderTaskPage)
window.addEventListener('popstate', () => window.setTimeout(renderTaskPage, 80))
window.addEventListener('audiolab-task-navigation', () => window.setTimeout(renderTaskPage, 20))
window.setInterval(() => {
  if (!isAudioLabRoute()) return
  const root = page()
  if (!root?.querySelector('.audio-lab-workflow-nav')) renderTaskPage()
}, 1200)
window.setTimeout(renderTaskPage, 250)
