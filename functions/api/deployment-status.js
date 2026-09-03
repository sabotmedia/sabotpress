function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url)
  const hostname = String(url.searchParams.get('hostname') || '').trim().toLowerCase()
  const provider = String(context.env.SABOT_DEPLOYMENT_PROVIDER || 'cloudflare-pages').trim()
  const target = String(context.env.SABOT_DEPLOYMENT_DNS_TARGET || '').trim()
  const cloudflare = provider === 'cloudflare-pages'

  return json({
    ok: true,
    provider,
    hostname,
    dns: hostname && target ? { type: 'CNAME', name: hostname, value: target } : { type: '', name: hostname, value: target },
    connected: false,
    https: url.protocol === 'https:',
    capabilities: {
      customDomains: true,
      managedHttps: cloudflare,
      sql: cloudflare ? 'd1' : 'external',
      media: cloudflare ? 'r2-compatible' : 'external',
      scheduledJobs: true,
      backups: true,
    },
  })
}
