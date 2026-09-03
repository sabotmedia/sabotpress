import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminFrame } from './AdminRail'
import { loadNativeCollection, upsertNativeEntryWithMeta } from '../lib/nativePublicContent'
import { loadPodcastShowsAsync, podcastFeedUrl } from '../lib/podcastSettings'
import { adminRoutes } from '../routing/routes'

function toDisplayDate(value) {
  const d = new Date(String(value || ''))
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString()
}

function showSourceUrls(show) {
  return [...new Set([
    ...(Array.isArray(show?.sourceFeedUrls) ? show.sourceFeedUrls : []),
    show?.sourceFeedUrl,
    show?.sourceFeedResolvedUrl,
  ].map((value) => String(value || '').trim()).filter(Boolean))]
}

function episodeBelongsToShow(episode, show) {
  const sourceUrl = String(episode?.sourceUrl || '').trim()
  return Boolean(sourceUrl && showSourceUrls(show).includes(sourceUrl))
}

function podcastTitleDisplayValue(episode) {
  const explicit = String(episode?.featuredTitleDisplay || '').trim().toLowerCase()
  return ['overlay', 'below', 'hidden'].includes(explicit) ? explicit : 'hidden'
}

function showTitleDisplayValue(episodes = []) {
  const values = [...new Set(episodes.map(podcastTitleDisplayValue))]
  return values.length === 1 ? values[0] : 'mixed'
}

export function PodcastAdminPage() {
  const [nativeItems, setNativeItems] = useState([])
  const [shows, setShows] = useState([])
  const [defaultShowId, setDefaultShowId] = useState('')
  const [error, setError] = useState('')
  const [savingDisplayId, setSavingDisplayId] = useState('')
  const [displayNotice, setDisplayNotice] = useState('')

  useEffect(() => {
    let cancelled = false

    async function boot() {
      const [loadedItems, loadedShows] = await Promise.allSettled([
        loadNativeCollection({ includeFuture: 1 }),
        loadPodcastShowsAsync(),
      ])

      if (cancelled) return
      if (loadedItems.status === 'fulfilled') {
        setNativeItems(Array.isArray(loadedItems.value) ? loadedItems.value : [])
      }
      if (loadedShows.status === 'fulfilled') {
        setShows(loadedShows.value.shows || [])
        setDefaultShowId(loadedShows.value.defaultShowId || '')
      } else {
        setError(String(loadedShows.reason?.message || loadedShows.reason || 'Unable to load podcast shows.'))
      }
    }

    boot()
    return () => { cancelled = true }
  }, [])

  const podcastEpisodes = useMemo(
    () => nativeItems
      .filter((item) => item.contentType === 'podcast')
      .sort((a, b) => new Date(b.publishedAt || b.updatedAt || 0).getTime() - new Date(a.publishedAt || a.updatedAt || 0).getTime()),
    [nativeItems]
  )

  const showGroups = useMemo(
    () => shows.map((show) => ({
      show,
      episodes: podcastEpisodes.filter((episode) => episodeBelongsToShow(episode, show)),
    })),
    [shows, podcastEpisodes]
  )

  async function updateTitleDisplay(episode, featuredTitleDisplay) {
    if (!episode?.id) return
    try {
      setSavingDisplayId(String(episode.id))
      setDisplayNotice('')
      const result = await upsertNativeEntryWithMeta(
        nativeItems,
        { ...episode, featuredTitleDisplay },
        'Podcast homepage title display'
      )
      setNativeItems(result.items)
      setDisplayNotice(`Saved homepage title treatment for “${episode.title || 'episode'}”.`)
    } catch (saveError) {
      setDisplayNotice(`Could not save homepage title treatment: ${String(saveError?.message || saveError)}`)
    } finally {
      setSavingDisplayId('')
    }
  }

  async function updateShowTitleDisplay(show, episodes, featuredTitleDisplay) {
    if (!episodes.length || !['overlay', 'below', 'hidden'].includes(featuredTitleDisplay)) return
    const showKey = `show:${show.id || show.slug}`
    try {
      setSavingDisplayId(showKey)
      setDisplayNotice(`Applying homepage title treatment to ${episodes.length} episode${episodes.length === 1 ? '' : 's'}…`)
      let working = nativeItems
      for (const episode of episodes) {
        const result = await upsertNativeEntryWithMeta(
          working,
          { ...episode, featuredTitleDisplay },
          'Podcast show homepage title display'
        )
        working = result.items
      }
      setNativeItems(working)
      setDisplayNotice(`Saved “${show.podcastTitle || 'Podcast'}” homepage title treatment for all ${episodes.length} episodes.`)
    } catch (saveError) {
      setDisplayNotice(`Could not save show title treatment: ${String(saveError?.message || saveError)}`)
    } finally {
      setSavingDisplayId('')
    }
  }

  return (
    <AdminFrame>
      <main className="page wp-admin-screen">
        <div className="wp-screen-header">
          <div>
            <h1>Podcasts</h1>
            <p className="description">Each podcast is its own show with its own metadata, source RSS archive, episodes, and canonical Sabot RSS feed.</p>
          </div>
          <div className="review-card__actions">
            <Link className="button" to={adminRoutes.podcastSettings}>Podcast Settings / Import RSS</Link>
            <a className="button" href="/feeds/podcasts/all.xml" target="_blank" rel="noreferrer">Open Default RSS Feed</a>
            <Link className="button button--primary" to={`${adminRoutes.podcastSettings}?new=1`}>Add Podcast</Link>
          </div>
        </div>

        {error ? <div className="notice notice-error" role="alert"><p><strong>Podcast error:</strong> {error}</p></div> : null}
        {displayNotice ? <div className="notice notice-info" role="status"><p>{displayNotice}</p></div> : null}

        <section className="wp-meta-box">
          <h2>Podcast Shows</h2>
          <p className="description">Importing another RSS feed creates or updates a separate show. Each show's identity, source feed, episodes, and outgoing feed remain isolated from the others.</p>
          <div className="wp-list-table-wrap">
            <table className="content-table wp-posts-table">
              <thead>
                <tr>
                  <th>Show</th>
                  <th>Episodes</th>
                  <th>Source RSS</th>
                  <th>Sabot RSS</th>
                  <th>Last synced</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {showGroups.length ? showGroups.map(({ show, episodes }) => {
                  const feedUrl = show.rssFeedUrl || podcastFeedUrl(show.slug || show.id)
                  return (
                    <tr key={show.id || show.slug}>
                      <td><strong>{show.podcastTitle || 'Untitled podcast'}</strong>{show.id === defaultShowId ? <div className="description">Default / legacy feed</div> : null}</td>
                      <td>{episodes.length}</td>
                      <td>{show.sourceFeedUrl ? <a href={show.sourceFeedUrl} target="_blank" rel="noreferrer">Source feed</a> : '—'}</td>
                      <td>{feedUrl ? <a href={feedUrl} target="_blank" rel="noreferrer">{feedUrl}</a> : '—'}</td>
                      <td>{toDisplayDate(show.sourceFeedLastSyncedAt || show.updatedAt)}</td>
                      <td><div className="wp-row-actions"><Link to={`${adminRoutes.podcastSettings}?show=${encodeURIComponent(show.id || show.slug)}`}>Manage / Import</Link></div></td>
                    </tr>
                  )
                }) : (
                  <tr><td colSpan={6}>No podcast shows yet. Add a podcast and import its RSS feed.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p><Link className="button button--primary" to={`${adminRoutes.podcastSettings}?new=1`}>Add Podcast</Link></p>
        </section>

        {showGroups.map(({ show, episodes }) => {
          const showDisplay = showTitleDisplayValue(episodes)
          const showSavingKey = `show:${show.id || show.slug}`
          return (
            <section className="wp-meta-box" key={`episodes-${show.id || show.slug}`}>
              <div className="wp-screen-header podcast-show-episode-header">
                <div>
                  <h2>{show.podcastTitle || 'Untitled podcast'} Episodes</h2>
                  <p className="description">{episodes.length} episode{episodes.length === 1 ? '' : 's'} assigned from this show's source feed. Set one default for the whole show, then override individual episodes only when their artwork differs.</p>
                </div>
                <div className="podcast-show-display-control">
                  <label>
                    <span>Homepage title for this show</span>
                    <select
                      value={showDisplay}
                      disabled={!episodes.length || savingDisplayId === showSavingKey}
                      onChange={(event) => updateShowTitleDisplay(show, episodes, event.target.value)}
                    >
                      {showDisplay === 'mixed' ? <option value="mixed" disabled>Mixed episode settings</option> : null}
                      <option value="hidden">Image only</option>
                      <option value="below">Title below image</option>
                      <option value="overlay">Title over image</option>
                    </select>
                  </label>
                  <div className="review-card__actions">
                    <Link className="button" to={`${adminRoutes.podcastSettings}?show=${encodeURIComponent(show.id || show.slug)}`}>Import / Settings</Link>
                    <a className="button" href={show.rssFeedUrl || podcastFeedUrl(show.slug || show.id)} target="_blank" rel="noreferrer">Open RSS</a>
                  </div>
                </div>
              </div>
              <div className="wp-list-table-wrap">
                <table className="content-table wp-posts-table podcast-episodes-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Episode</th>
                      <th>Season</th>
                      <th>Duration</th>
                      <th>Homepage title</th>
                      <th>Status</th>
                      <th>Published</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {episodes.length ? episodes.map((episode) => (
                      <tr key={episode.id || episode.slug}>
                        <td><strong>{episode.title || '(Untitled episode)'}</strong></td>
                        <td>{episode.podcastEpisodeNumber || '—'}</td>
                        <td>{episode.podcastSeason || '—'}</td>
                        <td>{episode.podcastDuration || '—'}</td>
                        <td>
                          <select
                            className="podcast-title-display-select"
                            value={podcastTitleDisplayValue(episode)}
                            disabled={savingDisplayId === String(episode.id) || savingDisplayId === showSavingKey}
                            onChange={(event) => updateTitleDisplay(episode, event.target.value)}
                            aria-label={`Homepage title treatment for ${episode.title || 'episode'}`}
                          >
                            <option value="hidden">Image only</option>
                            <option value="below">Title below image</option>
                            <option value="overlay">Title over image</option>
                          </select>
                        </td>
                        <td>{episode.status || 'draft'}</td>
                        <td>{toDisplayDate(episode.publishedAt || episode.updatedAt)}</td>
                        <td>
                          <div className="wp-row-actions">
                            {episode.slug ? <Link to={`/post/${episode.slug}`} target="_blank" rel="noreferrer">View</Link> : null}
                            <Link to={`${adminRoutes.nativeBridge}?edit=${episode.id}`}>Full edit</Link>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={8}>No episodes imported for this show yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })}
      </main>
    </AdminFrame>
  )
}
