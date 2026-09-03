import { clearAdminSessionCookie } from './_lib/publicSiteAuth.js'

export async function onRequestPost(context) {
  return json({
    ok: true,
    authenticated: false,
  }, 200, {
    'set-cookie': clearAdminSessionCookie(context),
  })
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  })
}
