const MEDIA_POST_RE = /\/(zine|comic|comics|reader|print|manifesto|saboteurs)\b|\b(zine|comic|reader|print|manifesto|saboteurs)\b/i

function normalizeUrl(value = '') {
  try {
    const parsed = new URL(String(value || ''), window.location.origin)
    parsed.hash = ''
    return `${parsed.origin}${parsed.pathname}${parsed.search}`
  } catch {
    return String(value || '').trim()
  }
}

function isPostRoute() {
  return /^\/post\/[^/]+/.test(window.location.pathname || '')
}

function shouldUseMediaLayout() {
  if (!isPostRoute()) return false
  const slug = decodeURIComponent((window.location.pathname || '').replace(/^\/post\//, '').replace(/\/.*$/, ''))
  const title = document.querySelector('.piece-article-lead h1, .piece-article-lead__title-below h1, .screen-reader-only')?.textContent || ''
  const meta = Array.from(document.querySelectorAll('.piece-article-lead__meta span')).map((node) => node.textContent || '').join(' ')
  if (MEDIA_POST_RE.test(`${slug} ${title} ${meta}`)) return true

  const hero = document.querySelector('.piece-article-lead__image')
  const body = document.querySelector('.piece-body__content')
  const bodyImages = body ? Array.from(body.querySelectorAll('img')) : []
  const text = String(body?.textContent || '').replace(/\s+/g, ' ').trim()
  return Boolean(hero && bodyImages.length && text.length < 320)
}

function removeDuplicateHeroFromBody() {
  const hero = document.querySelector('.piece-article-lead__image')
  const body = document.querySelector('.piece-body__content')
  if (!hero || !body) return
  const heroSrc = normalizeUrl(hero.getAttribute('src') || hero.currentSrc || '')
  if (!heroSrc) return
  const images = Array.from(body.querySelectorAll('img'))
  images.forEach((img, index) => {
    const src = normalizeUrl(img.getAttribute('src') || img.currentSrc || '')
    if (!src || src !== heroSrc) return
    const holder = img.closest('figure, p, .post-body__figure, .post-body__block') || img
    const holderText = String(holder.textContent || '').replace(/\s+/g, ' ').trim()
    if (index === 0 || holderText.length < 80) holder.remove()
  })
}

function makeDownloadLinksVisible() {
  document.querySelectorAll('.piece-body__content a[href], .public-experience-sections a[href]').forEach((link) => {
    link.classList.add('sabot-visible-download-link')
    if (!link.getAttribute('target') && /^https?:\/\//i.test(link.getAttribute('href') || '')) {
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

function apply() {
  if (shouldUseMediaLayout()) {
    document.body.classList.add('is-sabot-preview-media')
    removeDuplicateHeroFromBody()
  } else {
    document.body.classList.remove('is-sabot-preview-media')
  }
  makeDownloadLinksVisible()
}

if (typeof window !== 'undefined') {
  const boot = () => {
    apply()
    const observer = new MutationObserver(() => apply())
    observer.observe(document.body, { childList: true, subtree: true })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()
}
