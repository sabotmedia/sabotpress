import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const rail = fs.readFileSync(new URL('../src/components/AdminRail.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/admin-navigation.css', import.meta.url), 'utf8')
const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')

test('admin rail is grouped instead of rendering a flat route dump', () => {
  for (const group of ['Content', 'Publishing', 'Media & Labs', 'Site', 'System']) {
    assert.match(rail, new RegExp(`label: '${group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`))
  }
  assert.match(rail, /admin-rail__group-toggle/)
  assert.match(rail, /aria-expanded=/)
  assert.match(rail, /admin-rail__subnav/)
})

test('admin rail defaults compact and exposes an accessible hamburger toggle', () => {
  assert.match(rail, /return stored === null \? true/)
  assert.match(rail, /Expand admin navigation/)
  assert.match(rail, /Collapse admin navigation/)
  assert.match(rail, /☰/)
})

test('collapsed rail actually reduces layout width and mobile nav can close', () => {
  assert.match(css, /admin-frame--rail-collapsed[\s\S]*grid-template-columns:\s*54px/)
  assert.match(css, /max-width:\s*980px/)
  assert.match(css, /admin-frame--rail-collapsed \.admin-rail__nav[\s\S]*display:\s*none/)
  assert.match(main, /import '\.\/admin-navigation\.css'/)
})
