import { inferActorFromRequest, writeAuditLog } from './_lib/auditLog.js'
import { listNativeEntries, saveRevisionSnapshot, slugify, upsertNativeEntry } from './_lib/nativePublicContent.js'
import { findPodcastShow, podcastShowSourceUrls, readPodcastShows, upsertPodcastShow } from './_lib/podcastSettings.js'
import { fetchPodcastFeed } from './_lib/podcastRssImport.js'
import { permissionHasCapability, resolvePublicSitePermission } from './_lib/publicSiteAuth.js'

const MAX_IMPORT_EPISODES = 250

export async function onRequestPost(context) {
  const permission = await resolvePublicSitePermission(context)
  if (!permissionHasCapability(permission, 'publishing:write')) {
    return json({ ok: false, error: 'publishing permission required' }, 403)
  }
  const db = context.env?.BF_DB
  if (!db) return json({ ok: false, error: 'podcast RSS import unavailable: BF_DB is not bound' }, 503)

  try {
    const body = await context.request.json()
    const action = String(body?.action || 'preview').trim().toLowerCase()
    const feedUrl = String(body?.feedUrl || '').trim()
    const requestedShowId = String(body?.showId || '').trim()
    if (!feedUrl) return json({ ok: false, error: 'feedUrl is required' }, 400)

    const feed = await fetchPodcastFeed(feedUrl)
    const existing = await listNativeEntries(db, { includeFuture: true })
    const show = requestedShowId
      ? await findPodcastShow(db, requestedShowId)
      : await findPodcastShow(db, feed.sourceUrl)
    const decorated = decorateEpisodes(feed, existing, show)

    if (action === 'preview') {
      return json({
        ok: true,
        mode: 'd1',
        action: 'preview',
        sourceUrl: feed.sourceUrl,
        resolvedUrl: feed.resolvedUrl,
        podcast: feed.parsed.podcast,
        show,
        episodes: decorated,
        counts: summarizePreview(decorated),
      })
    }

    if (!['import', 'sync', 'resync'].includes(action)) {
      return json({ ok: false, error: 'action must be preview, import, or sync' }, 400)
    }

    const selectedKeys = Array.isArray(body?.selectedKeys)
      ? new Set(body.selectedKeys.map((value) => String(value || '')).filter(Boolean))
      : null
    const requested = decorated.filter((episode) => !selectedKeys || selectedKeys.has(episode.key))
    if (requested.length > MAX_IMPORT_EPISODES) {
      return json({ ok: false, error: `import at most ${MAX_IMPORT_EPISODES} episodes at a time; select a smaller batch` }, 400)
    }

    const syncExisting = body?.syncExisting !== false
    const importChannelSettings = body?.importChannelSettings !== false
    const registryBefore = await readPodcastShows(db)
    const imported = feed.parsed.podcast
    const now = new Date().toISOString()
    const showResult = await upsertPodcastShow(db, {
      ...(show || {}),
      ...(importChannelSettings ? {
        podcastTitle: imported.title || show?.podcastTitle || 'Podcast',
        author: imported.author || show?.author || 'SabotPress',
        description: imported.description || show?.description || '',
        websiteUrl: imported.websiteUrl || show?.websiteUrl || 'https://example.invalid',
        defaultCoverArt: imported.imageUrl || show?.defaultCoverArt || '',
        language: imported.language || show?.language || 'en-us',
        category: imported.category || show?.category || 'News',
        explicit: Boolean(imported.explicit),
        ownerName: imported.ownerName || show?.ownerName || '',
        ownerEmail: imported.ownerEmail || show?.ownerEmail || '',
      } : {
        podcastTitle: show?.podcastTitle || imported.title || 'Podcast',
      }),
      sourceFeedUrl: feed.sourceUrl,
      sourceFeedResolvedUrl: feed.resolvedUrl,
      sourceFeedLastSyncedAt: now,
      sourceFeedUrls: [...podcastShowSourceUrls(show), feed.sourceUrl, feed.resolvedUrl],
    }, {
      showId: show?.id || requestedShowId,
      makeDefault: registryBefore.shows.length === 0,
    })
    const targetShow = showResult.show

    const result = await importEpisodes({
      db,
      feed,
      show: targetShow,
      episodes: requested,
      existing,
      syncExisting,
    })

    await writeAuditLog(db, {
      action: action === 'import' ? 'podcasts.rss.import' : 'podcasts.rss.sync',
      entityType: 'podcast_show',
      entityId: targetShow.id,
      actor: inferActorFromRequest(context.request),
      detail: {
        showId: targetShow.id,
        showTitle: targetShow.podcastTitle,
        sourceUrl: feed.sourceUrl,
        resolvedUrl: feed.resolvedUrl,
        canonicalFeedUrl: targetShow.rssFeedUrl,
        selected: requested.length,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        channelSettingsImported: importChannelSettings,
      },
    })

    return json({
      ok: true,
      mode: 'd1',
      action,
      sourceUrl: feed.sourceUrl,
      resolvedUrl: feed.resolvedUrl,
      podcast: feed.parsed.podcast,
      show: targetShow,
      settings: targetShow,
      shows: showResult.shows,
      defaultShowId: showResult.defaultShowId,
      result,
    })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 400)
  }
}

function decorateEpisodes(feed, existing, show) {
  const importedByGuid = new Map()
  const importedByEnclosure = new Map()
  for (const item of existing) {
    if (!entryBelongsToShowImport(item, feed.sourceUrl, show)) continue
    if (item?.sourceExternalId) importedByGuid.set(String(item.sourceExternalId), item)
    const enclosure = publicAudioUrl(item)
    if (enclosure) importedByEnclosure.set(enclosure, item)
  }

  return feed.parsed.episodes.map((episode) => {
    const existingItem = importedByGuid.get(String(episode.guid)) || importedByEnclosure.get(String(episode.enclosureUrl || '')) || null
    return {
      ...episode,
      alreadyImported: Boolean(existingItem),
      existingId: existingItem?.id || '',
      existingSlug: existingItem?.slug || '',
    }
  })
}

async function importEpisodes({ db, feed, show, episodes, existing, syncExisting }) {
  const sourceUrl = feed.sourceUrl
  const existingByGuid = new Map()
  const existingByEnclosure = new Map()
  const usedSlugs = new Set(existing.map((item) => String(item?.slug || '')).filter(Boolean))

  for (const item of existing) {
    if (!entryBelongsToShowImport(item, sourceUrl, show)) continue
    if (item?.sourceExternalId) existingByGuid.set(String(item.sourceExternalId), item)
    const enclosure = publicAudioUrl(item)
    if (enclosure) existingByEnclosure.set(enclosure, item)
  }

  const imported = []
  let created = 0
  let updated = 0
  let skipped = 0

  for (const episode of episodes) {
    const match = existingByGuid.get(String(episode.guid)) || existingByEnclosure.get(String(episode.enclosureUrl || '')) || null
    if (match && !syncExisting) {
      skipped += 1
      continue
    }

    const stable = await shortHash(`${sourceUrl}\n${episode.guid}`)
    const id = match?.id || `podcast-rss-${stable.slice(0, 20)}`
    const slug = match?.slug || uniqueSlug(slugify(episode.title) || `episode-${stable.slice(0, 8)}`, stable, usedSlugs)
    usedSlugs.add(slug)

    const publishedAt = episode.publishedAt || match?.publishedAt || new Date().toISOString()
    const deliveryAsset = episode.enclosureUrl ? {
      id: `rss-enclosure-${stable.slice(0, 16)}`,
      role: 'delivery',
      source: 'podcast-rss',
      type: 'audio',
      url: episode.enclosureUrl,
      publicUrl: episode.enclosureUrl,
      mimeType: episode.enclosureType || 'audio/mpeg',
      size: Number(episode.enclosureLength || 0),
      rssEnclosure: {
        url: episode.enclosureUrl,
        type: episode.enclosureType || 'audio/mpeg',
        length: Number(episode.enclosureLength || 0),
      },
      podcastExplicit: Boolean(episode.explicit),
      podcastGuid: episode.guid,
    } : null

    const saved = await upsertNativeEntry(db, {
      ...(match || {}),
      id,
      slug,
      contentType: 'podcast',
      status: 'published',
      workflowState: 'published',
      target: match?.target || 'general',
      title: episode.title,
      excerpt: episode.excerpt,
      body: episode.excerpt,
      bodyHtml: episode.descriptionHtml || episode.excerpt,
      author: episode.author || show.author || feed.parsed.podcast.author || 'SabotPress',
      sourceType: 'rss-import',
      sourceKind: 'podcast-rss',
      sourceLabel: show.podcastTitle || feed.parsed.podcast.title || 'Imported podcast RSS',
      sourceUrl,
      sourceExternalId: episode.guid,
      sourcePostId: episode.guid,
      sourceNotes: `Imported from ${feed.resolvedUrl}; podcast show ${show.id}`,
      audioSourceUrl: episode.enclosureUrl,
      podcastAudioUrl: episode.enclosureUrl,
      podcastRssEnclosureUrl: episode.enclosureUrl,
      podcastDuration: episode.duration,
      podcastEpisodeNumber: episode.episodeNumber,
      podcastSeason: episode.season,
      podcastSummary: episode.excerpt,
      podcastCoverImage: episode.imageUrl || show.defaultCoverArt || feed.parsed.podcast.imageUrl,
      featuredImage: episode.imageUrl || show.defaultCoverArt || feed.parsed.podcast.imageUrl,
      heroImage: episode.imageUrl || show.defaultCoverArt || feed.parsed.podcast.imageUrl,
      categories: unique(['podcast', show.slug, ...(episode.categories || [])]),
      tags: unique([show.slug, ...(episode.categories || [])]),
      relatedAssets: mergeDeliveryAsset(match?.relatedAssets, deliveryAsset),
      createdAt: match?.createdAt || publishedAt,
      publishedAt,
    })

    await saveRevisionSnapshot(db, saved, match ? 'rss-resync' : 'rss-import')
    imported.push({ id: saved.id, slug: saved.slug, title: saved.title, updated: Boolean(match) })
    if (match) updated += 1
    else created += 1
  }

  return { created, updated, skipped, imported }
}

function entryBelongsToShowImport(item, sourceUrl, show) {
  if (item?.contentType !== 'podcast' || String(item?.sourceKind || '') !== 'podcast-rss') return false
  const validSources = new Set([sourceUrl, ...podcastShowSourceUrls(show)].map((value) => String(value || '').trim()).filter(Boolean))
  return validSources.has(String(item?.sourceUrl || '').trim())
}

function mergeDeliveryAsset(existingAssets, deliveryAsset) {
  const assets = Array.isArray(existingAssets) ? existingAssets.filter((asset) => !(asset?.source === 'podcast-rss' && asset?.role === 'delivery')) : []
  return deliveryAsset ? [...assets, deliveryAsset] : assets
}

function publicAudioUrl(item) {
  const direct = String(item?.podcastRssEnclosureUrl || item?.podcastAudioUrl || item?.audioSourceUrl || '').trim()
  if (direct) return direct
  const asset = (Array.isArray(item?.relatedAssets) ? item.relatedAssets : []).find((candidate) => candidate?.role === 'delivery' && (candidate?.url || candidate?.publicUrl))
  return String(asset?.url || asset?.publicUrl || '').trim()
}

function uniqueSlug(base, stable, usedSlugs) {
  if (!usedSlugs.has(base)) return base
  let candidate = `${base}-${stable.slice(0, 6)}`
  let counter = 2
  while (usedSlugs.has(candidate)) {
    candidate = `${base}-${stable.slice(0, 6)}-${counter}`
    counter += 1
  }
  return candidate
}

async function shortHash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function summarizePreview(episodes) {
  return {
    total: episodes.length,
    new: episodes.filter((episode) => !episode.alreadyImported).length,
    existing: episodes.filter((episode) => episode.alreadyImported).length,
  }
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
