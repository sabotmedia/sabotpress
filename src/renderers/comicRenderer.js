import { renderArticle } from './articleRenderer'

export function renderComic(post, options = {}) {
  return {
    ...renderArticle(post, options),
    renderer: 'comic',
    frameMode: options.frameMode || 'reader',
  }
}
