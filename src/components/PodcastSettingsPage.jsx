import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AdminFrame } from './AdminRail'
import { importPodcastFeed, previewPodcastFeed, syncPodcastFeed } from '../lib/podcastImportApi'
import { loadPodcastSettings, loadPodcastShowsAsync, savePodcastSettings } from '../lib/podcastSettings'
import { adminRoutes } from '../routing/routes'

const IMPORT_BATCH_LIMIT = 250

export function PodcastSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedShow = String(searchParams.get('show') || '').trim()
  const creatingNew = searchParams.get('new') === '1'
  const [settings, setSettings] = useState(() => loadPodcastSettings())
  const [shows, setShows] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importState, setImportState] = useState('idle')
  const [importError, setImportError] = useState('')
  const [preview, setPreview] = useState(null)
  const [selectedKeys, setSelectedKeys] = useState(() => new Set())
  const [importChannelSettings, setImportChannelSettings] = useState(true)
  const [importNotice, setImportNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    setState('loading')
    setError('')
    setSaved(false)
    setPreview(null)
    setSelectedKeys(new Set())

    loadPodcastShowsAsync()
      .then((loaded) => {
        if (cancelled) return
        setShows(loaded.shows || [])
        if (creatingNew) {
          const blank = loadPodcastSettings()
          setSettings(blank)
          setImportUrl('')
        } else {
          const selected = (loaded.shows || []).find((show) => show.id === requestedShow || show.slug === requestedShow)
            || (loaded.shows || []).find((show) => show.id === loaded.defaultShowId)
            || loaded.shows?.[0]
            || loadPodcastSettings()
          setSettings(selected)
          setImportUrl(selected.sourceFeedUrl || '')
        }
        setState('loaded')
      })
      .catch((err) => {
        if (cancelled) return
        setError(String(err?.message || err))
        setState('error')
      })
    return () => { cancelled = true }
  }, [requestedShow, creatingNew])

  const selectedCount = selectedKeys.size
  const newCount = useMemo(() => preview?.episodes?.filter((episode) => !episode.alreadyImported).length || 0, [preview])
  const activeShowId = settings.id || requestedShow || ''

  function update(field, value) {
    setSettings((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  async function onSave() {
    if (!String(settings.podcastTitle || '').trim()) {
      setError('Podcast title is required before saving a new show.')
      return
    }
    try {
      setState('saving')
      setError('')
      const result = await savePodcastSettings(settings, activeShowId)
      setSettings(result.show)
      setShows(result.shows)
      setImportUrl(result.show.sourceFeedUrl || importUrl)
      setSearchParams({ show: result.show.id })
      setSaved(true)
      setState('loaded')
    } catch (err) {
      setError(String(err?.message || err))
      setState('error')
    }
  }

  async function previewFeed(url = importUrl, showId = activeShowId) {
    const source = String(url || '').trim()
    if (!source) {
      setImportError('Paste the current podcast RSS feed URL first.')
      return
    }
    try {
      setImportState('previewing')
      setImportError('')
      setImportNotice('')
      const data = await previewPodcastFeed(source, showId)
      setPreview(data)
      setImportUrl(data.sourceUrl || source)
      const defaultSelection = data.episodes
        .filter((episode) => !episode.alreadyImported)
        .slice(0, IMPORT_BATCH_LIMIT)
        .map((episode) => episode.key)
      setSelectedKeys(new Set(defaultSelection.length ? defaultSelection : data.episodes.slice(0, IMPORT_BATCH_LIMIT).map((episode) => episode.key)))
      setImportState('ready')
    } catch (err) {
      setImportError(String(err?.message || err))
      setImportState('error')
    }
  }

  async function runImport(mode) {
    if (!preview) return
    const selected = [...selectedKeys]
    if (!selected.length) {
      setImportError('Select at least one episode.')
      return
    }
    if (selected.length > IMPORT_BATCH_LIMIT) {
      setImportError(`Select no more than ${IMPORT_BATCH_LIMIT} episodes for one import batch.`)
      return
    }
    try {
      setImportState('importing')
      setImportError('')
      setImportNotice('')
      const payload = {
        feedUrl: importUrl,
        showId: activeShowId,
        selectedKeys: selected,
        importChannelSettings,
      }
      const data = mode === 'sync'
        ? await syncPodcastFeed(payload)
        : await importPodcastFeed({ ...payload, syncExisting: false })
      const summary = data.result || {}
      const nextShow = data.show || data.settings
      setImportNotice(`${mode === 'sync' ? 'Sync' : 'Import'} complete for ${nextShow?.podcastTitle || 'this podcast'}: ${summary.created || 0} created, ${summary.updated || 0} updated, ${summary.skipped || 0} skipped.`)
      if (nextShow) {
        setSettings(nextShow)
        setShows(Array.isArray(data.shows) ? data.shows : shows)
        setImportUrl(nextShow.sourceFeedUrl || importUrl)
        setSearchParams({ show: nextShow.id })
        await previewFeed(nextShow.sourceFeedUrl || importUrl, nextShow.id)
      }
      setImportState('ready')
    } catch (err) {
      setImportError(String(err?.message || err))
      setImportState('error')
    }
  }

  function toggleEpisode(key) {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectEpisodes(kind) {
    const episodes = preview?.episodes || []
    if (kind === 'none') return setSelectedKeys(new Set())
    const filtered = kind === 'new' ? episodes.filter((episode) => !episode.alreadyImported) : episodes
    setSelectedKeys(new Set(filtered.slice(0, IMPORT_BATCH_LIMIT).map((episode) => episode.key)))
  }

  return (
    <AdminFrame>
      <main className="page wp-admin-screen">
        <div className="wp-screen-header">
          <div>
            <h1>{creatingNew && !settings.id ? 'Add Podcast' : `${settings.podcastTitle || 'Podcast'} Settings`}</h1>
            <p className="description">A podcast is a show-level container. Its RSS source, metadata, imported episodes, and outgoing Sabot RSS feed stay separate from every other podcast.</p>
          </div>
          <div className="review-card__actions">
            <Link className="button" to={adminRoutes.podcasts}>Back to Podcasts</Link>
            {settings.rssFeedUrl ? <a className="button" href={settings.rssFeedUrl} target="_blank" rel="noreferrer">Open This Show's RSS Feed</a> : null}
            <button className="button button--primary" type="button" onClick={onSave} disabled={state === 'loading' || state === 'saving'}>
              {state === 'saving' ? 'Saving…' : settings.id ? 'Save Podcast Settings' : 'Create Podcast'}
            </button>
          </div>
        </div>

        {shows.length > 1 && !creatingNew ? (
          <div className="notice notice-info"><p><strong>Editing one show:</strong> {settings.podcastTitle}. Return to <Link to={adminRoutes.podcasts}>Podcasts</Link> to manage the others.</p></div>
        ) : null}
        {error ? <div className="notice notice-error" role="alert"><p><strong>Podcast settings error:</strong> {error}</p></div> : null}
        {saved ? <div className="notice notice-success" role="status"><p>Podcast settings saved to the production database.</p></div> : null}

        <section className="wp-meta-box">
          <h2>{settings.id ? 'Import or synchronize this podcast RSS feed' : 'Create this podcast from an RSS feed'}</h2>
          <p className="description">Paste this show's current RSS feed. On a new podcast, the first import creates the show and gives it its own Sabot RSS URL. On an existing podcast, imports and resyncs remain scoped to this show only.</p>
          <div className="wp-settings-form">
            <label>
              <span>Current / source RSS feed URL</span>
              <input type="url" value={importUrl} onChange={(event) => setImportUrl(event.target.value)} placeholder="https://current-host.example/show/rss" />
              <small>This source belongs to this podcast only. Adding a different podcast should start from Add Podcast instead of replacing this URL.</small>
            </label>
          </div>
          <div className="review-card__actions">
            <button className="button button--primary" type="button" onClick={() => previewFeed()} disabled={importState === 'previewing' || importState === 'importing'}>{importState === 'previewing' ? 'Fetching feed…' : 'Preview source feed'}</button>
            {settings.sourceFeedUrl ? <button className="button" type="button" onClick={() => previewFeed(settings.sourceFeedUrl)} disabled={importState === 'previewing' || importState === 'importing'}>Refresh saved source</button> : null}
          </div>
          {settings.sourceFeedLastSyncedAt ? <p className="description">Last successful source sync: {new Date(settings.sourceFeedLastSyncedAt).toLocaleString()}</p> : null}
          {importError ? <div className="notice notice-error" role="alert"><p><strong>RSS import error:</strong> {importError}</p></div> : null}
          {importNotice ? <div className="notice notice-success" role="status"><p>{importNotice}</p></div> : null}
        </section>

        {preview ? (
          <section className="wp-meta-box">
            <div className="wp-screen-header">
              <div>
                <h2>{preview.podcast?.title || 'Source podcast'}</h2>
                <p className="description">{preview.counts?.total || 0} episodes found · {newCount} new · {preview.counts?.existing || 0} already imported for this show.</p>
              </div>
              <div className="review-card__actions">
                <button className="button" type="button" onClick={() => selectEpisodes('new')}>Select new</button>
                <button className="button" type="button" onClick={() => selectEpisodes('all')}>Select first {Math.min(IMPORT_BATCH_LIMIT, preview.episodes.length)}</button>
                <button className="button" type="button" onClick={() => selectEpisodes('none')}>Clear</button>
              </div>
            </div>
            <p className="description">One request can import or resync up to {IMPORT_BATCH_LIMIT} episodes. Large archives can be moved in repeated batches without creating duplicates.</p>
            <label className="native-content-editor__check">
              <input type="checkbox" checked={importChannelSettings} onChange={(event) => setImportChannelSettings(event.target.checked)} />
              <span>Import/update this show's title, description, author, artwork, language, category, owner information, and explicit status</span>
            </label>
            <div className="review-card__actions">
              <button className="button button--primary" type="button" onClick={() => runImport('import')} disabled={importState === 'importing' || !selectedCount}>{importState === 'importing' ? 'Working…' : `Import selected (${selectedCount})`}</button>
              {settings.id ? <button className="button" type="button" onClick={() => runImport('sync')} disabled={importState === 'importing' || !selectedCount}>Resync selected</button> : null}
            </div>
            <div className="wp-list-table-wrap">
              <table className="wp-list-table widefat striped">
                <thead><tr><th>Select</th><th>Episode</th><th>Published</th><th>Audio</th><th>Status</th></tr></thead>
                <tbody>
                  {preview.episodes.map((episode) => (
                    <tr key={episode.key}>
                      <td><input type="checkbox" checked={selectedKeys.has(episode.key)} onChange={() => toggleEpisode(episode.key)} aria-label={`Select ${episode.title}`} /></td>
                      <td><strong>{episode.title}</strong>{episode.episodeNumber ? <div className="description">Episode {episode.episodeNumber}{episode.season ? ` · Season ${episode.season}` : ''}</div> : null}</td>
                      <td>{episode.publishedAt ? new Date(episode.publishedAt).toLocaleDateString() : 'unknown'}</td>
                      <td>{episode.enclosureUrl ? <a href={episode.enclosureUrl} target="_blank" rel="noreferrer">enclosure</a> : <span className="description">missing</span>}</td>
                      <td>{episode.alreadyImported ? 'Already imported in this show' : 'New'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="wp-meta-box">
          <h2>Feed identity</h2>
          <div className="wp-settings-form">
            <label>
              <span>Canonical Sabot RSS feed URL</span>
              <input type="text" value={settings.rssFeedUrl || 'Created after the podcast is saved or imported'} readOnly />
              <small>Each podcast gets a separate URL such as /feeds/podcasts/molotov-now.xml. This is the URL to submit to podcast directories.</small>
            </label>
            <label><span>Podcast title</span><input value={settings.podcastTitle} onChange={(e) => update('podcastTitle', e.target.value)} placeholder="Podcast title" /></label>
            <label><span>Author</span><input value={settings.author} onChange={(e) => update('author', e.target.value)} placeholder="SabotPress" /></label>
            <label><span>Description</span><textarea rows="4" value={settings.description} onChange={(e) => update('description', e.target.value)} placeholder="Describe the show for podcast directories." /></label>
            <label><span>Website URL</span><input type="url" value={settings.websiteUrl} onChange={(e) => update('websiteUrl', e.target.value)} placeholder="https://example.invalid" /></label>
            <label><span>Default cover art</span><input type="url" value={settings.defaultCoverArt} onChange={(e) => update('defaultCoverArt', e.target.value)} placeholder="https://…/podcast-cover.jpg" /></label>
          </div>
        </section>

        <section className="wp-meta-box">
          <h2>Directory metadata</h2>
          <div className="wp-settings-form">
            <label><span>Language</span><input value={settings.language} onChange={(e) => update('language', e.target.value)} placeholder="en-us" /></label>
            <label><span>Category</span><input value={settings.category} onChange={(e) => update('category', e.target.value)} placeholder="News" /></label>
            <label><span>Owner name</span><input value={settings.ownerName} onChange={(e) => update('ownerName', e.target.value)} autoComplete="name" /></label>
            <label><span>Owner email</span><input type="email" value={settings.ownerEmail} onChange={(e) => update('ownerEmail', e.target.value)} autoComplete="email" /><small>Podcast directories may expose or use this address for ownership verification.</small></label>
            <label><span>Audio host URL/base</span><input type="url" value={settings.audioHostBaseUrl} onChange={(e) => update('audioHostBaseUrl', e.target.value)} placeholder="https://media.sabot.media/podcasts/" /></label>
            <label><span><input type="checkbox" checked={Boolean(settings.explicit)} onChange={(e) => update('explicit', e.target.checked)} /> Explicit show</span></label>
          </div>
        </section>
      </main>
    </AdminFrame>
  )
}
