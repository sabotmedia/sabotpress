const BROWSER_LOCAL_ENV = String(import.meta.env?.VITE_SABOT_RUNTIME || '').toLowerCase() === 'browser-local'

export const RUNTIME_MODES = Object.freeze({
  BROWSER_LOCAL: 'browser-local',
  DESKTOP: 'desktop-local',
  SERVER: 'server',
})

export function getRuntimeMode() {
  if (typeof window !== 'undefined' && window.sabotDesktop) return RUNTIME_MODES.DESKTOP
  if (BROWSER_LOCAL_ENV) return RUNTIME_MODES.BROWSER_LOCAL
  return RUNTIME_MODES.SERVER
}

export function isBrowserLocalRuntime() { return getRuntimeMode() === RUNTIME_MODES.BROWSER_LOCAL }
export function isDesktopRuntime() { return getRuntimeMode() === RUNTIME_MODES.DESKTOP }
export function isLocalRuntime() { return isBrowserLocalRuntime() || isDesktopRuntime() }
export function isServerRuntime() { return getRuntimeMode() === RUNTIME_MODES.SERVER }

export function runtimeLabel() {
  if (isBrowserLocalRuntime()) return 'Stored on this device'
  if (isDesktopRuntime()) return 'Local desktop'
  return 'Server'
}

export function runtimeCapabilities() {
  const browser = isBrowserLocalRuntime()
  const desktop = isDesktopRuntime()
  return {
    mode: getRuntimeMode(),
    local: browser || desktop,
    browser,
    desktop,
    server: !browser && !desktop,
    hasFileSystemAccess: desktop || (typeof window !== 'undefined' && 'showOpenFilePicker' in window),
    hasOpfs: typeof navigator !== 'undefined' && Boolean(navigator.storage?.getDirectory),
    canInstallPwa: browser,
  }
}
