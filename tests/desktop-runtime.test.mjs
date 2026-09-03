import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openDesktopDatabase } from '../desktop/sqlite-d1.mjs'
import { FilesystemBucket } from '../desktop/filesystem-r2.mjs'

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
