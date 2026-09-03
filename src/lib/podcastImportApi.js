export async function previewPodcastFeed(feedUrl, showId = '') {
  return requestPodcastImport({ action: 'preview', feedUrl, showId })
}

export async function importPodcastFeed({ feedUrl, showId = '', selectedKeys, syncExisting = true, importChannelSettings = true }) {
  return requestPodcastImport({
    action: 'import',
    feedUrl,
    showId,
    selectedKeys,
    syncExisting,
    importChannelSettings,
  })
}

export async function syncPodcastFeed({ feedUrl, showId = '', selectedKeys, importChannelSettings = true }) {
  return requestPodcastImport({
    action: 'sync',
    feedUrl,
    showId,
    selectedKeys,
    syncExisting: true,
    importChannelSettings,
  })
}

async function requestPodcastImport(payload) {
  const response = await fetch('/api/podcast-import', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok || data.mode !== 'd1') {
    throw new Error(data?.error || `podcast RSS request failed: ${response.status}`)
  }
  return data
}
