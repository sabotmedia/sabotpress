import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminFrame } from './AdminRail'
import { DEFAULT_FEED_SETTINGS, loadFeedSettingsAsync, resetFeedSettings, saveFeedSettings } from '../lib/feedSettings'
import { downloadFeedManifest, loadFeedManifest } from '../lib/feedManifestApi'
import { adminRoutes } from '../routing/routes'

const KINDS = [
  ['format', 'Formats', 'Formats are broad reading lanes like article, podcast, comic, newsletter, zine, print, or audio.'],
  ['project', 'Projects', 'Projects are public buckets used to browse bodies of work. Imported categories may need cleanup here.'],
  ['collection', 'Collections', 'Collections are curated bodies of work, campaigns, issues, or publication packages.'],
  ['author', 'Public byline labels', 'Bylines are public labels only. Use handles, collectives, pseudonyms, or house names. Never expose a legal name unless that is intentional.'],
  ['topic', 'Topics', 'Topics are subject tags readers can follow across formats and projects.'],
  ['series', 'Series', 'Series are recurring lines of work, columns, comics, newsletters, or podcasts.'],
]

function listToText(value = []) {
  return Array.isArray(value) ? value.join('\n') : ''
}

function textToList(value = '') {
  return String(value || '').split(/\n|,/).map((item) => item.trim()).filter(Boolean)
}

function aliasesToText(value = {}) {
  return Object.entries(value || {}).map(([from, to]) => `${from} => ${to}`).join('\n')
}

function textToAliases(value = '') {
  const next = {}
  for (const line of String(value || '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [from, ...rest] = trimmed.split(/=>|→/)
    const key = String(from || '').trim()
    const target = rest.join('=>').trim()
    if (key && target) next[key] = target
  }
  return next
}

function displayDate(value) {
  const date = new Date(String(value || ''))
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '—'
}

export function FeedSettingsAdminPage() {
  const [settings, setSettings] = useState(DEFAULT_FEED_SETTINGS)
  const [manifest, setManifest] = useState(null)
  const [state, setState] = useState('loading')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [manifestError, setManifestError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function boot() {
      setState('loading')
      setError('')
      setManifestError('')
      const [settingsResult, manifestResult] = await Promise.allSettled([
        loadFeedSettingsAsync(),
        loadFeedManifest(),
      ])
      if (cancelled) return

      if (settingsResult.status === 'fulfilled') setSettings(settingsResult.value)
      else setError(String(settingsResult.reason?.message || settingsResult.reason))

      if (manifestResult.status === 'fulfilled') setManifest(manifestResult.value)
      else setManifestError(String(manifestResult.reason?.message || manifestResult.reason))

      setState(settingsResult.status === 'fulfilled' ? 'loaded' : 'error')
    }
    boot()
    return () => { cancelled = true }
  }, [])

  function updateField(field, value) {
    setSettings((current) => ({ ...current, [field]: value }))
  }

  function updateAlias(kind, value) {
    setSettings((current) => ({
      ...current,
      aliases: { ...(current.aliases || {}), [kind]: textToAliases(value) },
    }))
  }

  function updateHidden(kind, value) {
    setSettings((current) => ({
      ...current,
      hiddenTerms: { ...(current.hiddenTerms || {}), [kind]: textToList(value) },
    }))
  }

  async function refreshManifest() {
    try {
      setManifestError('')
      const next = await loadFeedManifest()
      setManifest(next)
      return next
    } catch (err) {
      setManifestError(String(err?.message || err))
      return null
    }
  }

  async function save() {
    try {
      setState('saving')
      setError('')
      setStatus('')
      const next = await saveFeedSettings(settings)
      setSettings(next)
      await refreshManifest()
      setState('loaded')
      setStatus('Feed settings saved to the production database. The live server manifest has been refreshed.')
    } catch (err) {
      setState('error')
      setError(String(err?.message || err))
    }
  }

  async function reset() {
    try {
      setState('saving')
      setError('')
      setStatus('')
      const next = await resetFeedSettings()
      setSettings(next)
      await refreshManifest()
      setState('loaded')
      setStatus('Feed settings reset to defaults in the production database. The live server manifest has been refreshed.')
    } catch (err) {
      setState('error')
      setError(String(err?.message || err))
    }
  }

  const disabled = state === 'loading' || state === 'saving'
  const liveFiles = Array.isArray(manifest?.files) ? manifest.files : []
  const podcastShows = Array.isArray(manifest?.podcastShows) ? manifest.podcastShows : []
  const podcastDefaultAlias = String(manifest?.podcastDefaultAlias || '')
  const unassignedPodcastItems = Number(manifest?.unassignedPodcastItemCount || 0)

  return (
    <AdminFrame>
      <main className="page wp-admin-screen feeds-admin-page">
        <div className="wp-screen-header">
          <div>
            <h1>Feeds & Syndication</h1>
            <p className="description">Manage site-wide RSS discovery, taxonomy feeds, aliases, privacy-safe public labels, and the public feed directory. Podcast show identity and imports live in Podcasts; this page discovers and publishes those show feeds alongside the rest of Sabot's syndication endpoints.</p>
          </div>
          <div className="review-card__actions">
            <a className="button" href="/feeds" target="_blank" rel="noreferrer">Open Public Feeds</a>
            <button className="button" type="button" onClick={reset} disabled={disabled}>Reset</button>
            <button className="button button--primary" type="button" onClick={save} disabled={disabled}>Save Feed Settings</button>
          </div>
        </div>

        {state === 'loading' ? <div className="notice notice-info" role="status"><p>Loading feed settings and live feed manifest…</p></div> : null}
        {error ? <div className="notice notice-error" role="alert"><p><strong>Feed settings error:</strong> {error}</p></div> : null}
        {manifestError ? <div className="notice notice-error" role="alert"><p><strong>Live feed manifest error:</strong> {manifestError}</p></div> : null}
        {status ? <div className="notice notice-success" role="status"><p>{status}</p></div> : null}
        {unassignedPodcastItems > 0 ? (
          <div className="notice notice-warning" role="alert">
            <p><strong>{unassignedPodcastItems} public podcast episode{unassignedPodcastItems === 1 ? '' : 's'} are not assigned to a podcast show.</strong> <Link to={adminRoutes.podcasts}>Open Podcasts</Link> to repair the show assignment before relying on podcast-directory feeds.</p>
          </div>
        ) : null}

        <section className="wp-meta-box">
          <h2>What belongs here, and what belongs in Podcasts?</h2>
          <p className="description"><strong>Feeds & Syndication</strong> controls website-content RSS: the everything feed plus feeds by format, project, collection, topic, series, and public byline. It also owns the public <code>/feeds</code> directory and the server manifest used to verify which endpoints are actually live.</p>
          <p className="description"><strong>Podcasts</strong> controls each podcast as a show: title, artwork, directory metadata, source RSS import/resync, episode membership, and its directory-grade RSS feed with audio enclosures and podcast metadata. The two systems share the same D1 content records and manifest, but they do not overwrite each other's settings.</p>
          <p className="description">A generic <code>/feeds/formats/podcast.xml</code> feed may exist as a reading/syndication lane containing podcast posts from every show. It is intentionally different from a show feed such as <code>/feeds/podcasts/molotov-now.xml</code>, which is the feed intended for podcast apps and directories.</p>
        </section>

        <section className="wp-meta-box">
          <h2>Live feed status</h2>
          <div className="newsroom-stat-grid">
            <article className="review-summary-card"><div className="review-summary-card__eyebrow">published records</div><strong>{Number(manifest?.itemCount || 0)}</strong><span>eligible for website feed generation</span></article>
            <article className="review-summary-card"><div className="review-summary-card__eyebrow">live endpoints</div><strong>{liveFiles.length}</strong><span>server-confirmed RSS URLs</span></article>
            <article className="review-summary-card"><div className="review-summary-card__eyebrow">podcast shows</div><strong>{Number(manifest?.podcastShowCount || 0)}</strong><span>separate directory-grade feeds</span></article>
            <article className="review-summary-card"><div className="review-summary-card__eyebrow">podcast episodes</div><strong>{Number(manifest?.podcastItemCount || 0)}</strong><span>public episodes with audio enclosures</span></article>
          </div>
          <div className="review-card__actions">
            <button className="button" type="button" onClick={refreshManifest}>Refresh live manifest</button>
            <a className="button" href="/feeds/all-content.xml" target="_blank" rel="noreferrer">Open main RSS</a>
            {podcastDefaultAlias ? <a className="button" href={`/feeds/${podcastDefaultAlias}`} target="_blank" rel="noreferrer">Open legacy/default podcast alias</a> : null}
          </div>
        </section>

        <section className="wp-meta-box">
          <div className="wp-screen-header">
            <div>
              <h2>Podcast syndication</h2>
              <p className="description">Read-only here by design. Add, import, resync, or edit a show in Podcasts; the syndication manifest then exposes its canonical feed automatically.</p>
            </div>
            <div className="review-card__actions">
              <Link className="button" to={adminRoutes.podcasts}>Open Podcasts</Link>
              <Link className="button button--primary" to={`${adminRoutes.podcastSettings}?new=1`}>Add Podcast</Link>
            </div>
          </div>
          <div className="wp-list-table-wrap">
            <table className="content-table wp-posts-table">
              <thead><tr><th>Show</th><th>Episodes</th><th>Source RSS</th><th>Sabot RSS</th><th>Last synced</th><th>Actions</th></tr></thead>
              <tbody>
                {podcastShows.length ? podcastShows.map((show) => (
                  <tr key={show.id || show.slug}>
                    <td><strong>{show.title || show.slug}</strong>{show.isDefault ? <div className="description">Default show for the legacy <code>/feeds/podcasts/all.xml</code> alias</div> : null}</td>
                    <td>{Number(show.episodeCount || 0)}</td>
                    <td>{show.sourceFeedUrl ? <a href={show.sourceFeedUrl} target="_blank" rel="noreferrer">Source feed</a> : '—'}</td>
                    <td><a href={`/feeds/${show.feedPath}`} target="_blank" rel="noreferrer"><code>/feeds/{show.feedPath}</code></a></td>
                    <td>{displayDate(show.sourceFeedLastSyncedAt)}</td>
                    <td><Link to={`${adminRoutes.podcastSettings}?show=${encodeURIComponent(show.id || show.slug)}`}>Manage show</Link></td>
                  </tr>
                )) : <tr><td colSpan={6}>No podcast shows are registered. Add a podcast to create its own feed.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="wp-meta-box">
          <h2>Public feeds page</h2>
          <p className="description">These fields change the human-readable explanation at <code>/feeds</code>. They do not change podcast titles, artwork, episode membership, or podcast-directory metadata.</p>
          <div className="wp-settings-form">
            <label><span>Page title</span><input value={settings.feedsIntroTitle || ''} onChange={(event) => updateField('feedsIntroTitle', event.target.value)} /></label>
            <label><span>Intro copy</span><textarea rows={11} value={settings.feedsIntroBody || ''} onChange={(event) => updateField('feedsIntroBody', event.target.value)} /></label>
          </div>
        </section>

        <section className="wp-meta-box">
          <h2>Enabled website-content feed groups</h2>
          <div className="feed-toggle-grid">
            {[
              ['exposeMainFeed', 'Everything'], ['exposeFormatFeeds', 'Formats'], ['exposeProjectFeeds', 'Projects'],
              ['exposeCollectionFeeds', 'Collections'], ['exposeAuthorFeeds', 'Public byline labels'],
              ['exposeTopicFeeds', 'Topics'], ['exposeSeriesFeeds', 'Series'],
            ].map(([field, label]) => (
              <label key={field} className="native-content-editor__check">
                <input type="checkbox" checked={settings[field] !== false} onChange={(event) => updateField(field, event.target.checked)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <p className="description">These toggles affect generic website-content feeds only. Podcast show feeds and published campaign feeds are first-class feeds managed by their own subsystems and remain discoverable through the manifest.</p>
        </section>

        {KINDS.map(([kind, label, help]) => (
          <section className="wp-meta-box" key={kind}>
            <h2>{label}</h2>
            <p className="description">{help}</p>
            <p className="description">Use one alias per line, like <code>old label =&gt; new label</code>. Hide wrong/imported terms by listing them below.</p>
            <div className="feed-taxonomy-grid">
              <label><span>Aliases</span><textarea rows={6} value={aliasesToText(settings.aliases?.[kind])} onChange={(event) => updateAlias(kind, event.target.value)} /></label>
              <label><span>Hidden terms</span><textarea rows={6} value={listToText(settings.hiddenTerms?.[kind])} onChange={(event) => updateHidden(kind, event.target.value)} /></label>
              <div className="feed-term-preview">
                <strong>Server-detected terms</strong>
                <div>{(manifest?.terms?.[kind] || []).slice(0, 80).map((term) => <span key={term}>{term}</span>)}</div>
                {!(manifest?.terms?.[kind] || []).length ? <p className="description">No live terms detected.</p> : null}
              </div>
            </div>
          </section>
        ))}

        <section className="wp-meta-box">
          <h2>Diagnostics & export</h2>
          <p className="description">Podcast directories and RSS readers use the live XML URLs, not the manifest JSON. The JSON export is a snapshot for debugging, archiving, or external tooling and now includes podcast-show and campaign-feed metadata so the syndication inventory can be audited in one place.</p>
          <div className="review-card__actions">
            <button className="button" type="button" onClick={() => downloadFeedManifest(manifest)} disabled={!manifest}>Download feed manifest (JSON)</button>
          </div>
          {liveFiles.length ? <details><summary>Show live endpoint paths</summary><ul>{liveFiles.slice(0, 200).map((file) => <li key={file}><a href={`/feeds/${file}`} target="_blank" rel="noreferrer"><code>/feeds/{file}</code></a></li>)}</ul></details> : null}
        </section>
      </main>
    </AdminFrame>
  )
}
