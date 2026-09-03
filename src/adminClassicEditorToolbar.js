const LINK_PREFIX_RE = /^\s*(url|href|link)\s*[:=]\s*/i

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

function cleanUrl(value = '') {
  let raw = String(value || '').replace(/&amp;/g, '&').trim()
  raw = raw.replace(LINK_PREFIX_RE, '').trim()
  raw = raw.replace(/^['"“”‘’<]+|['"“”‘’>]+$/g, '').trim()
  const markdown = raw.match(/^\[[^\]]*\]\(([^)]+)\)$/)
  if (markdown?.[1]) raw = markdown[1].trim()
  const href = raw.match(/href\s*=\s*['"]([^'"]+)['"]/i)
  if (href?.[1]) raw = href[1].trim()
  const url = raw.match(/(https?:\/\/[^\s<>'"]+|mailto:[^\s<>'"]+|tel:[^\s<>'"]+|\/[^\s<>'"]+|#[^\s<>'"]+)/i)
  if (url?.[1]) raw = url[1].trim()
  raw = raw.replace(LINK_PREFIX_RE, '').trim()
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

function isTextMode() {
  const { textarea } = editorElements()
  return Boolean(textarea)
}

function selectedText() {
  const { visual, textarea } = editorElements()
  if (textarea) return textarea.value.slice(textarea.selectionStart ?? 0, textarea.selectionEnd ?? 0)
  const selection = window.getSelection?.()
  if (!selection?.rangeCount || !visual) return ''
  const range = selection.getRangeAt(0)
  if (!visual.contains(range.commonAncestorContainer)) return ''
  return selection.toString()
}

function dispatchTextareaUpdate(textarea, value, cursorStart, cursorEnd = cursorStart) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  if (setter) setter.call(textarea, value)
  else textarea.value = value
  textarea.focus()
  textarea.selectionStart = cursorStart
  textarea.selectionEnd = cursorEnd
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.dispatchEvent(new Event('change', { bubbles: true }))
}

function mutateTextarea(mutator) {
  const { textarea } = editorElements()
  if (!textarea) return false
  const start = textarea.selectionStart ?? 0
  const end = textarea.selectionEnd ?? 0
  const value = textarea.value || ''
  const selected = value.slice(start, end)
  const result = mutator({ value, selected, start, end })
  if (!result) return false
  dispatchTextareaUpdate(textarea, result.value, result.start, result.end ?? result.start)
  return true
}

function wrapText(opener, closer = opener, fallback = 'text') {
  return mutateTextarea(({ value, selected, start, end }) => {
    const inner = selected || fallback
    const next = `${value.slice(0, start)}${opener}${inner}${closer}${value.slice(end)}`
    return { value: next, start: start + opener.length, end: start + opener.length + inner.length }
  })
}

function prefixLines(prefix) {
  return mutateTextarea(({ value, selected, start, end }) => {
    if (!selected) {
      const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
      const lineEndIndex = value.indexOf('\n', start)
      const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex
      const line = value.slice(lineStart, lineEnd)
      const nextLine = `${prefix}${line}`
      return {
        value: `${value.slice(0, lineStart)}${nextLine}${value.slice(lineEnd)}`,
        start: lineStart + prefix.length,
        end: lineStart + nextLine.length,
      }
    }
    const nextSelected = selected.split('\n').map((line) => `${prefix}${line}`).join('\n')
    return {
      value: `${value.slice(0, start)}${nextSelected}${value.slice(end)}`,
      start,
      end: start + nextSelected.length,
    }
  })
}

function textFormat(tag) {
  const lower = String(tag || 'p').toLowerCase()
  return mutateTextarea(({ value, selected, start, end }) => {
    const inner = selected || (lower === 'p' ? 'Paragraph text' : `${tag.toUpperCase()} text`)
    const snippet = `<${lower}>${inner}</${lower}>`
    return {
      value: `${value.slice(0, start)}${snippet}${value.slice(end)}`,
      start: start + lower.length + 2,
      end: start + lower.length + 2 + inner.length,
    }
  })
}

function visualCommand(command, value = null) {
  const { visual } = editorElements()
  if (!visual) return false
  visual.focus()
  document.execCommand(command, false, value)
  visual.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'formatSetBlockTextDirection' }))
  visual.dispatchEvent(new Event('blur', { bubbles: true }))
  return true
}

function insertVisualHtml(markup) {
  const { visual } = editorElements()
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
  const fragment = range.createContextualFragment(markup)
  const lastNode = fragment.lastChild
  range.insertNode(fragment)
  if (lastNode && selection) {
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

function insertLink(urlValue, labelValue = '') {
  const href = cleanUrl(urlValue)
  const selectionText = selectedText().trim()
  const label = String(labelValue || selectionText || href || 'link').trim()
  if (!href || !label) return false

  if (isTextMode()) {
    return mutateTextarea(({ value, selected, start, end }) => {
      const text = labelValue || selected || label
      const snippet = `[${text}](${href})`
      return {
        value: `${value.slice(0, start)}${snippet}${value.slice(end)}`,
        start: start + 1,
        end: start + 1 + text.length,
      }
    })
  }

  const selection = window.getSelection?.()
  const { visual } = editorElements()
  if (visual && selection?.rangeCount) {
    const range = selection.getRangeAt(0)
    if (visual.contains(range.commonAncestorContainer) && !range.collapsed && !labelValue) {
      const a = document.createElement('a')
      a.href = href
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      try {
        range.surroundContents(a)
      } catch {
        return insertVisualHtml(`<a href="${escapeHtmlAttribute(href)}" target="_blank" rel="noopener noreferrer">${escapeHtmlText(label)}</a>`)
      }
      visual.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertLink' }))
      visual.dispatchEvent(new Event('blur', { bubbles: true }))
      return true
    }
  }

  return insertVisualHtml(`<a href="${escapeHtmlAttribute(href)}" target="_blank" rel="noopener noreferrer">${escapeHtmlText(label)}</a>`)
}

function runAction(action, value = null) {
  if (action === 'format') {
    if (isTextMode()) return textFormat(value || 'p')
    return visualCommand('formatBlock', value || 'p')
  }
  if (action === 'bold') return isTextMode() ? wrapText('**') : visualCommand('bold')
  if (action === 'italic') return isTextMode() ? wrapText('*') : visualCommand('italic')
  if (action === 'strike') return isTextMode() ? wrapText('<s>', '</s>') : visualCommand('strikeThrough')
  if (action === 'ul') return isTextMode() ? prefixLines('- ') : visualCommand('insertUnorderedList')
  if (action === 'ol') return isTextMode() ? prefixLines('1. ') : visualCommand('insertOrderedList')
  if (action === 'quote') return isTextMode() ? prefixLines('> ') : visualCommand('formatBlock', 'blockquote')
  if (action === 'left') return visualCommand('justifyLeft')
  if (action === 'center') return visualCommand('justifyCenter')
  if (action === 'right') return visualCommand('justifyRight')
  if (action === 'unlink') return isTextMode() ? false : visualCommand('unlink')
  if (action === 'hr') return isTextMode() ? wrapText('\n<hr />\n', '', '') : visualCommand('insertHorizontalRule')
  if (action === 'remove') return isTextMode() ? false : visualCommand('removeFormat')
  if (action === 'indent') return isTextMode() ? prefixLines('    ') : visualCommand('indent')
  if (action === 'outdent') return isTextMode() ? false : visualCommand('outdent')
  if (action === 'undo') return visualCommand('undo')
  if (action === 'redo') return visualCommand('redo')
  if (action === 'special') return isTextMode() ? wrapText('Ω', '', '') : insertVisualHtml('Ω')
  return false
}

function button(label, action, title, extra = '') {
  return `<button class="wp-classic-toolbar__button ${extra}" type="button" data-classic-action="${action}" title="${title}" aria-label="${title}">${label}</button>`
}

function createToolbar() {
  const root = document.createElement('div')
  root.className = 'wp-classic-toolbar'
  root.setAttribute('data-sabot-classic-toolbar', 'true')
  root.innerHTML = `
    <div class="wp-classic-toolbar__row wp-classic-toolbar__row--main">
      <select class="wp-classic-toolbar__format" aria-label="Block format">
        <option value="p">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="h4">Heading 4</option>
        <option value="h5">Heading 5</option>
        <option value="h6">Heading 6</option>
        <option value="pre">Preformatted</option>
      </select>
      ${button('<strong>B</strong>', 'bold', 'Bold')}
      ${button('<em>I</em>', 'italic', 'Italic')}
      ${button('Bullets', 'ul', 'Bulleted list')}
      ${button('Numbered', 'ol', 'Numbered list')}
      ${button('Quote', 'quote', 'Blockquote')}
      ${button('Left', 'left', 'Align left')}
      ${button('Center', 'center', 'Align center')}
      ${button('Right', 'right', 'Align right')}
      ${button('Link', 'link', 'Insert/edit link', 'wp-classic-toolbar__link-toggle')}
      ${button('Rule', 'hr', 'Horizontal line')}
      ${button('More', 'toggle', 'Show more tools')}
      <button class="wp-classic-toolbar__fullscreen" type="button" title="Distraction-free writing" aria-label="Distraction-free writing">Focus</button>
    </div>
    <div class="wp-classic-toolbar__row wp-classic-toolbar__row--extra">
      ${button('Strike', 'strike', 'Strikethrough')}
      ${button('Clear', 'remove', 'Clear formatting')}
      ${button('Symbol', 'special', 'Special character')}
      ${button('Outdent', 'outdent', 'Decrease indent')}
      ${button('Indent', 'indent', 'Increase indent')}
      ${button('Undo', 'undo', 'Undo')}
      ${button('Redo', 'redo', 'Redo')}
      ${button('Help', 'help', 'Keyboard shortcuts')}
    </div>
    <div class="wp-classic-toolbar__link-panel" hidden>
      <label><span>URL</span><input class="wp-classic-toolbar__url" type="url" placeholder="https://example.org/zine.pdf" /></label>
      <label><span>Link text</span><input class="wp-classic-toolbar__text" type="text" placeholder="Text readers click" /></label>
      <button class="button button--primary wp-classic-toolbar__insert-link" type="button">Add Link</button>
      <button class="button wp-classic-toolbar__cancel-link" type="button">Cancel</button>
    </div>
  `

  root.querySelector('.wp-classic-toolbar__format')?.addEventListener('change', (event) => {
    runAction('format', event.target.value)
    event.target.value = 'p'
  })

  root.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-classic-action]')
    if (!actionButton) return
    event.preventDefault()
    const action = actionButton.getAttribute('data-classic-action')
    if (action === 'toggle') {
      root.classList.toggle('is-extra-collapsed')
      return
    }
    if (action === 'help') {
      window.alert('Classic editor shortcuts: Ctrl/Cmd+B bold, Ctrl/Cmd+I italic, Ctrl/Cmd+K link, Enter creates a new paragraph in Visual mode.')
      return
    }
    if (action === 'link') {
      const panel = root.querySelector('.wp-classic-toolbar__link-panel')
      const textInput = root.querySelector('.wp-classic-toolbar__text')
      const urlInput = root.querySelector('.wp-classic-toolbar__url')
      textInput.value = selectedText().trim()
      urlInput.value = ''
      panel.hidden = false
      root.classList.add('is-link-open')
      requestAnimationFrame(() => urlInput.focus())
      return
    }
    runAction(action)
  })

  root.querySelector('.wp-classic-toolbar__insert-link')?.addEventListener('click', () => {
    const panel = root.querySelector('.wp-classic-toolbar__link-panel')
    const textInput = root.querySelector('.wp-classic-toolbar__text')
    const urlInput = root.querySelector('.wp-classic-toolbar__url')
    if (insertLink(urlInput.value, textInput.value)) {
      panel.hidden = true
      root.classList.remove('is-link-open')
      textInput.value = ''
      urlInput.value = ''
    }
  })

  root.querySelector('.wp-classic-toolbar__cancel-link')?.addEventListener('click', () => {
    root.querySelector('.wp-classic-toolbar__link-panel').hidden = true
    root.classList.remove('is-link-open')
  })

  root.querySelectorAll('.wp-classic-toolbar__url, .wp-classic-toolbar__text').forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        root.querySelector('.wp-classic-toolbar__insert-link')?.click()
      }
      if (event.key === 'Escape') root.querySelector('.wp-classic-toolbar__cancel-link')?.click()
    })
  })

  return root
}

function injectToolbar() {
  if (!isEditorRoute()) return
  const chrome = document.querySelector('.native-content-editor__chrome')
  if (!chrome || chrome.querySelector('[data-sabot-classic-toolbar]')) return
  const mediaRow = chrome.querySelector('.native-content-editor__media-row')
  const toolbar = createToolbar()
  if (mediaRow?.nextSibling) chrome.insertBefore(toolbar, mediaRow.nextSibling)
  else chrome.append(toolbar)
}

function boot() {
  injectToolbar()
  const observer = new MutationObserver(injectToolbar)
  observer.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('popstate', injectToolbar)
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
}
