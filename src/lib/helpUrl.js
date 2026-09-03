export function helpUrl(section = 'install') {
  const anchor = String(section || 'install').replace(/^#/, '')
  if (typeof document !== 'undefined') {
    const manifestHref = document.querySelector('link[rel="manifest"]')?.href
    if (manifestHref) {
      try { return `${new URL('help.html', new URL('.', manifestHref)).href}#${anchor}` } catch { /* use root fallback */ }
    }
  }
  return `/help.html#${anchor}`
}
