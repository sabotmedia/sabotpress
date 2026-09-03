export const PODCAST_SETTINGS_DEFAULTS = {
  id: '',
  slug: '',
  rssFeedUrl: '',
  podcastTitle: '',
  author: 'SabotPress',
  description: '',
  defaultCoverArt: '',
  audioHostBaseUrl: '',
  websiteUrl: 'https://example.invalid',
  language: 'en-us',
  category: 'News',
  explicit: false,
  ownerName: '',
  ownerEmail: '',
  sourceFeedUrl: '',
  sourceFeedResolvedUrl: '',
  sourceFeedLastSyncedAt: '',
  sourceFeedUrls: [],
}

export function podcastFeedUrl(slug) {
  const clean = String(slug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  return clean ? `https://example.invalid/feeds/podcasts/${clean}.xml` : ''
}

export function loadPodcastSettings() {
  return { ...PODCAST_SETTINGS_DEFAULTS }
}

export function mergePodcastSettings(value = {}) {
  const input = value && typeof value === 'object' ? value : {}
  const merged = { ...PODCAST_SETTINGS_DEFAULTS, ...input }
  return {
    ...merged,
    sourceFeedUrls: Array.isArray(merged.sourceFeedUrls) ? merged.sourceFeedUrls : [],
    rssFeedUrl: merged.rssFeedUrl || podcastFeedUrl(merged.slug || merged.id),
  }
}

export async function loadPodcastShowsAsync() {
  const data = await requestPodcastSettings('')
  return {
    shows: Array.isArray(data.shows) ? data.shows.map(mergePodcastSettings) : [],
    defaultShowId: String(data.defaultShowId || ''),
    settings: mergePodcastSettings(data.settings || {}),
  }
}

export async function loadPodcastSettingsAsync(showId = '') {
  const query = showId ? `?show=${encodeURIComponent(showId)}` : ''
  const data = await requestPodcastSettings(query)
  return mergePodcastSettings(data.show || data.settings || {})
}

export async function savePodcastSettings(settings, showId = '') {
  const next = mergePodcastSettings(settings)
  const response = await fetch('/api/podcast-settings', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ showId: showId || next.id || '', settings: next }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok || data.mode !== 'd1') {
    throw new Error(data?.error || `podcast settings save failed: ${response.status}`)
  }
  return {
    show: mergePodcastSettings(data.show || data.settings || next),
    shows: Array.isArray(data.shows) ? data.shows.map(mergePodcastSettings) : [],
    defaultShowId: String(data.defaultShowId || ''),
  }
}

async function requestPodcastSettings(query) {
  const response = await fetch(`/api/podcast-settings${query}`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok || data.mode !== 'd1') {
    throw new Error(data?.error || `podcast settings request failed: ${response.status}`)
  }
  return data
}
