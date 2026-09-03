import { useEffect, useMemo, useRef } from 'react'
import { usePublicEdit } from './PublicEditContext'
import { getConfiguredStyle, getConfiguredText } from '../lib/publicConfig'
import { useResolvedConfig } from '../lib/useResolvedConfig'
import { escapeHtml, insertPlainTextAsEditableHtml, plainTextToEditableHtml, sanitizeEditableHtml } from '../lib/editableHtml'

function defaultToHtml(children, multiline) {
  if (typeof children === 'string') return multiline ? plainTextToEditableHtml(children) : escapeHtml(children)
  return ''
}

export function EditableText({ as: Tag = 'div', className = '', children, field, multiline = false, ...elementProps }) {
  const {
    isEditing,
    isAdmin,
    isConfigReady,
    selectedField,
    setSelectedField,
    updateText,
  } = usePublicEdit()
  const elementRef = useRef(null)
  const isFocusedRef = useRef(false)
  const lastHtmlRef = useRef('')
  const resolvedConfig = useResolvedConfig()
  const canEditInline = isEditing && isAdmin && isConfigReady

  const fallbackHtml = useMemo(() => defaultToHtml(children, multiline), [children, multiline])
  const configuredText = getConfiguredText(resolvedConfig, field, fallbackHtml)
  const editableHtml = sanitizeEditableHtml(configuredText, { multiline })
  const renderedHtml = sanitizeEditableHtml(configuredText, { multiline, linkifyText: true })
  const configuredHtml = isEditing && isAdmin ? editableHtml : renderedHtml
  const draftStyle = getConfiguredStyle(resolvedConfig, field)
  const isSelected = canEditInline && selectedField === field

  const style = useMemo(() => {
    const out = {}
    if (draftStyle.fontSize) out.fontSize = draftStyle.fontSize
    if (draftStyle.lineHeight) out.lineHeight = draftStyle.lineHeight
    if (draftStyle.maxWidth) out.maxWidth = draftStyle.maxWidth
    if (draftStyle.letterSpacing) out.letterSpacing = draftStyle.letterSpacing
    if (draftStyle.textTransform) out.textTransform = draftStyle.textTransform
    return out
  }, [draftStyle])

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    if (canEditInline && isFocusedRef.current) return
    if (element.innerHTML !== configuredHtml) {
      element.innerHTML = configuredHtml
      lastHtmlRef.current = configuredHtml
    }
  }, [canEditInline, configuredHtml])

  function commitCurrentHtml() {
    const element = elementRef.current
    if (!element) return
    const nextHtml = sanitizeEditableHtml(element.innerHTML, { multiline })
    if (nextHtml !== element.innerHTML) {
      element.innerHTML = nextHtml
    }
    if (nextHtml !== lastHtmlRef.current) {
      lastHtmlRef.current = nextHtml
      updateText(field, nextHtml)
    }
  }

  return (
    <Tag
      {...elementProps}
      ref={elementRef}
      className={`${className} ${canEditInline ? 'editable-text editable-text--active' : ''} ${isSelected ? 'editable-text--selected' : ''}`.trim()}
      data-field={field}
      style={style}
      contentEditable={canEditInline}
      suppressContentEditableWarning
      spellCheck={canEditInline}
      tabIndex={canEditInline ? 0 : undefined}
      title={canEditInline ? 'Click and type to edit' : undefined}
      onClick={(event) => {
        if (!canEditInline) return
        event.stopPropagation()
        setSelectedField(field)
      }}
      onFocus={() => {
        if (!canEditInline) return
        isFocusedRef.current = true
        setSelectedField(field)
      }}
      onBlur={() => {
        if (!canEditInline) return
        isFocusedRef.current = false
        commitCurrentHtml()
      }}
      onPaste={(event) => {
        if (!canEditInline) return
        const text = event.clipboardData?.getData('text/plain')
        if (!text) return
        event.preventDefault()
        if (multiline) {
          insertPlainTextAsEditableHtml(text)
        } else {
          document.execCommand?.('insertText', false, text.replace(/\s+/g, ' ').trim())
        }
      }}
      dangerouslySetInnerHTML={{ __html: configuredHtml }}
    />
  )
}
