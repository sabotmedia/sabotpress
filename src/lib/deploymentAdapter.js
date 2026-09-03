export function normalizeDeploymentStatus(raw = {}) {
  return {
    provider: String(raw.provider || 'unknown'),
    hostname: String(raw.hostname || ''),
    dns: {
      type: String(raw.dns?.type || ''),
      name: String(raw.dns?.name || ''),
      value: String(raw.dns?.value || ''),
    },
    connected: Boolean(raw.connected),
    https: Boolean(raw.https),
    capabilities: raw.capabilities || {},
  }
}

export async function fetchDeploymentStatus(hostname = '') {
  const query = hostname ? `?hostname=${encodeURIComponent(hostname)}` : ''
  const response = await fetch(`/api/deployment-status${query}`, { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`Deployment status failed (${response.status})`)
  return normalizeDeploymentStatus(await response.json())
}
