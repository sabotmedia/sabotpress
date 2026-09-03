import { isBrowserLocalRuntime } from './runtime'

export const PWA_INSTALL_EVENT = 'sabotpress:pwa-install-available'
let deferredPrompt = null

export function registerSabotPressServiceWorker() {
  if (!isBrowserLocalRuntime() || typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event
    window.dispatchEvent(new CustomEvent(PWA_INSTALL_EVENT, { detail: { available: true } }))
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    window.dispatchEvent(new CustomEvent(PWA_INSTALL_EVENT, { detail: { available: false, installed: true } }))
  })
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {})
    }, { once: true })
  }
}

export function canPromptPwaInstall() { return Boolean(deferredPrompt) }

export async function promptPwaInstall() {
  if (!deferredPrompt) return { available: false, outcome: 'unavailable' }
  const prompt = deferredPrompt
  deferredPrompt = null
  await prompt.prompt()
  const choice = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' }))
  window.dispatchEvent(new CustomEvent(PWA_INSTALL_EVENT, { detail: { available: false, outcome: choice?.outcome || 'dismissed' } }))
  return { available: true, outcome: choice?.outcome || 'dismissed' }
}

export function isPwaStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true
}
