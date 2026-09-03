async function safeJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchEditorRoles() {
  const res = await fetch('/api/editor-roles', {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
    },
  })

  const data = await safeJson(res)
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `editor roles fetch failed: ${res.status}`)
  }
  return data
}

export async function saveEditorRole(record) {
  const res = await fetch('/api/editor-roles', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ record }),
  })

  const data = await safeJson(res)
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `editor role save failed: ${res.status}`)
  }
  return data
}

export async function removeEditorRole(id) {
  const url = new URL('/api/editor-roles', window.location.origin)
  url.searchParams.set('id', id)

  const res = await fetch(url.pathname + url.search, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
    },
  })

  const data = await safeJson(res)
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `editor role delete failed: ${res.status}`)
  }
  return data
}

export async function fetchAuditLog(params = {}) {
  const url = new URL('/api/audit-log', window.location.origin)

  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  const res = await fetch(url.pathname + url.search, {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
    },
  })

  const data = await safeJson(res)
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `audit log fetch failed: ${res.status}`)
  }
  return data
}
