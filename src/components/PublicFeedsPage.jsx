import { useEffect, useMemo, useState } from 'react'
import { PublicationTopbar } from './PublicationTopbar'
import { PublicationFooter } from './PublicationFooter'
import { DEFAULT_FEED_SETTINGS, loadFeedSettingsAsync } from '../lib/feedSettings.js'
import { loadFeedManifest } from '../lib/feedManifestApi.js'
import { EditableText } from './EditableText'
import { EditableLink } from './EditableLink'

function groupFeedFiles(files = []) {
  return files.reduce((groups, file) => {
    const [group = 'other'] = file.split('/')
    groups[group] = groups[group] || []
    groups[group].push(file)
    return groups
  }, {})
}

function groupLabel(group) {
  const labels = {
    'all-content.xml': 'everything', formats: 'formats', projects: 'projects', collections: 'collections',
    bylines: 'public byline labels', authors: 'public byline labels', topics: 'topics', series: 'series',
    campaigns: 'campaigns',
  }
  return labels[group] || group.replace(/-/g, ' ')
}

function groupDescription(group) {
  const descriptions = {
    'all-content.xml': 'The broad live feed for published server-backed SabotPress content.',
    formats: 'Follow one kind of published website content, such as articles, comics, newsletters, print material, audio, or podcast posts.',
    projects: 'Follow work connected to a project or public organizing body.',
    collections: 'Follow curated bodies of work, campaigns, issues, readers, or publication packages.',
    bylines: 'Follow public byline labels. These may be collective names, pseudonyms, handles, or house labels.',
    authors: 'Follow public byline labels. These may be collective names, pseudonyms, handles, or house labels.',
    topics: 'Follow subjects across formats and projects.',
    series: 'Follow recurring columns, comics, newsletters, shows, or other serial work.',
    campaigns: 'Follow updates from a specific published campaign hub.',
  }
  return descriptions[group] || 'A live RSS feed generated from published server metadata.'
}

export function PublicFeedsPage() {
  const [settings, setSettings] = useState(DEFAULT_FEED_SETTINGS)
  const [files, setFiles] = useState([])
  const [podcastShows, setPodcastShows] = useState([])
  const [podcastDefaultAlias, setPodcastDefaultAlias] = useState('')
  const [state, setState] = useState('loading')
  const [errors, setErrors] = useState([])
  const [itemCount, setItemCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function boot() {
      setState('loading')
      setErrors([])
      const [settingsResult, manifestResult] = await Promise.allSettled([
        loadFeedSettingsAsync(),
        loadFeedManifest(),
      ])
      if (cancelled) return

      const nextErrors = []
      if (settingsResult.status === 'fulfilled') setSettings(settingsResult.value)
      else nextErrors.push(`Feed configuration: ${String(settingsResult.reason?.message || settingsResult.reason)}`)

      if (manifestResult.status === 'fulfilled') {
        setFiles(manifestResult.value.files)
        setPodcastShows(manifestResult.value.podcastShows || [])
        setPodcastDefaultAlias(String(manifestResult.value.podcastDefaultAlias || ''))
        setItemCount(Number(manifestResult.value.itemCount || 0))
      } else {
        setFiles([])
        setPodcastShows([])
        setPodcastDefaultAlias('')
        setItemCount(0)
        nextErrors.push(`Live feed endpoints: ${String(manifestResult.reason?.message || manifestResult.reason)}`)
      }

      setErrors(nextErrors)
      setState(nextErrors.length ? 'error' : 'loaded')
    }
    boot()
    return () => { cancelled = true }
  }, [])

  const grouped = useMemo(() => groupFeedFiles(files.filter((file) => !file.startsWith('podcasts/'))), [files])
  const mainFeedAvailable = files.includes('all-content.xml')

  return (
    <main className="page feeds-public-page">
      <PublicationTopbar />
      <section className="public-info-page__hero">
        <EditableText as="p" className="public-info-page__eyebrow" field="feeds.hero.eyebrow">feeds / syndication / archive</EditableText>
        <EditableText as="h1" field="feeds.hero.title">{settings.feedsIntroTitle || 'Follow the SabotPress archive'}</EditableText>
        <EditableText as="div" className="public-info-page__body" field="feeds.hero.body" multiline>{settings.feedsIntroBody}</EditableText>
        {state === 'loading' ? <p className="description" role="status">Loading live feed endpoints…</p> : null}
        {errors.length ? (
          <div className="notice notice-error" role="alert">
            <p><strong>Some live feed data could not be loaded.</strong></p>
            <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
          </div>
        ) : null}
        {mainFeedAvailable ? <EditableLink className="button button--primary" labelField="feeds.actions.main.label" hrefField="feeds.actions.main.href" defaultLabel="Open main RSS feed" defaultHref="/feeds/all-content.xml" /> : null}
      </section>

      <section className="feeds-public-page__panel">
        <EditableText as="h2" field="feeds.how.title">How this works</EditableText>
        <EditableText as="div" field="feeds.how.body" multiline>{`These are real RSS endpoints backed by the persisted public feed configuration, not download-package placeholders. A reader can subscribe with an RSS reader or compatible app, an archivist can mirror them, and another site can syndicate them.

Website-content feeds are generated from published native records and can be organized by format, project, collection, topic, series, or public byline. Scheduled work enters those feeds when it becomes publicly visible.

Podcast shows use the same server-backed content records but have their own directory-grade RSS feeds with audio enclosures, stable episode GUIDs, artwork, and podcast metadata. Each show has a separate feed. A format feed such as formats/podcast.xml is a cross-show website-content lane; it is not the feed to submit to a podcast directory.

Older imported archive pieces remain browseable on Sabot and enter live website feeds as they are migrated into native server-backed content.`}</EditableText>
      </section>

      <section className="feeds-public-page__panel">
        <EditableText as="h2" field="feeds.available.title">Available live feeds</EditableText>
        <p>{itemCount} published server-backed {itemCount === 1 ? 'entry is' : 'entries are'} currently eligible for the live feed system.</p>
        <div className="feeds-public-page__grid">
          {podcastShows.length ? (
            <article className="feeds-public-page__group">
              <h3>podcasts</h3>
              <p>Directory-grade podcast feeds, one per show, with audio enclosures and podcast metadata.</p>
              <ul>
                {podcastShows.map((show) => (
                  <li key={show.id || show.slug}>
                    <a href={`/feeds/${show.feedPath}`}><strong>{show.title || show.slug}</strong></a>
                    {' '}<code>{show.feedPath}</code>
                    {show.episodeCount != null ? <span> · {Number(show.episodeCount)} episode{Number(show.episodeCount) === 1 ? '' : 's'}</span> : null}
                  </li>
                ))}
              </ul>
              {podcastDefaultAlias ? <p className="description"><code>{podcastDefaultAlias}</code> remains available as a legacy alias for the default show; the named show feed above is the canonical subscription URL.</p> : null}
            </article>
          ) : null}

          {Object.entries(grouped).map(([group, groupFiles]) => (
            <article className="feeds-public-page__group" key={group}>
              <h3>{groupLabel(group)}</h3>
              <p>{groupDescription(group)}</p>
              <ul>
                {groupFiles.slice(0, 50).map((file) => <li key={file}><a href={`/feeds/${file}`}><code>{file}</code></a></li>)}
              </ul>
            </article>
          ))}
          {state !== 'loading' && !files.length ? (
            <article className="feeds-public-page__group">
              <h3>No live endpoints available</h3>
              <p>The server did not return a usable feed manifest. Nothing is being presented as a working subscription URL until it does.</p>
            </article>
          ) : null}
        </div>
      </section>

      <section className="feeds-public-page__panel">
        <EditableText as="h2" field="feeds.privacy.title">Privacy and bylines</EditableText>
        <EditableText as="div" field="feeds.privacy.body" multiline>{`A feed byline is not required to be a legal name. It can be a collective name, a role, a handle, a house label, or a pseudonym. That choice belongs to the people publishing and to the safety needs of the work.

Editors can rename or hide bad imported labels in the backend, and the same persisted rules are applied by the live website-content XML endpoints.`}</EditableText>
      </section>

      <section className="feeds-public-page__panel">
        <EditableText as="h2" field="feeds.why.title">Why this matters</EditableText>
        <EditableText as="p" field="feeds.why.body" multiline>Feeds make Sabot easier to follow, mirror, cite, preserve, and rebuild. If the homepage changes, the archive still has structure. If social platforms bury a post, the feed still publishes it.</EditableText>
        <EditableLink className="button" labelField="feeds.actions.archive.label" hrefField="feeds.actions.archive.href" defaultLabel="Browse the archive" defaultHref="/archive" />
      </section>
      <PublicationFooter />
    </main>
  )
}
