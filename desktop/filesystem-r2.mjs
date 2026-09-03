import fs from 'node:fs'
import path from 'node:path'

export class FilesystemBucket {
  constructor(rootDirectory) {
    this.rootDirectory = rootDirectory
    fs.mkdirSync(rootDirectory, { recursive: true })
  }

  resolve(key) {
    const safe = String(key || '').replace(/\\/g, '/').replace(/^\/+/, '')
    if (!safe || safe.includes('..')) throw new Error('invalid media key')
    const target = path.resolve(this.rootDirectory, ...safe.split('/'))
    const root = path.resolve(this.rootDirectory)
    if (!target.startsWith(root + path.sep) && target !== root) throw new Error('invalid media key')
    return target
  }

  metadataPath(key) { return `${this.resolve(key)}.sabotmeta.json` }

  async put(key, value, options = {}) {
    const target = this.resolve(key)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const bytes = value instanceof ArrayBuffer ? Buffer.from(value) : Buffer.from(value)
    fs.writeFileSync(target, bytes)
    fs.writeFileSync(this.metadataPath(key), JSON.stringify({
      httpMetadata: options.httpMetadata || {},
      customMetadata: options.customMetadata || {},
      size: bytes.length,
      uploaded: new Date().toISOString(),
    }, null, 2))
    return { key, size: bytes.length }
  }

  readMetadata(key) {
    try { return JSON.parse(fs.readFileSync(this.metadataPath(key), 'utf8')) } catch { return {} }
  }

  async head(key) {
    const target = this.resolve(key)
    if (!fs.existsSync(target)) return null
    const stat = fs.statSync(target)
    const metadata = this.readMetadata(key)
    return {
      key,
      size: stat.size,
      uploaded: metadata.uploaded ? new Date(metadata.uploaded) : stat.mtime,
      httpMetadata: metadata.httpMetadata || {},
      customMetadata: metadata.customMetadata || {},
    }
  }

  async get(key, options = {}) {
    const head = await this.head(key)
    if (!head) return null
    let bytes = fs.readFileSync(this.resolve(key))
    const offset = Number(options?.range?.offset || 0)
    const length = Number(options?.range?.length || 0)
    if (options?.range && Number.isFinite(offset) && offset >= 0) {
      bytes = length > 0 ? bytes.subarray(offset, offset + length) : bytes.subarray(offset)
    }
    return {
      ...head,
      body: bytes,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      text: async () => bytes.toString('utf8'),
      json: async () => JSON.parse(bytes.toString('utf8')),
    }
  }

  async delete(key) {
    for (const target of [this.resolve(key), this.metadataPath(key)]) {
      try { fs.unlinkSync(target) } catch (error) { if (error?.code !== 'ENOENT') throw error }
    }
  }

  async list({ prefix = '', limit = 1000 } = {}) {
    const objects = []
    const walk = (directory) => {
      if (!fs.existsSync(directory)) return
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (!entry.name.endsWith('.sabotmeta.json')) {
          const key = path.relative(this.rootDirectory, full).split(path.sep).join('/')
          if (key.startsWith(prefix)) {
            const stat = fs.statSync(full)
            const metadata = this.readMetadata(key)
            objects.push({ key, size: stat.size, uploaded: stat.mtime, httpMetadata: metadata.httpMetadata || {}, customMetadata: metadata.customMetadata || {} })
          }
        }
        if (objects.length >= limit) return
      }
    }
    walk(this.rootDirectory)
    return { objects, truncated: false, delimitedPrefixes: [] }
  }
}
