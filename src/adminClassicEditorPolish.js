const SPECIAL_CHARS = [
  '©', '®', '™', '§', '¶', '•', '…', '–', '—',
  '“', '”', '‘', '’', '«', '»',
  'Ω', 'µ', 'π', '÷', '×', '±', '°',
  '¢', '£', '€', '¥',
  '←', '→', '↑', '↓', '↔',
]

function isEditorRoute() {
  if (typeof window === 'undefined') return false
  return /\/(wp-admin\/post-new\.php|wp-admin\/native-bridge|native-bridge)(?:\/|$)/.test(window.location.pathname)
}

function editorElements() {
  return {
    visual: document.querySelector('.native-content-editor__visual[contenteditable="true"]'),
    textarea: document.querySelector('.native-content-editor__textarea'),
  }
}

function dispatchTextareaValue(textarea, value, cursor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  if (setter) setter.call(textarea, value)
  else textarea.value = value
  textarea.focus()
  textarea.selectionStart = cursor
  textarea.selectionEnd = cursor
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.dispatchEvent(new Event('change', { bubbles: true }))
}

function insertText(value = '') {
  const text = String(value || '')
  if (!text) return false
  const { visual, textarea } = editorElements()

  if (textarea) {
    const start = textarea.selectionStart ?? textarea.value.length
    const end = textarea.selectionEnd ?? textarea.value.length
    const next = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`
    dispatchTextareaValue(textarea, next, start + text.length)
    return true
  }

  if (!visual) return false
  visual.focus()
  const selection = window.getSelection?.()
  let range = selection?.rangeCount ? selection.getRangeAt(0) : null
  if (!range || !visual.contains(range.commonAncestorContainer)) {
    range = document.createRange()
    range.selectNodeContents(visual)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
  visual.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
  visual.dispatchEvent(new Event('blur', { bubbles: true }))
  return true
}

function closeSpecialPanels(root = document) {
  root.querySelectorAll('.wp-classic-special-panel').forEach((panel) => {
    panel.hidden = true
    panel.closest('.wp-classic-toolbar')?.classList.remove('is-special-open')
  })
}

function ensureSpecialPanel(toolbar) {
  let panel = toolbar.querySelector('.wp-classic-special-panel')
  if (panel) return panel
  panel = document.createElement('div')
  panel.className = 'wp-classic-special-panel'
  panel.hidden = true
  panel.innerHTML = `
    <div class="wp-classic-special-panel__header">
      <strong>Special character</strong>
      <button class="button wp-classic-special-panel__close" type="button">Close</button>
    </div>
    <div class="wp-classic-special-panel__grid">
      ${SPECIAL_CHARS.map((char) => `<button type="button" class="wp-classic-special-panel__char" data-special-char="${char}" aria-label="Insert ${char}">${char}</button>`).join('')}
    </div>
  `
  toolbar.append(panel)

  panel.addEventListener('click', (event) => {
    const close = event.target.closest('.wp-classic-special-panel__close')
    if (close) {
      event.preventDefault()
      panel.hidden = true
      toolbar.classList.remove('is-special-open')
      return
    }
    const button = event.target.closest('[data-special-char]')
    if (!button) return
    event.preventDefault()
    insertText(button.getAttribute('data-special-char') || '')
    panel.hidden = true
    toolbar.classList.remove('is-special-open')
  })

  return panel
}

function openSpecialPanel(toolbar) {
  closeSpecialPanels()
  const panel = ensureSpecialPanel(toolbar)
  panel.hidden = false
  toolbar.classList.add('is-special-open')
  requestAnimationFrame(() => panel.querySelector('[data-special-char]')?.focus())
}

function setDistractionFree(enabled) {
  document.body.classList.toggle('is-sabot-distraction-free', enabled)
  document.querySelectorAll('.wp-classic-toolbar__fullscreen').forEach((button) => {
    button.setAttribute('aria-pressed', enabled ? 'true' : 'false')
    button.title = enabled ? 'Exit distraction-free writing' : 'Distraction-free writing'
  })
  if (enabled) {
    requestAnimationFrame(() => {
      const { visual, textarea } = editorElements()
      ;(textarea || visual)?.focus()
    })
  }
}

function toggleDistractionFree() {
  setDistractionFree(!document.body.classList.contains('is-sabot-distraction-free'))
}

function handleToolbarClick(event) {
  if (!isEditorRoute()) return

  const fullscreen = event.target.closest('.wp-classic-toolbar__fullscreen')
  if (fullscreen) {
    event.preventDefault()
    event.stopPropagation()
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
    toggleDistractionFree()
    return
  }

  const special = event.target.closest('[data-classic-action="special"]')
  if (!special) return
  const toolbar = special.closest('.wp-classic-toolbar')
  if (!toolbar) return
  event.preventDefault()
  event.stopPropagation()
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
  openSpecialPanel(toolbar)
}

function handleKeydown(event) {
  if (!isEditorRoute()) return
  if (event.key === 'Escape' && document.body.classList.contains('is-sabot-distraction-free')) {
    setDistractionFree(false)
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    toggleDistractionFree()
  }
}

function boot() {
  window.addEventListener('click', handleToolbarClick, true)
  window.addEventListener('keydown', handleKeydown, true)
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
}
