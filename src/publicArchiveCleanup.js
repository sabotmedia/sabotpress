function decodeEntities(value = '') {
  if (typeof document === 'undefined') return String(value || '')
  const textarea = document.createElement('textarea')
  textarea.innerHTML = String(value || '')
  return textarea.value
}

function cleanText(value = '') {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripShortcodes(value = '') {
  return String(value || '').replace(/\[[^\]\r\n]{1,96}\]/g, ' ')
}

function stripArchiveExcerpt(raw = '') {
  const decoded = decodeEntities(raw)
  if (!decoded) return ''

  let value = decoded
  if (/<[a-z][\s\S]*>/i.test(value) && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(value, 'text/html')
    doc.querySelectorAll('script, style, noscript, img, video, audio, iframe, a:empty').forEach((node) => node.remove())
    value = doc.body?.textContent || ''
  } else {
    value = value.replace(/<[^>]*>/g, ' ')
  }

  value = cleanText(stripShortcodes(value))
  if (!value) return ''
  if (value.length > 230) {
    value = `${value.slice(0, 230).replace(/\s+\S*$/, '')}…`
  }
  return value
}

function cleanArchiveExcerpts() {
  if (!/^\/archive(?:\/|$)/.test(window.location.pathname || '')) return
  document.querySelectorAll('.archive-card__excerpt').forEach((node) => {
    const raw = node.textContent || ''
    const cleaned = stripArchiveExcerpt(raw)
    if (!cleaned) {
      node.hidden = true
      return
    }
    if (node.dataset.sabotExcerptCleaned === cleaned) return
    node.textContent = cleaned
    node.dataset.sabotExcerptCleaned = cleaned
    node.hidden = false
  })
}

function boot() {
  let scheduled = false
  const schedule = () => {
    if (scheduled) return
    scheduled = true
    window.requestAnimationFrame(() => {
      scheduled = false
      cleanArchiveExcerpts()
    })
  }

  cleanArchiveExcerpts()

  if (typeof MutationObserver !== 'undefined' && document.body) {
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  }

  window.addEventListener('popstate', schedule)
  window.addEventListener('sabot:navigation', schedule)
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()
}
