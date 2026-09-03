function authoritativeMode(mode) {
  return mode === 'd1' || mode === 'browser-local'
}

export async function savePublicConfigPayload(payload) {
  const res = await fetch('/api/public-site-config', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await safeJson(res)
  if (!res.ok || !data?.ok || !authoritativeMode(data.mode) || data.saved !== true) {
    throw new Error(data?.error || `public config save was not confirmed by authoritative storage: ${res.status}`)
  }
  return data
}

export async function loadPublicConfigPayload() {
  const res = await fetch('/api/public-site-config', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
  const data = await safeJson(res)
  if (!res.ok || !data?.ok || !authoritativeMode(data.mode)) {
    throw new Error(data?.error || `public config load was not confirmed by authoritative storage: ${res.status}`)
  }
  return data
}

export async function getPublicConfigPermissions() {
  const res = await fetch('/api/public-site-config', {
    method: 'OPTIONS',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
  const data = await safeJson(res)
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `permissions failed: ${res.status}`)
  }
  return data
}

async function safeJson(res) {
  try { return await res.json() } catch { return null }
}
