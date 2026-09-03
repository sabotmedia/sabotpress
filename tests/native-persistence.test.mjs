import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../src/lib/nativePublicContent.js', import.meta.url), 'utf8')

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `missing ${startMarker}`)
  assert.notEqual(end, -1, `missing ${endMarker}`)
  return source.slice(start, end)
}

test('native production reads do not merge or fall back to localStorage', () => {
  const body = between('export async function loadNativeCollection', 'export function saveNativeCollection')
  assert.doesNotMatch(body, /loadLocalNativeCollection|localStorage|catch\s*\{/)
  assert.match(body, /data\.mode === 'scaffold'/)
})

test('manual native saves require confirmed server persistence', () => {
  const body = between('export async function upsertNativeEntryWithMeta', 'export async function deleteNativeEntry')
  assert.doesNotMatch(body, /synced:\s*false|saveNativeCollection|catch\s*\{/)
  assert.match(body, /Native content save did not receive confirmed D1 persistence/)
})

test('native deletes never mutate only the browser after API failure', () => {
  const body = between('export async function deleteNativeEntry', 'export function exportNativeCollection')
  assert.doesNotMatch(body, /saveNativeCollection|catch\s*\{/)
  assert.match(body, /removeNativeEntry/)
})

test('legacy browser content remains explicitly recoverable', () => {
  assert.match(source, /export function loadLegacyNativeCollection/)
})
