import { useMemo, useState } from 'react'
import { buildPublicPostUrl, isPreviewDirty } from '../lib/publicSiteRouting'

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

export function PublicDomainCard({
  inputSlug = '',
  savedSlug = '',
  origin,
}) {
  const [copied, setCopied] = useState(false)

  const displayedUrl = useMemo(
    () => buildPublicPostUrl({ origin, slug: inputSlug }),
    [inputSlug, origin]
  )

  const dirty = useMemo(
    () => isPreviewDirty(savedSlug, inputSlug),
    [savedSlug, inputSlug]
  )

  async function onCopy() {
    const ok = await copyText(displayedUrl)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  function onOpen() {
    window.open(displayedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="wp-meta-box public-domain-card" aria-label="Public URL preview">
      <h3>Public preview URL</h3>
      <p>
        <code>{displayedUrl}</code>
      </p>
      {dirty ? <p className="wp-helper-text">Preview differs from saved</p> : null}
      <p>
        <button type="button" className="button" onClick={onOpen}>Open preview</button>{' '}
        <button type="button" className="button" onClick={onCopy}>{copied ? 'Copied' : 'Copy URL'}</button>
      </p>
    </section>
  )
}
