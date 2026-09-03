export async function onRequestGet(context) {
  const url = new URL(context.request.url)
  url.pathname = '/rss/podcast.xml'
  url.search = ''
  return Response.redirect(url.toString(), 302)
}
