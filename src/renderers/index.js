import { ContentKinds } from '../models/publication'
import { renderArticle } from './articleRenderer'
import { renderComic } from './comicRenderer'
import { renderPodcast } from './podcastRenderer'
import { renderNewsletter } from './newsletterRenderer'
import { renderCanvas, renderPoster, renderPrintLayout, renderTileSheet, renderZine } from './printRenderers'

const RENDERERS = {
  [ContentKinds.ARTICLE]: renderArticle,
  [ContentKinds.COMIC]: renderComic,
  [ContentKinds.PODCAST]: renderPodcast,
  [ContentKinds.NEWSLETTER]: renderNewsletter,
  [ContentKinds.ZINE]: renderZine,
  [ContentKinds.POSTER]: renderPoster,
  [ContentKinds.TILE_SHEET]: renderTileSheet,
  [ContentKinds.PRINT_LAYOUT]: renderPrintLayout,
  [ContentKinds.CANVAS]: renderCanvas,
}

export function renderPost(post, options = {}) {
  const renderer = RENDERERS[options.kind || post?.kind] || renderArticle
  return renderer(post, options)
}

export {
  renderArticle,
  renderComic,
  renderPodcast,
  renderNewsletter,
  renderZine,
  renderPoster,
  renderTileSheet,
  renderPrintLayout,
  renderCanvas,
}
