import { databaseUnavailable, getBoundDb } from '../_lib/database.js'
import { getGallery } from '../_lib/galleries.js'

export async function onRequestGet(context) {
  try {
    const db = getBoundDb(context)
    if (!db) return databaseUnavailable('public gallery read')

    const slug = String(context.params?.slug || '').trim()
    if (!slug) return json({ ok: false, error: 'missing gallery slug' }, 400)

    const gallery = await getGallery(db, slug)
    if (!gallery) return json({ ok: false, error: 'gallery not found' }, 404)

    return json({ ok: true, mode: 'd1', gallery })
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': status === 200 ? 'public, max-age=60, s-maxage=300' : 'no-store',
    },
  })
}
