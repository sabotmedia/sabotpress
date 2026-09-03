import { getBoundDb, databaseUnavailable } from './_lib/database.js'
import { resolvePublicSitePermission } from './_lib/publicSiteAuth.js'
import { syncWeblateComponent } from './_lib/weblateSync.js'

export async function onRequestPost(context) {
  try {
    const permission = await resolvePublicSitePermission(context)
    if (!permission.canEdit) return json({ ok: false, error: permission.reason || 'authentication required' }, 403)
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('Weblate sync')
    const result = await syncWeblateComponent({
      db,
      env: context.env,
      project: 'sabotpress',
      component: 'ai-server-called-paranoia',
    })
    return json(result)
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 400)
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
