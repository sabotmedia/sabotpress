import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const editor = fs.readFileSync(new URL('../src/components/NativeContentBridgePage.jsx', import.meta.url), 'utf8')
const revisionApi = fs.readFileSync(new URL('../functions/api/native-content-revisions.js', import.meta.url), 'utf8')
const nativeApi = fs.readFileSync(new URL('../functions/api/native-content.js', import.meta.url), 'utf8')

test('native editor autosave is D1-authoritative', () => {
  assert.match(editor, /upsertNativeEntryWithMeta\(items, normalized, 'autosave'\)/)
  assert.doesNotMatch(editor, /upsertNativeEntryLocal/)
  assert.match(editor, /Autosaved to D1/)
  assert.match(editor, /Autosave failed:/)
})

test('native revision history loads and restores through server APIs', () => {
  assert.match(editor, /fetchNativeRevisions\(\{ nativeId: postId \}\)/)
  assert.match(editor, /restoreNativeRevision\(revision\.id\)/)
  assert.match(editor, /data\.mode !== 'd1'/)
  assert.match(editor, /Revision restored in D1/)
  assert.doesNotMatch(editor, /saveLocalRevision/)
})

test('legacy browser revisions are recovery-only and cannot silently autosave', () => {
  assert.match(editor, /sabot-native-local-revisions-v1/)
  assert.match(editor, /Legacy browser recovery snapshots/)
  assert.match(editor, /never merged into D1 automatically/)
  assert.match(editor, /if \(!activeId \|\| recoverySnapshotLoaded\) return/)
  assert.match(editor, /Autosave is paused until you explicitly save it/)
})

test('revision API fails closed without BF_DB', () => {
  assert.match(revisionApi, /databaseUnavailable\('native revision reads'\)/)
  assert.match(revisionApi, /databaseUnavailable\('native revision restore'\)/)
  assert.doesNotMatch(revisionApi, /mode: 'scaffold'/)
})

test('every server native write records revision snapshots', () => {
  assert.match(nativeApi, /saveRevisionSnapshot\(db, existing, `before:\$\{revisionNote\}`\)/)
  assert.match(nativeApi, /saveRevisionSnapshot\(db, saved, revisionNote\)/)
})
