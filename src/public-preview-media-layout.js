const PREVIEW_STORAGE_PREFIX = 'sabot-native-preview-v1:'

function previewSnapshot() {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search || '')
  const previewId = params.get('preview') || params.get('sabotPreviewPost')
  if (!previewId) return null

  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${PREVIEW_STORAGE_PREFIX}${previewId}`) || 'null')
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function isMediaOnlyHtml(html = '') {
  if (typeof DOMParser === 'undefined') return false
  try {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
    doc.querySelectorAll('script, style').forEach((node) => node.remove())
    const text = String(doc.body?.textContent || '').replace(/\u00a0/g, ' ').trim()
    return Boolean(doc.querySelector('img, picture, figure, video, iframe')) && !text
  } catch {
    return false
  }
}

function shouldUseMediaPreview(snapshot) {
  if (!snapshot) return false
  if (snapshot.previewLayout === 'media') return true
  const type = String(snapshot.contentType || snapshot.type || '').toLowerCase()
  if (['print', 'comic', 'zine'].includes(type)) return true
  return isMediaOnlyHtml(snapshot.bodyHtml || snapshot.body || '')
}

function hideDuplicateMediaBody(snapshot) {
  if (!shouldUseMediaPreview(snapshot)) return
  const article = document.querySelector('.piece-body-wrap--public-post')
  const content = article?.querySelector('.piece-body__content')
  if (!article || !content) return

  const text = String(content.textContent || '').replace(/\u00a0/g, ' ').trim()
  const media = content.querySelector('img, picture, figure, video, iframe')
  if (!text && media) {
    article.hidden = true
  }
}

function applyPreviewMediaLayout() {
  const snapshot = previewSnapshot()
  const enabled = shouldUseMediaPreview(snapshot)
  document.body.classList.toggle('is-sabot-preview-media', enabled)
  document.body.classList.toggle('is-sabot-preview-article', Boolean(snapshot) && !enabled)
  if (enabled) hideDuplicateMediaBody(snapshot)
}

function boot() {
  applyPreviewMediaLayout()
  window.setTimeout(applyPreviewMediaLayout, 100)
  window.setTimeout(applyPreviewMediaLayout, 500)
  window.setTimeout(applyPreviewMediaLayout, 1200)

  const observer = new MutationObserver(() => applyPreviewMediaLayout())
  observer.observe(document.body, { childList: true, subtree: true })
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
}
