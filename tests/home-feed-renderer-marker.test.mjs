import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const homepage = fs.readFileSync(new URL('../src/components/NativeUpdatesPage.jsx', import.meta.url), 'utf8')
const docs = fs.readFileSync(new URL('../docs/home-feed-v3.md', import.meta.url), 'utf8')

test('homepage exposes a deterministic renderer marker for deployment verification', () => {
  assert.match(homepage, /data-home-renderer="v3"/)
  assert.match(homepage, /data-home-grid="v3"/)
  assert.match(docs, /data-home-renderer="v3"/)
})
