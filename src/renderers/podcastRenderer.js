import { renderArticle } from './articleRenderer'

export function renderPodcast(post, options = {}) {
  const audio = (post.assets || []).find((asset) => asset.type === 'audio' || asset.role === 'audio') || null
  return {
    ...renderArticle(post, options),
    renderer: 'podcast',
    audio,
  }
}
