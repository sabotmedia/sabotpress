import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePublicEdit } from './PublicEditContext'
import { getConfiguredText } from '../lib/publicConfig'
import { useResolvedConfig } from '../lib/useResolvedConfig'

function isExternalHref(href = '') {
  return /^https?:\/\//i.test(String(href || ''))
}

function usesNativeAnchor(href = '') {
  const value = String(href || '')
  return isExternalHref(value) || /^(mailto|tel):/i.test(value) || /\.(xml|pdf|zip|epub|mp3|wav|ogg)(?:[?#]|$)/i.test(value) || value.startsWith('/keys/')
}

function normalizeHref(value = '') {
  const href = String(value || '').trim()
  if (!href) return '/'
  if (/^(javascript|data):/i.test(href)) return '/'
  if (isExternalHref(href) || href.startsWith('mailto:')) return href
  return href.startsWith('/') || href.startsWith('#') ? href : `/${href}`
}

export function EditableLink({
  className = '',
  hrefField,
  labelField,
  defaultHref = '/',
  defaultLabel = '',
  children,
  variant = 'link',
}) {
  const { isEditing, isAdmin, isConfigReady, selectedField, setSelectedField, updateText } = usePublicEdit()
  const [isOpen, setIsOpen] = useState(false)
  const resolvedConfig = useResolvedConfig()
  const label = getConfiguredText(resolvedConfig, labelField, defaultLabel || children || '')
  const href = normalizeHref(getConfiguredText(resolvedConfig, hrefField, defaultHref))
  const external = isExternalHref(href)
  const nativeAnchor = usesNativeAnchor(href)
  const canEditInline = isEditing && isAdmin && isConfigReady
  const selected = canEditInline && selectedField === labelField

  const popoverId = useMemo(() => `editable-link-${labelField.replace(/[^a-z0-9]+/gi, '-')}`, [labelField])
  const linkClassName = `${className} ${canEditInline ? 'editable-link editable-link--active' : ''} ${selected ? 'editable-link--selected' : ''}`.trim()

  function openEditor(event) {
    if (!canEditInline) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedField(labelField)
    setIsOpen(true)
  }

  const content = (
    <>
      <span>{label}</span>
      {isOpen && canEditInline ? (
        <span className="editable-link-popover" id={popoverId} onClick={(event) => event.stopPropagation()}>
          <label>
            <span>Label</span>
            <input value={label} onChange={(event) => updateText(labelField, event.target.value)} />
          </label>
          <label>
            <span>URL</span>
            <input value={href} onChange={(event) => updateText(hrefField, normalizeHref(event.target.value))} />
          </label>
          {external ? <small>External links open in a new tab.</small> : null}
          <button className="button" type="button" onClick={() => setIsOpen(false)}>Done</button>
        </span>
      ) : null}
    </>
  )

  if (nativeAnchor) {
    return (
      <a
        className={linkClassName}
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        aria-describedby={isOpen ? popoverId : undefined}
        onClick={openEditor}
      >
        {content}
      </a>
    )
  }

  const Tag = variant === 'button' ? Link : Link
  return (
    <Tag
      className={linkClassName}
      to={href}
      aria-describedby={isOpen ? popoverId : undefined}
      onClick={openEditor}
    >
      {content}
    </Tag>
  )
}
