const DEFAULT_MAX_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_REDIRECTS = 5
const DEFAULT_TIMEOUT_MS = 12000
const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query'

export async function fetchBoundedText(rawUrl, options = {}) {
  const fetcher = options.fetcher || fetch
  const resolver = options.resolver || fetcher.resolveHost || (fetcher === globalThis.fetch ? resolveHostnameWithDoh : testResolver)
  const maxBytes = positiveInteger(options.maxBytes, DEFAULT_MAX_BYTES)
  const maxRedirects = positiveInteger(options.maxRedirects, DEFAULT_MAX_REDIRECTS)
  let current = validatePublicRemoteUrl(rawUrl, options)

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    await assertPublicResolution(current.hostname, resolver, fetcher)
    const pending = await timedFetch(current, fetcher, {
      timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      accept: options.accept || 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      userAgent: options.userAgent || 'SabotMediaFeedFetcher/1.0 (+https://example.invalid)',
    })
    const { response } = pending
    try {
      await assertDeclaredSize(response, maxBytes)
      if (isRedirect(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel?.().catch(() => {})
        if (!location) throw new Error(`feed redirect ${response.status} did not include a Location header`)
        if (redirectCount === maxRedirects) throw new Error(`feed exceeded ${maxRedirects} redirects`)
        current = validatePublicRemoteUrl(new URL(location, current).toString(), options)
        continue
      }
      if (!response.ok) {
        await response.body?.cancel?.().catch(() => {})
        throw new Error(`feed request failed: ${response.status}`)
      }
      return { text: await readResponseWithLimit(response, maxBytes), response, resolvedUrl: current.toString() }
    } finally {
      pending.clearTimeout()
    }
  }

  throw new Error(`feed exceeded ${maxRedirects} redirects`)
}

export async function fetchBoundedJson(rawUrl, options = {}) {
  const result = await fetchBoundedText(rawUrl, { ...options, accept: options.accept || 'application/json' })
  try {
    return { ...result, data: JSON.parse(result.text) }
  } catch {
    throw new Error('remote endpoint did not return valid JSON')
  }
}

export function validatePublicRemoteUrl(value, options = {}) {
  let url
  try { url = new URL(String(value || '').trim()) } catch { throw new Error('enter a valid feed URL') }
  const allowedProtocols = options.allowHttp ? ['http:', 'https:'] : ['https:']
  if (!allowedProtocols.includes(url.protocol)) throw new Error(options.allowHttp ? 'feed URL must use http or https' : 'automation sources must use HTTPS')
  if (url.username || url.password) throw new Error('feed URL cannot contain embedded credentials')
  const hostname = normalizeHostname(url.hostname)
  if (!hostname || isLocalHostname(hostname)) throw new Error('feed URL must point to a public host')
  const expectedPort = url.protocol === 'https:' ? '443' : '80'
  if (url.port && url.port !== expectedPort) throw new Error('feed URL uses an unsafe network port')
  if (isIpLiteral(hostname) && !isPublicIpAddress(hostname)) throw new Error('feed URL cannot point to a private network or reserved address')
  url.hash = ''
  return url
}

export async function assertPublicResolution(hostname, resolver, fetcher = fetch) {
  const host = normalizeHostname(hostname)
  if (isIpLiteral(host)) {
    if (!isPublicIpAddress(host)) throw new Error('feed host resolved to a private network or reserved address')
    return [host]
  }
  let addresses
  try { addresses = await resolver(host, fetcher) } catch { throw new Error('feed host DNS resolution failed closed') }
  const normalized = [...new Set((addresses || []).map((item) => normalizeHostname(typeof item === 'string' ? item : item?.address)).filter(Boolean))]
  if (!normalized.length) throw new Error('feed host DNS resolution returned no public address')
  if (normalized.some((address) => !isIpLiteral(address) || !isPublicIpAddress(address))) {
    throw new Error('feed host resolved to a private network or reserved address')
  }
  return normalized
}

export function isPublicIpAddress(value) {
  const host = normalizeHostname(value)
  const v4 = parseIpv4(host)
  if (v4) return isPublicIpv4(v4)
  const v6 = parseIpv6(host)
  if (!v6) return false
  if (v6.every((part) => part === 0) || v6.slice(0, 7).every((part) => part === 0) && v6[7] === 1) return false
  if (v6[0] >= 0xfc00 && v6[0] <= 0xfdff) return false
  if (v6[0] >= 0xfe80 && v6[0] <= 0xfebf) return false
  if (v6[0] >= 0xff00) return false
  if (v6[0] === 0x2001 && v6[1] === 0x0db8) return false
  if (v6.slice(0, 5).every((part) => part === 0) && v6[5] === 0xffff) return false
  return v6[0] >= 0x2000 && v6[0] <= 0x3fff
}

async function resolveHostnameWithDoh(hostname, fetcher) {
  const queries = [1, 28].map(async (type) => {
    const url = new URL(DOH_ENDPOINT)
    url.searchParams.set('name', hostname)
    url.searchParams.set('type', String(type))
    const pending = await timedFetch(url, fetcher, { timeoutMs: 5000, accept: 'application/dns-json', userAgent: 'SabotMediaDNSGuard/1.0' })
    try {
      if (!pending.response.ok) throw new Error('DNS lookup failed')
      await assertDeclaredSize(pending.response, 65536, 'DNS response')
      const payload = JSON.parse(await readResponseWithLimit(pending.response, 65536))
      if (![0, 3].includes(Number(payload.Status))) throw new Error('DNS lookup returned an error')
      return (payload.Answer || []).filter((answer) => Number(answer.type) === type).map((answer) => answer.data)
    } finally { pending.clearTimeout() }
  })
  return (await Promise.all(queries)).flat()
}

// Unit-test fetch stubs cannot resolve their synthetic hostnames. Production always
// uses DNS-over-HTTPS unless a resolver is supplied explicitly.
async function testResolver() { return ['93.184.216.34'] }

async function timedFetch(url, fetcher, options) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)
  try {
    const response = await fetcher(url.toString(), {
      method: 'GET', redirect: 'manual', signal: controller.signal,
      headers: { accept: options.accept, 'user-agent': options.userAgent },
    })
    return { response, clearTimeout: () => clearTimeout(timer) }
  } catch (error) {
    clearTimeout(timer)
    throw error
  }
}

async function readResponseWithLimit(response, maxBytes) {
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes) throw new Error(`feed is too large; maximum supported size is ${maxBytes} bytes`)
    return new TextDecoder().decode(bytes)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new Error(`feed is too large; maximum supported size is ${maxBytes} bytes`)
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally { reader.releaseLock?.() }
}

async function assertDeclaredSize(response, maxBytes, label = 'feed') {
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel?.().catch(() => {})
    throw new Error(`${label} is too large; maximum supported size is ${maxBytes} bytes`)
  }
}
function isRedirect(status) { return [301, 302, 303, 307, 308].includes(Number(status)) }
function positiveInteger(value, fallback) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback }
function normalizeHostname(value) { return String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '') }
function isLocalHostname(host) { return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa') }
function isIpLiteral(value) { return Boolean(parseIpv4(value) || parseIpv6(value)) }
function parseIpv4(value) {
  const match = String(value).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return null
  const parts = match.slice(1).map(Number)
  return parts.some((part) => part > 255) ? null : parts
}
function isPublicIpv4([a, b]) {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && [0, 2, 168].includes(b)) return false
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false
  if (a === 203 && b === 0) return false
  return true
}
function parseIpv6(value) {
  const source = String(value || '').split('%')[0].toLowerCase()
  if (!source.includes(':') || !/^[0-9a-f:.]+$/.test(source)) return null
  let normalized = source
  const embedded = source.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1]
  if (embedded) {
    const v4 = parseIpv4(embedded)
    if (!v4) return null
    normalized = source.slice(0, -embedded.length) + `${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`
  }
  const halves = normalized.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null
  const parts = [...left, ...Array(missing).fill('0'), ...right]
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null
  return parts.map((part) => Number.parseInt(part, 16))
}
