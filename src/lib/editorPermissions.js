import { getPublicConfigPermissions } from './publicConfigApi'

async function safeJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function getNativeContentPermissions() {
  const res = await fetch('/api/native-content', {
    method: 'OPTIONS',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
    },
  })

  const data = await safeJson(res)

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `native content permissions failed: ${res.status}`)
  }

  return data
}

export async function getEditorPermissionsSnapshot() {
  const [publicConfig, nativeContent] = await Promise.all([
    getPublicConfigPermissions().catch((error) => ({
      ok: false,
      canEdit: false,
      error: String(error?.message || error),
      mode: 'unknown',
    })),
    getNativeContentPermissions().catch((error) => ({
      ok: false,
      canEdit: false,
      error: String(error?.message || error),
      mode: 'unknown',
    })),
  ])

  return {
    publicConfig,
    nativeContent,
    canEditAnything: Boolean(publicConfig?.canEdit || nativeContent?.canEdit),
  }
}
