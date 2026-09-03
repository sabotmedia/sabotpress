function isEditorRoute() {
  if (typeof window === 'undefined') return false
  return /\/(wp-admin\/post-new\.php|wp-admin\/native-bridge|native-bridge)(?:\/|$)/.test(window.location.pathname)
}

function escapeHtmlAttribute(value = '') {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeHtmlText(value = '') {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function cleanPastedHref(value = '') {
  let raw = String(value || '')
    .replace(/&amp;/g, '&')
    .trim()

  raw = raw.replace(/^\s*(url|href|link)\s*:\s*/i, '').trim()
  raw = raw.replace(/^\s*(url|href|link)\s*=\s*/i, '').trim()
  raw = raw.replace(/^['"“”‘’<]+|['"“”‘’>]+$/g, '').trim()

  const markdownMatch = raw.match(/^\[[^\]]*\]\(([^)]+)\)$/)
  if (markdownMatch?.[1]) raw = markdownMatch[1].trim()

  const hrefMatch = raw.match(/href\s*=\s*['"]([^'"]+)['"]/i)
  if (hrefMatch?.[1]) raw = hrefMatch[1].trim()

  const urlMatch = raw.match(/(https?:\/\/[^\s<>'"]+|mailto:[^\s<>'"]+|tel:[^\s<>'"]+|\/[^\s<>'"]+|#[^\s<>'"]+)/i)
  if (urlMatch?.[1]) raw = urlMatch[1].trim()

  raw = raw.replace(/^\s*(url|href|link)\s*:\s*/i, '').trim()
  raw = raw.replace(/^['"“”‘’<]+|['"“”‘’>]+$/g, '').trim()
  return raw
}

function normalizeHref(value = '') {
  const raw = cleanPastedHref(value)
  if (!raw) return ''
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(raw)) return raw
  return `https://${raw}`
}

function editorElements() {
  return {
    visual: document.querySelector('.native-content-editor__visual[contenteditable="true"]'),
    textarea: document.querySelector('.native-content-editor__textarea'),
  }
}

function getTextSelection(textarea) {
  if (!textarea) return null
  return {
    mode: 'text',
    start: textarea.selectionStart ?? textarea.value.length,
    end: textarea.selectionEnd ?? textarea.value.length,
    text: textarea.value.slice(textarea.selectionStart ?? 0, textarea.selectionEnd ?? 0),
  }
}

function getVisualSelection(visual) {
  const selection = window.getSelection?.()
  if (!visual || !selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!visual.contains(range.commonAncestorContainer)) return null
  return {
    mode: 'visual',
    range: range.cloneRange(),
    text: selection.toString(),
  }
}

let savedSelection = null

function rememberSelection() {
  if (!isEditorRoute()) return
  const { visual, textarea } = editorElements()
  const active = document.activeElement
  if (textarea && active === textarea) {
    savedSelection = getTextSelection(textarea)
    return
  }
  const visualSelection = getVisualSelection(visual)
  if (visualSelection) savedSelection = visualSelection
}

function setNativeTextValue(textarea, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  if (setter) setter.call(textarea, value)
  else textarea.value = value
}

function insertIntoTextarea(markdown) {
  const { textarea } = editorElements()
  if (!textarea) return false
  const selection = savedSelection?.mode === 'text' ? savedSelection : getTextSelection(textarea)
  const start = selection?.start ?? textarea.value.length
  const end = selection?.end ?? textarea.value.length
  const next = `${textarea.value.slice(0, start)}${markdown}${textarea.value.slice(end)}`
  setNativeTextValue(textarea, next)
  textarea.focus()
  const cursor = start + markdown.length
  textarea.selectionStart = cursor
  textarea.selectionEnd = cursor
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

function insertIntoVisual(markup) {
  const { visual } = editorElements()
  if (!visual) return false
  visual.focus()
  const selection = window.getSelection?.()
  let range = savedSelection?.mode === 'visual' ? savedSelection.range : getVisualSelection(visual)?.range
  if (!range || !visual.contains(range.commonAncestorContainer)) {
    range = document.createRange()
    range.selectNodeContents(visual)
    range.collapse(false)
  }
  selection.removeAllRanges()
  selection.addRange(range)
  range.deleteContents()
  const fragment = range.createContextualFragment(markup)
  const lastNode = fragment.lastChild
  range.insertNode(fragment)
  if (lastNode) {
    const nextRange = document.createRange()
    nextRange.setStartAfter(lastNode)
    nextRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(nextRange)
  }
  visual.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertHTML', data: markup }))
  visual.dispatchEvent(new Event('blur', { bubbles: true }))
  return true
}

function selectedTextFallback() {
  rememberSelection()
  return String(savedSelection?.text || '').trim()
}

function insertLink({ url, label }) {
  const href = normalizeHref(url)
  const text = String(label || href || 'link').trim()
  if (!href || !text) return false

  const active = document.activeElement
  const { visual, textarea } = editorElements()
  const isTextMode = Boolean(textarea && (active === textarea || !visual || savedSelection?.mode === 'text'))

  if (isTextMode) {
    return insertIntoTextarea(`[${text}](${href})`)
  }

  const markup = `<a href="${escapeHtmlAttribute(href)}" target="_blank" rel="noopener noreferrer">${escapeHtmlText(text)}</a>`
  return insertIntoVisual(markup)
}

function closePanels(root = document) {
  root.querySelectorAll('.native-link-tool.is-open').forEach((node) => node.classList.remove('is-open'))
}

function createLinkTool() {
  const wrap = document.createElement('div')
  wrap.className = 'native-link-tool'
  wrap.innerHTML = `
    <button class="button native-link-tool__toggle" type="button">Insert hyperlink</button>
    <div class="native-link-tool__panel" hidden>
      <label>
        <span>Link text</span>
        <input class="native-link-tool__text" type="text" placeholder="Text readers click" />
      </label>
      <label>
        <span>URL</span>
        <input class="native-link-tool__url" type="url" placeholder="https://example.org/zine.pdf" />
      </label>
      <div class="native-link-tool__actions">
        <button class="button button--primary native-link-tool__insert" type="button">Add link</button>
        <button class="button native-link-tool__cancel" type="button">Cancel</button>
      </div>
    </div>
  `

  const toggle = wrap.querySelector('.native-link-tool__toggle')
  const panel = wrap.querySelector('.native-link-tool__panel')
  const textInput = wrap.querySelector('.native-link-tool__text')
  const urlInput = wrap.querySelector('.native-link-tool__url')
  const insertButton = wrap.querySelector('.native-link-tool__insert')
  const cancelButton = wrap.querySelector('.native-link-tool__cancel')

  toggle.addEventListener('mousedown', (event) => {
    event.preventDefault()
    rememberSelection()
  })

  toggle.addEventListener('click', () => {
    const isOpen = wrap.classList.contains('is-open')
    closePanels()
    if (isOpen) return
    textInput.value = selectedTextFallback()
    urlInput.value = ''
    wrap.classList.add('is-open')
    panel.hidden = false
    requestAnimationFrame(() => urlInput.focus())
  })

  cancelButton.addEventListener('click', () => {
    wrap.classList.remove('is-open')
    panel.hidden = true
  })

  insertButton.addEventListener('click', () => {
    const ok = insertLink({ url: urlInput.value, label: textInput.value || selectedTextFallback() })
    if (ok) {
      wrap.classList.remove('is-open')
      panel.hidden = true
      textInput.value = ''
      urlInput.value = ''
    }
  })

  urlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      insertButton.click()
    }
    if (event.key === 'Escape') cancelButton.click()
  })

  textInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') cancelButton.click()
  })

  return wrap
}

function injectLinkTool() {
  if (!isEditorRoute()) return
  const chrome = document.querySelector('.native-content-editor__chrome')
  if (!chrome || chrome.querySelector('.native-link-tool')) return
  chrome.append(createLinkTool())
}

function boot() {
  injectLinkTool()
  document.addEventListener('selectionchange', rememberSelection)
  window.addEventListener('mouseup', rememberSelection, true)
  window.addEventListener('keyup', rememberSelection, true)
  const observer = new MutationObserver(injectLinkTool)
  observer.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('popstate', injectLinkTool)
  window.addEventListener('audiolab:navigation', injectLinkTool)
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
}
