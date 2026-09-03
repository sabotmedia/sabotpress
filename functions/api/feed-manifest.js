import { databaseUnavailable, getBoundDb } from './_lib/database.js'
import { buildLiveFeedBundle } from './_lib/feedRuntime.js'
import { ensureAiCampaign, listCampaigns } from './_lib/campaigns.js'
import { readPodcastShows } from './_lib/podcastSettings.js'
import { getPodcastFeedItems } from '../rss/podcast.xml.js'

export async function onRequestGet(context) {
  try {
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('live feed manifest')

    await ensureAiCampaign(db)
    const [runtime, podcastItems, podcastRegistry, campaigns] = await Promise.all([
      buildLiveFeedBundle(db),
      getPodcastFeedItems(db),
      readPodcastShows(db),
      listCampaigns(db),
    ])

    const showItems = await Promise.all(
      podcastRegistry.shows.map((show) => getPodcastFeedItems(db, show))
    )
    const assignedPodcastIds = new Set(showItems.flat().map((item) => String(item?.id || item?.slug || '')).filter(Boolean))
    const podcastShows = podcastRegistry.shows.map((show, index) => ({
      id: show.id,
      slug: show.slug,
      title: show.podcastTitle,
      author: show.author,
      feedPath: `podcasts/${show.slug}.xml`,
      rssFeedUrl: show.rssFeedUrl,
      sourceFeedUrl: show.sourceFeedUrl,
      sourceFeedLastSyncedAt: show.sourceFeedLastSyncedAt,
      episodeCount: showItems[index]?.length || 0,
      isDefault: show.id === podcastRegistry.defaultShowId,
    }))

    const podcastFiles = podcastShows.map((show) => show.feedPath)
    const podcastDefaultAlias = podcastShows.length ? 'podcasts/all.xml' : ''
    const files = [...new Set([
      ...Object.keys(runtime.bundle || {}),
      ...(podcastDefaultAlias ? [podcastDefaultAlias] : []),
      ...podcastFiles,
      ...campaigns.map((campaign) => `campaigns/${campaign.slug}.xml`),
    ])].sort()

    return json({
      ok: true,
      mode: 'd1',
      basePath: '/feeds',
      files,
      terms: runtime.terms || {},
      itemCount: runtime.itemCount,
      podcastItemCount: podcastItems.length,
      podcastShowCount: podcastShows.length,
      unassignedPodcastItemCount: podcastItems.filter((item) => !assignedPodcastIds.has(String(item?.id || item?.slug || ''))).length,
      podcastDefaultAlias,
      podcastShows,
      campaignFeeds: campaigns.map((campaign) => ({ slug: campaign.slug, title: campaign.shortTitle || campaign.title, itemCount: campaign.updates.length })),
      settingsUpdatedAt: runtime.updatedAt,
      podcastSettingsUpdatedAt: podcastRegistry.updatedAt,
    })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
    },
  })
}
