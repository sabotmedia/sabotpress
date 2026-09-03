import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { openDesktopDatabase } from '../desktop/sqlite-d1.mjs'
import { FilesystemBucket } from '../desktop/filesystem-r2.mjs'
import { startLocalSabotPress } from '../desktop/local-server.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const desktopMain = fs.readFileSync(new URL('../desktop/main.mjs', import.meta.url), 'utf8')
function tempRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'sabotpress-desktop-')) }

test('desktop D1 adapter persists SQLite data with D1-shaped results', async () => {
  const root = tempRoot()
  const db = openDesktopDatabase({ databasePath: path.join(root, 'test.sqlite3') })
  try {
    await db.exec('CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL)')
    const run = await db.prepare('INSERT INTO notes (id, body) VALUES (?, ?)').bind('one', 'hello').run()
    assert.equal(run.success, true)
    assert.equal(run.meta.changes, 1)
    const row = await db.prepare('SELECT id, body FROM notes WHERE id = ?').bind('one').first()
    assert.deepEqual(row, { id: 'one', body: 'hello' })
    const all = await db.prepare('SELECT id FROM notes').all()
    assert.deepEqual(all.results, [{ id: 'one' }])
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('desktop media adapter stores and range-reads files', async () => {
  const root = tempRoot()
  const bucket = new FilesystemBucket(path.join(root, 'media'))
  try {
    await bucket.put('media/uploads/test/hello.txt', Buffer.from('hello world'), { httpMetadata: { contentType: 'text/plain' } })
    const head = await bucket.head('media/uploads/test/hello.txt')
    assert.equal(head.size, 11)
    assert.equal(head.httpMetadata.contentType, 'text/plain')
    const object = await bucket.get('media/uploads/test/hello.txt', { range: { offset: 6, length: 5 } })
    assert.equal(Buffer.from(await object.arrayBuffer()).toString('utf8'), 'world')
    await bucket.delete('media/uploads/test/hello.txt')
    assert.equal(await bucket.head('media/uploads/test/hello.txt'), null)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('desktop local server boots the real API with local owner permission', async () => {
  const root = tempRoot()
  const runtime = await startLocalSabotPress({ appRoot: repoRoot, dataRoot: root })
  try {
    const sessionResponse = await fetch(`${runtime.url}/api/session`)
    assert.equal(sessionResponse.status, 200)
    const session = await sessionResponse.json()
    assert.equal(session.authenticated, true)
    assert.equal(session.authMode, 'desktop-local')
    assert.equal(session.role, 'owner')

    const setupResponse = await fetch(`${runtime.url}/api/publishing-setup`)
    assert.equal(setupResponse.status, 200)
    const setup = await setupResponse.json()
    assert.equal(setup.ok, true)
    assert.equal(setup.mode, 'd1')

    const campaignsResponse = await fetch(`${runtime.url}/api/campaigns?includeDrafts=1`)
    const campaignsText = await campaignsResponse.text()
    assert.equal(campaignsResponse.status, 200, campaignsText)
    const campaigns = JSON.parse(campaignsText)
    assert.equal(campaigns.ok, true)
    assert.ok(Array.isArray(campaigns.items))
  } finally {
    await runtime.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('desktop Publish menu targets canonical admin routes', () => {
  assert.match(desktopMain, /openLocal\('\/wp-admin\/system-backup'\)/)
  assert.match(desktopMain, /openLocal\('\/wp-admin\/settings\/domains'\)/)
  assert.doesNotMatch(desktopMain, /openLocal\('\/backup'\)/)
  assert.doesNotMatch(desktopMain, /openLocal\('\/sites'\)/)
})
