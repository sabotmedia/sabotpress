export function onRequestGet({ request, params }) {
  const destination = new URL(`/campaigns/${encodeURIComponent(params.slug)}?tool=benefit-kit`, request.url)
  return Response.redirect(destination, 302)
}
