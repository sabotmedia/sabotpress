const DB_NAME = 'sabotpress-browser-local'
const DB_VERSION = 1
const RECORDS = 'records'
const BLOBS = 'blobs'

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available in this browser.'))
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error || new Error('Could not open local publication storage.'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(RECORDS)) db.createObjectStore(RECORDS, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
  })
  return dbPromise
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Local storage operation failed.'))
  })
}

async function store(name, mode = 'readonly') {
  const db = await openDb()
  return db.transaction(name, mode).objectStore(name)
}

export async function localGet(key) {
  const objectStore = await store(RECORDS)
  const row = await requestResult(objectStore.get(String(key)))
  return row?.value ?? null
}

export async function localSet(key, value) {
  const objectStore = await store(RECORDS, 'readwrite')
  await requestResult(objectStore.put({ key: String(key), value, updatedAt: new Date().toISOString() }))
  return value
}

export async function localDelete(key) {
  const objectStore = await store(RECORDS, 'readwrite')
  await requestResult(objectStore.delete(String(key)))
}

export async function localList(prefix = '') {
  const objectStore = await store(RECORDS)
  const rows = await requestResult(objectStore.getAll())
  return (rows || []).filter((row) => String(row.key || '').startsWith(prefix)).map((row) => row.value)
}

export async function localEntries(prefix = '') {
  const objectStore = await store(RECORDS)
  const rows = await requestResult(objectStore.getAll())
  return (rows || []).filter((row) => String(row.key || '').startsWith(prefix))
}

export async function localPutBlob(key, blob, metadata = {}) {
  if (!(blob instanceof Blob)) throw new Error('Local media storage requires a Blob or File.')
  const objectStore = await store(BLOBS, 'readwrite')
  await requestResult(objectStore.put({ key: String(key), blob, metadata, updatedAt: new Date().toISOString() }))
  return { key: String(key), metadata }
}

export async function localGetBlob(key) {
  const objectStore = await store(BLOBS)
  return requestResult(objectStore.get(String(key)))
}

export async function localDeleteBlob(key) {
  const objectStore = await store(BLOBS, 'readwrite')
  await requestResult(objectStore.delete(String(key)))
}

export async function localBlobEntries() {
  const objectStore = await store(BLOBS)
  return (await requestResult(objectStore.getAll())) || []
}

export async function clearBrowserLocalPublication() {
  const db = await openDb()
  await Promise.all([RECORDS, BLOBS].map((name) => new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite')
    const request = tx.objectStore(name).clear()
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('Could not clear local publication storage.'))
  })))
}

export async function browserLocalStorageEstimate() {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return { usage: 0, quota: 0 }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return { usage, quota }
}

export async function requestPersistentBrowserStorage() {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  try { return Boolean(await navigator.storage.persist()) } catch { return false }
}
