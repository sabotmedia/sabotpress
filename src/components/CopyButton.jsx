import { useState } from 'react'

export function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button className="button button--primary" type="button" onClick={handleCopy}>
      {copied ? 'copied' : 'copy snippet'}
    </button>
  )
}
