import { renderPost } from '../renderers'

export const PrintLayouts = Object.freeze({
  ARTICLE: 'article',
  POSTER: 'poster',
  TILE: 'tile',
  BOOKLET: 'booklet',
  SINGLE_PAGE: 'singlePage',
  ZINE_SHEET: 'zine-sheet',
})

export const DEFAULT_PRINT_OPTIONS = Object.freeze({
  showMetadata: true,
  showFeaturedImage: true,
  showExcerpt: true,
  showColophon: true,
})

function chunkPanels(items = [], size = 4) {
  const normalizedSize = Number.isFinite(size) && size > 0 ? size : 4
  const chunks = []
  for (let i = 0; i < items.length; i += normalizedSize) {
    chunks.push(items.slice(i, i + normalizedSize))
  }
  return chunks
}

function buildMetadata(post, renderData) {
  const sourceLabel = post.source?.url || post.source?.postType || ''
  return [
    { label: 'Site', value: 'SabotPress' },
    { label: 'Post', value: renderData.title || post.title || '' },
    { label: 'Date', value: post.publishedDateLabel || post.publishedAt || '' },
    {
      label: 'Author / Source',
      value: [post.author, sourceLabel].map((item) => String(item || '').trim()).filter(Boolean).join(' / '),
    },
    { label: 'URL slug', value: post.slug || '' },
  ].filter((item) => String(item.value || '').trim())
}

function buildZinePanels(post, renderData, options) {
  const panels = [
    {
      id: 'cover',
      label: 'Panel 1 / Cover',
      kind: 'cover',
      title: renderData.title,
      subtitle: renderData.subtitle || post.excerpt || '',
    },
  ]

  if (options.showFeaturedImage !== false && renderData.hero?.url) {
    panels.push({
      id: 'featured-image',
      label: 'Panel 2 / Featured image',
      kind: 'image',
      image: renderData.hero,
      title: renderData.title,
    })
  }

  if (options.showMetadata !== false) {
    panels.push({
      id: 'metadata',
      label: `Panel ${panels.length + 1} / Metadata`,
      kind: 'metadata',
      metadata: buildMetadata(post, renderData),
    })
  }

  const bodyHtml = renderData.bodyHtml || post.excerpt || ''
  for (const [index, group] of chunkPanels([bodyHtml], 1).entries()) {
    panels.push({
      id: `body-${index + 1}`,
      label: `Panel ${panels.length + 1} / Body`,
      kind: 'body',
      bodyHtml: group.join('\n'),
    })
  }

  return panels
}

export const printEngine = {
  render(post, request = {}) {
    const layout = request.layout || PrintLayouts.ARTICLE
    const options = { ...DEFAULT_PRINT_OPTIONS, ...(request.options || {}) }
    const renderData = renderPost(post, { mode: 'print', layout })
    const metadata = buildMetadata(post, renderData)

    return {
      engine: 'sabot-print-engine',
      layout,
      postId: post.id,
      slug: post.slug,
      title: renderData.title,
      subtitle: renderData.subtitle,
      excerpt: renderData.subtitle || post.subtitle || post.excerpt || '',
      eyebrow: post.project?.title || post.kind || 'publication',
      author: post.author || 'SabotPress',
      publishedDateLabel: post.publishedDateLabel || '',
      hero: options.showFeaturedImage ? renderData.hero : null,
      bodyHtml: renderData.bodyHtml,
      metadata,
      colophon: options.showColophon
        ? ['SabotPress Printlab', renderData.title, post.publishedDateLabel, post.slug].filter(Boolean).join(' / ')
        : '',
      panels: layout === PrintLayouts.ZINE_SHEET || layout === PrintLayouts.BOOKLET
        ? buildZinePanels(post, renderData, options)
        : [],
      options,
      renderData,
    }
  },
}
