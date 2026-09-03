import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../src/lib/collections.js', import.meta.url), 'utf8')

function functionBody(name, nextName) {
  const start = source.indexOf(`export async function ${name}`)
  assert.notEqual(start, -1, `${name} must exist`)
  const end = nextName ? source.indexOf(`export function ${nextName}`, start) : source.length
  assert.notEqual(end, -1, `${nextName} must follow ${name}`)
  return source.slice(start, end)
}

test('collection reads never silently fall back to browser storage', () => {
  const body = functionBody('loadCollectionsAsync', 'saveCollections')
  assert.doesNotMatch(body, /return\s+loadCollections\s*\(/)
  assert.match(body, /throw\s+createPersistenceError\('load'/)
})

test('collection saves require a confirmed API response', () => {
  const body = functionBody('upsertCollectionAsync', 'deleteCollection')
  assert.doesNotMatch(body, /mode:\s*['"]local['"]|return\s+upsertCollection\s*\(/)
  assert.match(body, /throw\s+createPersistenceError\('save'/)
})

test('collection deletes require a confirmed API response', () => {
  const body = source.slice(source.indexOf('export async function deleteCollectionAsync'), source.indexOf('export function findCollection'))
  assert.doesNotMatch(body, /return\s+deleteCollection\s*\(/)
  assert.match(body, /throw\s+createPersistenceError\('delete'/)
})
