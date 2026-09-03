async function safeJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchMediaAssets(params = {}) {
  const url = new URL('/api/media-assets', window.location.origin)

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
    throw new Error(data?.error || `media fetch failed: ${res.status}`)
  }

  return data
}

export async function saveMediaAsset(asset) {
  const res = await fetch('/api/media-assets', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ asset }),
  })

  const data = await safeJson(res)

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `media save failed: ${res.status}`)
  }

  return data
}

export async function removeMediaAsset(id) {
  const url = new URL('/api/media-assets', window.location.origin)
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
    throw new Error(data?.error || `media delete failed: ${res.status}`)
  }

  return data
}
