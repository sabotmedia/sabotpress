async function safeJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchTaxonomyTerms(params = {}) {
  const url = new URL('/api/taxonomy', window.location.origin)

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
    throw new Error(data?.error || `taxonomy fetch failed: ${res.status}`)
  }

  return data
}

export async function saveTaxonomyTerm(term) {
  const res = await fetch('/api/taxonomy', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ term }),
  })

  const data = await safeJson(res)
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `taxonomy save failed: ${res.status}`)
  }

  return data
}

export async function removeTaxonomyTerm(id) {
  const url = new URL('/api/taxonomy', window.location.origin)
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
    throw new Error(data?.error || `taxonomy delete failed: ${res.status}`)
  }

  return data
}

export async function fetchNativeTaxonomyLinks(nativeContentId) {
  const url = new URL('/api/native-content-taxonomy', window.location.origin)
  url.searchParams.set('nativeContentId', nativeContentId)

  const res = await fetch(url.pathname + url.search, {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
    },
  })

  const data = await safeJson(res)
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `taxonomy links fetch failed: ${res.status}`)
  }

  return data
}

export async function saveNativeTaxonomyLinks(nativeContentId, termIds) {
  const res = await fetch('/api/native-content-taxonomy', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ nativeContentId, termIds }),
  })

  const data = await safeJson(res)
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `taxonomy links save failed: ${res.status}`)
  }

  return data
}
