import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
const guard = await readFile(new URL('../src/audioLabSpaRuntimeGuard.js', import.meta.url), 'utf8')
const layout = await readFile(new URL('../src/audio-lab-dialog-track-focus.css', import.meta.url), 'utf8')

test('AudioLab SPA lifecycle bridge loads after Audacity menu runtimes', () => {
  const menuIndex = main.indexOf("import './audioLabAudacityMenu.js'")
  const toolsIndex = main.indexOf("import './audioLabAudacityQuickTools.js'")
  const guardIndex = main.indexOf("import './audioLabSpaRuntimeGuard.js'")
  assert.ok(menuIndex >= 0, 'Audacity menu runtime should be imported')
  assert.ok(toolsIndex > menuIndex, 'quick tools should load after the menu runtime')
  assert.ok(guardIndex > toolsIndex, 'SPA lifecycle bridge must load after route-aware AudioLab runtimes')
})

test('AudioLab SPA lifecycle bridge reinitializes route-aware tools on rendered page entry', () => {
  assert.match(guard, /MutationObserver/)
  assert.match(guard, /audio-lab-page/)
  assert.match(guard, /\/wp-admin\\\/audiolab/)
  assert.match(guard, /dispatchEvent\(new PopStateEvent\('popstate'/)
  assert.match(guard, /page === observedPage/)
})

test('multitrack viewport owns remaining editor height and tracks flex into it', () => {
  assert.match(layout, /\.audio-lab-page \.audio-lab-multitrack\s*\{[\s\S]*height: 100% !important;[\s\S]*grid-template-rows: 30px minmax\(0, 1fr\) !important;/)
  assert.match(layout, /\.audio-lab-page \.audio-lab-multitrack-scroll\s*\{[\s\S]*height: 100% !important;[\s\S]*overflow-y: auto !important;/)
  assert.match(layout, /\.audio-lab-page \.audio-lab-multitrack-inner\s*\{[\s\S]*min-height: 100% !important;[\s\S]*height: 100% !important;[\s\S]*display: flex !important;/)
  assert.match(layout, /\.audio-lab-page \.audio-lab-multitrack-row\s*\{[\s\S]*flex: 1 1 var\(--al-track-working-height\) !important;[\s\S]*max-height: none !important;/)
  assert.doesNotMatch(layout, /padding-bottom:\s*40px/)
})
