import { getBoundDb } from '../api/_lib/database.js'
import { buildLiveFeedBundle, normalizeFeedRequestPath } from '../api/_lib/feedRuntime.js'
import { findPodcastShow, readPodcastShows } from '../api/_lib/podcastSettings.js'
import { AI_CAMPAIGN_SLUG, buildCampaignRssXml, ensureDefaultCampaigns, getCampaign } from '../api/_lib/campaigns.js'
import { listMessages } from '../api/_lib/campaignCorrespondence.js'
import { decorateAiCampaignForPublic } from '../api/_lib/aiCampaignPublic.js'
import { decorateCampaignAutomation } from '../api/_lib/campaignAutomation.js'
import { listNativeEntries } from '../api/_lib/nativePublicContent.js'
import { buildPodcastFeedXml, getPodcastFeedItems, podcastXmlResponse } from '../rss/podcast.xml.js'

export async function onRequestGet(context) {
  const requestedPath = normalizeFeedRequestPath(context.params?.path)

  // This catch-all also matches the human-readable /feeds route.
  if (!requestedPath) return context.next()
  if (!requestedPath.toLowerCase().endsWith('.xml')) return context.next()

  const db = getBoundDb(context)
  if (!db) return text('Live feeds unavailable: BF_DB binding is required.', 503)

  try {
    if (requestedPath === 'podcasts/all.xml') {
      const registry = await readPodcastShows(db)
      const show = registry.shows.find((candidate) => candidate.id === registry.defaultShowId) || registry.shows[0] || null
      if (!show) return text('Podcast feed not found.', 404)
      const items = await getPodcastFeedItems(db, show)
      return podcastXmlResponse(buildPodcastFeedXml({
        requestUrl: context.request.url,
        items,
        settings: show,
        selfPath: '/feeds/podcasts/all.xml',
      }))
    }

    const podcastMatch = requestedPath.match(/^podcasts\/([a-z0-9-]+)\.xml$/i)
    if (podcastMatch) {
      const slug = podcastMatch[1].toLowerCase()
      const show = await findPodcastShow(db, slug)
      if (!show) return text('Podcast feed not found.', 404)
      const items = await getPodcastFeedItems(db, show)
      return podcastXmlResponse(buildPodcastFeedXml({
        requestUrl: context.request.url,
        items,
        settings: show,
        selfPath: `/feeds/podcasts/${show.slug}.xml`,
      }))
    }

    const campaignMatch = requestedPath.match(/^campaigns\/([a-z0-9-]+)\.xml$/i)
    if (campaignMatch) {
      const slug = campaignMatch[1].toLowerCase()
      await ensureDefaultCampaigns(db)
      let campaign = await getCampaign(db, slug)
      if (!campaign || campaign.status !== 'published') return text('Campaign feed not found.', 404)
      const posts = await listNativeEntries(db, { status: 'published' })
      if (slug === AI_CAMPAIGN_SLUG) {
        campaign = await decorateAiCampaignForPublic(campaign, context.request.url, { posts, includeSocial: false })
      } else {
        campaign = await decorateCampaignAutomation(campaign, context.request.url, { posts })
      }
      const dispatches = campaign.correspondence?.enabled ? await listMessages(db, campaign.id, { publicOnly: true }) : []
      return new Response(buildCampaignRssXml({ campaign, requestUrl: context.request.url, dispatches }), {
        status: 200,
        headers: {
          'content-type': 'application/rss+xml; charset=utf-8',
          'cache-control': 'public, max-age=180',
          'x-sabot-feed-source': 'campaign-d1',
        },
      })
    }

    const runtime = await buildLiveFeedBundle(db)
    const body = runtime.bundle?.[requestedPath]
    if (typeof body !== 'string') return text('Feed not found.', 404)

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/rss+xml; charset=utf-8',
        'cache-control': 'public, max-age=300',
        'x-sabot-feed-source': 'native-d1',
      },
    })
  } catch (error) {
    return text(`RSS feed error: ${String(error?.message || error)}`, 500)
  }
}

function text(body, status) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
