import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [main, css, menu] = await Promise.all([
  readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/audio-lab-dialog-track-focus.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/audioLabAudacityMenu.js', import.meta.url), 'utf8'),
])

test('menu-opened AudioLab tools render above their backdrop as real dialogs', () => {
  assert.match(menu, /root\.dataset\.audiolabModalOpen = id/)
  assert.match(menu, /document\.body\.classList\.add\('audio-lab-modal-is-open'\)/)
  assert.match(css, /\[data-audiolab-modal-open\][\s\S]*?\.audio-lab-project-sidebar[\s\S]*?display:\s*flex\s*!important/)
  assert.match(css, /position:\s*fixed\s*!important/)
  assert.match(css, /z-index:\s*10060\s*!important/)
  assert.match(css, /audio-lab-audacity-backdrop[\s\S]*?z-index:\s*10040\s*!important/)
})

test('tracks use the remaining editing viewport instead of leaving a padded black floor', () => {
  assert.match(css, /--al-track-working-height:\s*clamp\([^)]*\)/)
  assert.match(css, /\.audio-lab-multitrack\s*\{[\s\S]*?height:\s*100%\s*!important[\s\S]*?grid-template-rows:\s*30px\s+minmax\(0,\s*1fr\)\s*!important/)
  assert.match(css, /\.audio-lab-multitrack-scroll\s*\{[\s\S]*?height:\s*100%\s*!important[\s\S]*?overflow-y:\s*auto\s*!important/)
  assert.match(css, /\.audio-lab-multitrack-inner[\s\S]*?min-height:\s*100%\s*!important[\s\S]*?display:\s*flex\s*!important[\s\S]*?flex-direction:\s*column\s*!important/)
  assert.match(css, /padding:\s*0\s*!important/)
  assert.match(css, /\.audio-lab-multitrack-row[\s\S]*?flex:\s*1\s+1\s+var\(--al-track-working-height\)\s*!important[\s\S]*?max-height:\s*none\s*!important/)
  assert.match(css, /\.audio-lab-clip[\s\S]*?bottom:\s*12px\s*!important/)
})

test('dialog and track authority loads after the legacy Audacity layout layers', () => {
  const legacy = main.indexOf("import './audio-lab-audacity-v5.css'")
  const tools = main.indexOf("import './audio-lab-audacity-tools.css'")
  const authority = main.indexOf("import './audio-lab-dialog-track-focus.css'")
  assert.ok(legacy >= 0 && tools > legacy && authority > tools)
})
