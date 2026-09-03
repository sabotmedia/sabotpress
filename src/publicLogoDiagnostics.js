// Temporary-free public logo guard: if the bundled logo fails to paint, expose the image state in the DOM for CSS fallback.
if (typeof window !== 'undefined') {
  const apply = () => {
    document.querySelectorAll('.publication-topbar__brand-image').forEach((img) => {
      const sync = () => {
        const ok = Boolean(img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)
        img.closest('.publication-topbar__brand-link')?.classList.toggle('has-broken-logo', !ok)
      }
      sync()
      img.addEventListener('load', sync, { once: true })
      img.addEventListener('error', sync, { once: true })
    })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true })
  else apply()
}
