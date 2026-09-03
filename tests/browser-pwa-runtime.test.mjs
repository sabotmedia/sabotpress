import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) { return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8') }

test('browser-local runtime is explicit and separate from desktop and server modes', () => {
  const src = read('src/lib/runtime.js')
  assert.match(src, /BROWSER_LOCAL:\s*'browser-local'/)
  assert.match(src, /DESKTOP:\s*'desktop-local'/)
  assert.match(src, /SERVER:\s*'server'/)
  assert.match(src, /VITE_SABOT_RUNTIME/)
})

test('browser-local persistence uses IndexedDB records and blob stores rather than content localStorage', () => {
  const src = read('src/lib/browserLocalDb.js')
  assert.match(src, /indexedDB\.open/)
  assert.match(src, /const RECORDS = 'records'/)
  assert.match(src, /const BLOBS = 'blobs'/)
  assert.doesNotMatch(src, /localStorage/)
})

test('browser-local API keeps ordinary editorial API calls on the device', () => {
  const src = read('src/lib/browserLocalApi.js')
  assert.match(src, /url\.origin === window\.location\.origin && url\.pathname\.startsWith\('\/api\/'\)/)
  assert.match(src, /handleLocalApi/)
  assert.match(src, /mode: 'browser-local'/)
  assert.match(src, /authenticated: true/)
  assert.match(src, /Local owner/)
})

test('PWA has a manifest, offline service worker, install prompt and local media handling', () => {
  const manifest = JSON.parse(read('public/site.webmanifest'))
  const sw = read('public/sw.js')
  const pwa = read('src/lib/pwaRuntime.js')
  assert.equal(manifest.name, 'SabotPress')
  assert.equal(manifest.display, 'standalone')
  assert.match(manifest.start_url, /#\/welcome/)
  assert.match(sw, /__local_media/)
  assert.match(sw, /request\.mode === 'navigate'/)
  assert.match(sw, /caches\.open/)
  assert.match(pwa, /beforeinstallprompt/)
  assert.match(pwa, /serviceWorker\.register/)
})

test('local editions do not expose a normal logout flow in admin navigation', () => {
  const rail = read('src/components/AdminRail.jsx')
  assert.match(rail, /isLocalRuntime/)
  assert.match(rail, /No account is required in this local edition/)
  assert.match(rail, /localRuntime \?/[\s\S]*Log Out/)
})

test('portable backup includes the core publication families and embedded media', () => {
  const backup = read('src/lib/portableBackup.js')
  for (const name of ['setup', 'publicConfig', 'nativeContent', 'collections', 'publications', 'podcast', 'campaigns', 'translations', 'media', 'feedSettings']) assert.match(backup, new RegExp(name))
  assert.match(backup, /mediaFiles/)
  assert.match(backup, /dataBase64/)
  assert.match(backup, /importPortableBackup/)
})

test('fresh local installs do not load the bundled imported archive', () => {
  const pieces = read('src/lib/pieces.js')
  assert.match(pieces, /if \(isLocalRuntime\(\)\) return \[\]/)
})

test('default HTML and PWA manifest do not identify the application as Sabot Media', () => {
  const html = read('index.html')
  const manifest = read('public/site.webmanifest')
  assert.doesNotMatch(html, /Sabot Media|AberdeenLocal1312|kolektiva\.social/)
  assert.doesNotMatch(manifest, /Sabot Media|Aberdeen/)
})

test('browser first run explains local storage and routes completion to the newsroom', () => {
  const welcome = read('src/components/DesktopWelcomePage.jsx')
  assert.match(welcome, /Start on this device/)
  assert.match(welcome, /No account/)
  assert.match(welcome, /requestPersistentBrowserStorage/)
  assert.match(welcome, /browserLocal \? '\/wp-admin'/)
})
