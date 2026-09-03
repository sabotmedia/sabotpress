import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [main, runtime, css] = await Promise.all([
  readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/audioLabStandalone.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/audio-lab-standalone.css', import.meta.url), 'utf8'),
])

test('AudioLab admin links open the named dedicated studio window through the root bootstrap document', () => {
  assert.match(runtime, /sabot-audiolab-studio/)
  assert.match(runtime, /STUDIO_BOOT_PARAM = 'audiolab-studio'/)
  assert.match(runtime, /url = new URL\('\/', window\.location\.origin\)/)
  assert.match(runtime, /url\.searchParams\.set\(STUDIO_BOOT_PARAM, '1'\)/)
  assert.match(runtime, /window\.open\(url\.href, STUDIO_WINDOW_NAME/)
  assert.match(runtime, /window\.location\.assign\(url\.href\)/)
})

test('cold Studio bootstrap rewrites to the protected AudioLab route before the app renders', () => {
  assert.match(runtime, /bootstrapStudioRoute\(\)/)
  assert.match(runtime, /pathname !== '\/'/)
  assert.match(runtime, /params\.get\(STUDIO_BOOT_PARAM\) !== '1'/)
  assert.match(runtime, /params\.set\(STUDIO_PARAM, '1'\)/)
  assert.match(runtime, /\/wp-admin\/audiolab/)
  assert.match(runtime, /window\.history\.replaceState\(window\.history\.state, '', next\)/)

  const standaloneRuntime = main.indexOf("import './audioLabStandalone.js'")
  const keyboardRuntime = main.indexOf("import './audioLabKeyboardShortcuts.js'")
  const menuRuntime = main.indexOf("import './audioLabAudacityMenu.js'")
  assert.ok(standaloneRuntime >= 0 && keyboardRuntime > standaloneRuntime && menuRuntime > standaloneRuntime)
})

test('standalone AudioLab removes admin chrome and owns the whole viewport', () => {
  assert.match(css, /\.wp-admin-topbar,[\s\S]*?\.admin-rail[\s\S]*?display:\s*none\s*!important/)
  assert.match(css, /\.audio-lab-page[\s\S]*?width:\s*100vw\s*!important[\s\S]*?height:\s*100dvh\s*!important/)
  assert.match(css, /\.audio-lab-multitrack-inner[\s\S]*?repeat\(var\(--al-track-count, 1\),\s*minmax\(132px, 1fr\)\)/)
  assert.match(runtime, /countTrackRows/)
})

test('standalone runtime never observes the whole document and cannot self-trigger on title changes', () => {
  assert.doesNotMatch(runtime, /observe\(document\.documentElement/)
  assert.doesNotMatch(runtime, /observe\(document\.body/)
  assert.match(runtime, /trackObserver\.observe\(inner, \{ childList: true, subtree: false \}\)/)
  assert.match(runtime, /!document\.title\.startsWith\(prefix\)/)
})

test('standalone AudioLab authority loads after earlier AudioLab layout CSS', () => {
  const dialogAuthority = main.indexOf("import './audio-lab-dialog-track-focus.css'")
  const standaloneAuthority = main.indexOf("import './audio-lab-standalone.css'")
  const runtimeIndex = main.indexOf("import './audioLabStandalone.js'")
  assert.ok(dialogAuthority >= 0 && standaloneAuthority > dialogAuthority && runtimeIndex >= 0)
})
