import { renderArticle } from './articleRenderer'

export function renderZine(post, options = {}) {
  return {
    ...renderArticle(post, options),
    renderer: 'zine',
    panels: options.panels || [],
  }
}

export function renderPoster(post, options = {}) {
  return {
    ...renderArticle(post, options),
    renderer: 'poster',
    posterSize: options.posterSize || 'single-page',
  }
}

export function renderTileSheet(post, options = {}) {
  return {
    ...renderArticle(post, options),
    renderer: 'tileSheet',
    tileSize: options.tileSize || 'quarter',
  }
}

export function renderPrintLayout(post, options = {}) {
  return {
    ...renderArticle(post, options),
    renderer: 'printLayout',
    layout: options.layout || 'article',
  }
}

export function renderHalfFold(post, options = {}) {
  return {
    ...renderPrintLayout(post, options),
    renderer: 'halfFold',
    fold: 'half',
  }
}

export function renderCanvas(post, options = {}) {
  return {
    ...renderArticle(post, options),
    renderer: 'canvas',
    canvas: options.canvas || { width: 0, height: 0, units: 'px' },
  }
}
