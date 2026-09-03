import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { openDesktopDatabase } from './sqlite-d1.mjs'
import { FilesystemBucket } from './filesystem-r2.mjs'

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
}

export async function startLocalSabotPress({ appRoot, dataRoot, port = 0 }) {
  const databasePath = path.join(dataRoot, 'sabotpress.sqlite3')
  const mediaRoot = path.join(dataRoot, 'media')
  const db = openDesktopDatabase({ databasePath, schemaDirectory: path.join(appRoot, 'db') })
  const bucket = new FilesystemBucket(mediaRoot)
  const secretFile = path.join(dataRoot, '.desktop-session-secret')
  fs.mkdirSync(dataRoot, { recursive: true })
  let sessionSecret = ''
  try { sessionSecret = fs.readFileSync(secretFile, 'utf8').trim() } catch {}
  if (!sessionSecret) {
    sessionSecret = crypto.randomUUID() + crypto.randomUUID()
    fs.writeFileSync(secretFile, sessionSecret, { mode: 0o600 })
  }

  const env = {
    BF_DB: db,
    SABOT_MEDIA_BUCKET: bucket,
    SABOT_DESKTOP_LOCAL: 'true',
    SABOT_SESSION_SECRET: sessionSecret,
    SABOT_ADMIN_TOKEN: 'desktop-local',
    SABOT_DEPLOYMENT_PROVIDER: 'desktop-local',
    SABOT_DEPLOYMENT_DNS_TARGET: '',
  }

  const server = http.createServer(async (req, res) => {
    try {
      const origin = `http://127.0.0.1:${server.address()?.port || port}`
      const url = new URL(req.url || '/', origin)
      if (url.pathname.startsWith('/api/')) return await handleApi({ req, res, url, appRoot, env })
      return serveStatic({ req, res, url, distRoot: path.join(appRoot, 'dist') })
    } catch (error) {
      res.statusCode = 500
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end(String(error?.stack || error))
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      await new Promise((resolve) => server.close(resolve))
      db.close()
    },
    dataRoot,
  }
}

async function handleApi({ req, res, url, appRoot, env }) {
  const body = await readRequestBody(req)
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(', '))
    else if (value != null) headers.set(name, String(value))
  }
  headers.delete('x-sabot-desktop')
  headers.set('x-sabot-desktop', 'local-runtime')

  const request = new Request(url, {
    method: req.method || 'GET',
    headers,
    body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : body,
    duplex: body ? 'half' : undefined,
  })

  const resolved = resolveApiModule(appRoot, url.pathname)
  if (!resolved) return writeNodeResponse(res, new Response(JSON.stringify({ ok: false, error: 'API route not found' }), { status: 404, headers: { 'content-type': 'application/json' } }))

  const module = await import(pathToFileURL(resolved.file).href)
  const methodName = `onRequest${String(req.method || 'GET').toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}`
  const handler = module[methodName] || module.onRequest
  if (typeof handler !== 'function') return writeNodeResponse(res, new Response('method not allowed', { status: 405 }))

  const context = {
    request,
    env,
    params: resolved.params,
    data: { desktop: true },
    waitUntil() {},
    passThroughOnException() {},
    next: async () => new Response('not found', { status: 404 }),
  }

  const response = await handler(context)
  return writeNodeResponse(res, response instanceof Response ? response : new Response(response == null ? '' : String(response)))
}

function resolveApiModule(appRoot, pathname) {
  const apiRoot = path.join(appRoot, 'functions', 'api')
  const segments = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  const exactCandidates = [
    path.join(apiRoot, ...segments) + '.js',
    path.join(apiRoot, ...segments, 'index.js'),
  ]
  for (const file of exactCandidates) if (fs.existsSync(file)) return { file, params: {} }

  let directory = apiRoot
  const params = {}
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    const directDir = path.join(directory, segment)
    const directFile = path.join(directory, `${segment}.js`)
    if (index === segments.length - 1 && fs.existsSync(directFile)) return { file: directFile, params }
    if (fs.existsSync(directDir) && fs.statSync(directDir).isDirectory()) { directory = directDir; continue }

    const entries = fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }) : []
    const dynamicDir = entries.find((entry) => entry.isDirectory() && /^\[.+\]$/.test(entry.name))
    const dynamicFile = entries.find((entry) => entry.isFile() && /^\[.+\]\.js$/.test(entry.name))
    if (dynamicDir) {
      params[dynamicDir.name.slice(1, -1)] = segment
      directory = path.join(directory, dynamicDir.name)
      continue
    }
    if (index === segments.length - 1 && dynamicFile) {
      params[dynamicFile.name.slice(1, -4)] = segment
      return { file: path.join(directory, dynamicFile.name), params }
    }
    return null
  }

  const indexFile = path.join(directory, 'index.js')
  return fs.existsSync(indexFile) ? { file: indexFile, params } : null
}

function serveStatic({ req, res, url, distRoot }) {
  let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')
  if (!relative) relative = 'index.html'
  let target = path.resolve(distRoot, relative)
  const root = path.resolve(distRoot)
  if (!target.startsWith(root + path.sep) && target !== root) return writeNodeResponse(res, new Response('not found', { status: 404 }))
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) target = path.join(root, 'index.html')
  if (!fs.existsSync(target)) return writeNodeResponse(res, new Response('SabotPress build not found', { status: 503 }))
  const bytes = fs.readFileSync(target)
  res.statusCode = 200
  res.setHeader('content-type', MIME[path.extname(target).toLowerCase()] || 'application/octet-stream')
  res.setHeader('cache-control', target.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable')
  if (req.method === 'HEAD') return res.end()
  res.end(bytes)
}

async function writeNodeResponse(res, response) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  if (!response.body) return res.end()
  const bytes = Buffer.from(await response.arrayBuffer())
  res.end(bytes)
}

async function readRequestBody(req) {
  if (['GET', 'HEAD'].includes(req.method || 'GET')) return undefined
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return chunks.length ? Buffer.concat(chunks) : undefined
}
