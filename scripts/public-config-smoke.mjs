#!/usr/bin/env node

const baseUrl = process.env.PUBLIC_CONFIG_URL || 'http://127.0.0.1:4173'
const token = process.env.SABOT_ADMIN_TOKEN || ''
const headers = {
  accept: 'application/json',
  ...(token ? { authorization: `Bearer ${token}`, 'x-sabot-admin-token': token } : {}),
}

async function main() {
  console.log(`== public config smoke test against ${baseUrl} ==`)

  const before = await req('GET', '/api/public-site-config')
  console.log('GET before:', JSON.stringify(before, null, 2))

  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    publicSite: {
      text: {
        'admin.hero.title': 'Admin',
        'footer.state.body': 'Imported archive online. Native publishing and deeper tooling next.',
      },
      styles: {},
      blocks: {},
    },
  }

  const saved = await req('PUT', '/api/public-site-config', payload)
  console.log('PUT result:', JSON.stringify(saved, null, 2))

  const after = await req('GET', '/api/public-site-config')
  console.log('GET after:', JSON.stringify(after, null, 2))
}

async function req(method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...headers,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }

  return {
    status: res.status,
    ok: res.ok,
    data,
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
