export async function fetchAdminUsers() {
  return request('/api/users', { method: 'GET' })
}

export async function createAdminUserAccount(input) {
  return request('/api/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input || {}),
  })
}

export async function updateAdminUserAccount(input) {
  return request('/api/users', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input || {}),
  })
}

export async function deleteAdminUserAccount(id) {
  return request(`/api/users?id=${encodeURIComponent(String(id || ''))}`, { method: 'DELETE' })
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { accept: 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) throw new Error(data?.error || `request failed: ${response.status}`)
  return data
}
