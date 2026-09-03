function hashString(value = '') {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 2147483647
  }
  return hash
}

function createDaySeed(date = new Date()) {
  const iso = date.toISOString().slice(0, 10)
  return hashString(iso)
}

export function buildLocalAnalytics(pieces = [], date = new Date()) {
  const publishedPosts = pieces.filter((piece) => piece.publishedAt)
  const daySeed = createDaySeed(date)
  const publishedCount = publishedPosts.length

  const monthlyViews = Array.from({ length: 12 }, (_, monthOffset) => {
    const monthDate = new Date(date.getUTCFullYear(), monthOffset, 1)
    const monthLabel = monthDate.toLocaleString('en-US', { month: 'short' })
    const variability = 240 + ((daySeed + monthOffset * 97 + publishedCount * 13) % 720)
    const volume = publishedCount * 12
    return {
      key: `${monthDate.getUTCFullYear()}-${String(monthOffset + 1).padStart(2, '0')}`,
      label: monthLabel,
      views: variability + volume,
    }
  })

  const viewsToday = Math.max(120, Math.round(monthlyViews[date.getMonth()]?.views / 30))
  const visitorsToday = Math.max(80, Math.round(viewsToday * 0.62))
  const comments = Math.max(6, Math.round(publishedCount * 0.35 + (daySeed % 11)))

  const topPosts = [...publishedPosts]
    .map((piece) => {
      const title = piece.title || piece.slug || 'Untitled'
      const postScore = 100 + (hashString(piece.slug || title) % 1400)
      return {
        slug: piece.slug || title.toLowerCase().replace(/\s+/g, '-'),
        title,
        views: postScore,
      }
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, 5)

  return {
    generatedAt: date.toISOString(),
    isLocalDemo: true,
    viewsToday,
    visitorsToday,
    comments,
    publishedPosts: publishedCount,
    monthlyViews,
    topPosts,
  }
}
