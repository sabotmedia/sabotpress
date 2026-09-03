export function extractPodcastEmbeds(piece) {
  const html = String(piece?.bodyHtml || '')
  const urls = new Set()

  for (const match of html.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    const url = match[0].replace(/[),.;]+$/, '')
    if (isPodcastLikeUrl(url)) urls.add(url)
  }

  for (const match of html.matchAll(/href="([^"]+)"/gi)) {
    const url = match[1]
    if (isPodcastLikeUrl(url)) urls.add(url)
  }

  for (const match of html.matchAll(/src="([^"]+)"/gi)) {
    const url = match[1]
    if (isPodcastLikeUrl(url)) urls.add(url)
  }

  return [...urls].map((url) => ({
    url,
    kind: classifyPodcastUrl(url),
    embedUrl: toEmbedUrl(url),
  }))
}

export function isPodcastPiece(piece) {
  return piece?.type === 'podcast' || extractPodcastEmbeds(piece).length > 0
}

function isPodcastLikeUrl(url) {
  const lower = String(url || '').toLowerCase()
  return (
    lower.includes('acast.com') ||
    lower.includes('spotify.com') ||
    lower.includes('soundcloud.com') ||
    lower.includes('youtube.com') ||
    lower.includes('youtu.be') ||
    lower.includes('peertube') ||
    lower.includes('/video/')
  )
}

function classifyPodcastUrl(url) {
  const lower = String(url || '').toLowerCase()
  if (lower.includes('acast.com')) return 'acast'
  if (lower.includes('spotify.com')) return 'spotify'
  if (lower.includes('soundcloud.com')) return 'soundcloud'
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube'
  if (lower.includes('peertube') || lower.includes('/video/')) return 'peertube'
  return 'link'
}

function toEmbedUrl(url) {
  const lower = String(url || '').toLowerCase()

  if (lower.includes('youtube.com/watch?v=')) {
    const u = new URL(url)
    const id = u.searchParams.get('v')
    return id ? `https://www.youtube.com/embed/${id}` : url
  }

  if (lower.includes('youtu.be/')) {
    const id = url.split('youtu.be/')[1]?.split(/[?&]/)[0]
    return id ? `https://www.youtube.com/embed/${id}` : url
  }

  if (lower.includes('spotify.com/episode/') || lower.includes('spotify.com/show/')) {
    return url.replace('open.spotify.com/', 'open.spotify.com/embed/')
  }

  if (lower.includes('soundcloud.com')) {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`
  }

  return url
}
