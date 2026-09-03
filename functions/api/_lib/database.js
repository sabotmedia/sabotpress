export function getBoundDb(context) {
  return context?.env?.BF_DB || null
}

export function databaseUnavailable(label = 'operation') {
  return new Response(JSON.stringify({
    ok: false,
    mode: 'unavailable',
    error: `BF_DB binding is required for ${label}`,
  }, null, 2), {
    status: 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
