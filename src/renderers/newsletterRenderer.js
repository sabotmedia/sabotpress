import { renderArticle } from './articleRenderer'

export function renderNewsletter(post, options = {}) {
  return {
    ...renderArticle(post, options),
    renderer: 'newsletter',
    issue: options.issue || null,
  }
}
