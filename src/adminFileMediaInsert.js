function isAdminPostEditor() {
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

function selectedMediaButton() {
  return document.querySelector('.wp-media-modal .wp-media-item.is-selected')
}

function selectedMediaData() {
  const button = selectedMediaButton()
  if (!button) return null
  const url = button.getAttribute('data-media-url') || ''
  const title = button.getAttribute('data-media-title') || 'Download file'
  const mediaType = (button.getAttribute('data-media-type') || '').toLowerCase()
  const mimeType = (button.getAttribute('data-media-mime') || '').toLowerCase()
  const isImage = mediaType === 'image' || mediaType === 'svg' || mimeType.startsWith('image/')
  if (!url || isImage) return null
  return { url, title, mediaType, mimeType }
}

function insertHtmlIntoVisualEditor(markup) {
  const editor = document.querySelector('.native-content-editor__visual[contenteditable="true"]')
  if (!editor) return false
  editor.focus()
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  if (range && editor.contains(range.commonAncestorContainer)) {
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
  } else {
    editor.insertAdjacentHTML('beforeend', markup)
  }
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertHTML', data: markup }))
  editor.dispatchEvent(new Event('blur', { bubbles: true }))
  return true
}

function insertTextIntoTextarea(markup) {
  const textarea = document.querySelector('.native-content-editor__textarea')
  if (!textarea) return false
  const start = textarea.selectionStart ?? textarea.value.length
  const end = textarea.selectionEnd ?? textarea.value.length
  textarea.value = `${textarea.value.slice(0, start)}\n${markup}\n${textarea.value.slice(end)}`
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

function closeMediaModal() {
  const closeButton = [...document.querySelectorAll('.wp-media-modal .button')].find((button) => button.textContent?.trim().toLowerCase() === 'close')
  closeButton?.click()
}

function handleSelectClick(event) {
  if (!isAdminPostEditor()) return
  const button = event.target?.closest?.('button')
  if (!button || button.textContent?.trim().toLowerCase() !== 'select') return
  if (!button.closest('.wp-media-modal')) return

  const media = selectedMediaData()
  if (!media) return

  event.preventDefault()
  event.stopPropagation()
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()

  const details = button.closest('.wp-media-modal__details')
  const caption = details?.querySelector('textarea')?.value?.trim?.() || ''
  const label = caption || media.title || 'Download file'
  const escapedUrl = escapeHtmlAttribute(media.url)
  const escapedLabel = escapeHtmlText(label)
  const markup = `<p><a href="${escapedUrl}" target="_blank" rel="noopener noreferrer">${escapedLabel}</a></p><p><br /></p>`

  if (!insertHtmlIntoVisualEditor(markup)) insertTextIntoTextarea(markup)
  closeMediaModal()
}

window.addEventListener('click', handleSelectClick, true)
