const CACHE_VERSION = 'sabotpress-pwa-v1'
const DB_NAME = 'sabotpress-browser-local'
const DB_VERSION = 1
const BLOBS = 'blobs'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(['./', './index.html', './site.webmanifest'])).catch(() => undefined))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]))
})

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error || new Error('local media database unavailable'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'key' })
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function localBlobResponse(request, url) {
  const marker = '/__local_media/'
  const index = url.pathname.lastIndexOf(marker)
  if (index < 0) return new Response('Not found', { status: 404 })
  const id = decodeURIComponent(url.pathname.slice(index + marker.length))
  const db = await openDb()
  const row = await new Promise((resolve, reject) => {
    const tx = db.transaction(BLOBS, 'readonly')
    const query = tx.objectStore(BLOBS).get(id)
    query.onsuccess = () => resolve(query.result)
    query.onerror = () => reject(query.error)
  })
  if (!row?.blob) return new Response('Local media not found', { status: 404 })
  const headers = new Headers({
    'content-type': row.metadata?.mimeType || row.blob.type || 'application/octet-stream',
    'cache-control': 'no-store',
  })
  if (url.searchParams.get('download') === '1') {
    const filename = String(row.metadata?.filename || 'download').replace(/["\r\n]/g, '')
    headers.set('content-disposition', `attachment; filename="${filename}"`)
  }
  return new Response(row.blob, { status: 200, headers })
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.includes('/__local_media/')) {
    event.respondWith(localBlobResponse(request, url).catch(() => new Response('Local media unavailable', { status: 503 })))
    return
  }

  if (url.pathname.includes('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone()
      caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy)).catch(() => {})
      return response
    }).catch(async () => (await caches.match('./index.html')) || (await caches.match('./')) || new Response('SabotPress is offline and the app shell has not been cached yet.', { status: 503 })))
    return
  }

  event.respondWith(caches.match(request).then((cached) => {
    const network = fetch(request).then((response) => {
      if (response.ok && ['script', 'style', 'font', 'image', 'manifest', 'worker'].includes(request.destination)) {
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone())).catch(() => {})
      }
      return response
    })
    return cached || network
  }))
})
