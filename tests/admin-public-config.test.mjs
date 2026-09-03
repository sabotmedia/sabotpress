import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const card = fs.readFileSync(new URL('../src/components/AdminPublicConfigCard.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/admin-public-config.css', import.meta.url), 'utf8')

test('customize panel reports D1 state and visible backend errors', () => {
  assert.match(card, /D1 connected/)
  assert.match(card, /D1 unavailable/)
  assert.match(card, /Configuration error/)
  assert.match(card, /loadError/)
  assert.match(card, /saveError/)
})

test('customize panel does not present local-only actions as production saves', () => {
  assert.doesNotMatch(card, /applyDraftLocally/)
  assert.doesNotMatch(card, /clearSavedConfig/)
  assert.match(card, /Save changes to D1/)
  assert.match(card, /Reload from D1/)
})

test('admin styling overrides old public black theme', () => {
  assert.match(css, /background:\s*#fff !important/)
  assert.match(css, /color:\s*#1d2327 !important/)
})
