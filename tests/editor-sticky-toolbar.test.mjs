import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/admin-editor-sticky-toolbar.css', import.meta.url), 'utf8')

test('post editor chrome stays pinned below the fixed desktop admin bar', () => {
  assert.match(css, /\.native-content-editor__chrome\s*\{[\s\S]*?position:\s*sticky\s*!important/)
  assert.match(css, /--sabot-editor-sticky-top:\s*32px/)
  assert.match(css, /top:\s*var\(--sabot-editor-sticky-top\)\s*!important/)
  assert.match(css, /\.native-bridge-main\s*\{[\s\S]*?overflow-x:\s*clip\s*!important[\s\S]*?overflow-y:\s*visible\s*!important/)
})

test('editor ancestors do not trap sticky controls in a non-scrolling overflow box', () => {
  const shellRule = css.match(/\.admin-frame__main:has\(\.wp-edit-screen\),\s*\.wp-edit-screen\s*\{[^}]*\}/)?.[0] || ''
  assert.match(shellRule, /overflow-x:\s*clip\s*!important/)
  assert.match(shellRule, /overflow-y:\s*visible\s*!important/)
  assert.doesNotMatch(shellRule, /overflow(?:-x)?:\s*hidden/)
})

test('sticky editor offsets account for mobile admin chrome without overlaying it', () => {
  assert.match(css, /@media \(max-width:\s*980px\)[\s\S]*--sabot-editor-sticky-top:\s*78px/)
  assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*--sabot-editor-sticky-top:\s*90px/)
  assert.match(css, /not\(\.admin-frame--rail-collapsed\)[\s\S]*\.admin-rail\s*\{[\s\S]*position:\s*relative\s*!important/)
  assert.match(css, /is-sabot-distraction-free[\s\S]*top:\s*0\s*!important/)
})

test('desktop post settings remain sticky and independently scrollable', () => {
  assert.match(css, /\.native-bridge-layout\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) 280px\s*!important/)
  assert.match(css, /\.native-bridge-sidebar\.native-bridge-sidebar--open\s*\{[\s\S]*position:\s*sticky\s*!important/)
  assert.match(css, /max-height:\s*calc\(100dvh - var\(--sabot-editor-sticky-top\) - 16px\)\s*!important/)
  assert.match(css, /overflow-y:\s*auto\s*!important/)
  assert.match(css, /@media \(max-width:\s*1100px\)[\s\S]*\.native-bridge-sidebar\.native-bridge-sidebar--open\s*\{[\s\S]*position:\s*static\s*!important/)
})

test('sticky editor authority loads after legacy and mobile admin styles', () => {
  const stickyIndex = main.indexOf("import './admin-editor-sticky-toolbar.css'")
  assert.ok(stickyIndex > main.indexOf("import './admin-classic-editor-toolbar.css'"))
  assert.ok(stickyIndex > main.indexOf("import './admin-editor-focus-mode-fix.css'"))
  assert.ok(stickyIndex > main.indexOf("import './sitewide-mobile-polish.css'"))
})
