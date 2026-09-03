export async function fetchSiteHealth() {
  const response = await fetch('/api/site-health', {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `site health request failed: ${response.status}`)
  }
  return data
}
