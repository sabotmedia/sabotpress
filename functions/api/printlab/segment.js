export async function onRequest(context) {
  const method = String(context.request.method || '').toUpperCase()

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    })
  }

  if (method !== 'POST') {
    return json({
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED',
    }, 405, { allow: 'POST, OPTIONS' })
  }

  const endpoint = getSegmentationEndpoint(context)
  if (!endpoint) {
    return json({
      error: 'Segmentation model not configured',
      code: 'SEGMENTATION_NOT_CONFIGURED',
      note: 'Set PRINTLAB_SEGMENTATION_ENDPOINT to a deployed SAM/MobileSAM/SAM2 or ONNX-backed service. Local development may still use VITE_PRINTLAB_SEGMENTATION_ENDPOINT=http://localhost:8000/segment.',
    }, 501)
  }

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': context.request.headers.get('content-type') || 'application/json',
        accept: context.request.headers.get('accept') || 'application/json',
      },
      body: await context.request.arrayBuffer(),
    })

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders(upstream.headers),
    })
  } catch (error) {
    return json({
      error: `Segmentation service request failed: ${String(error?.message || error)}`,
      code: 'SEGMENTATION_UPSTREAM_FAILED',
    }, 502)
  }
}

function getSegmentationEndpoint(context) {
  return String(
    context?.env?.PRINTLAB_SEGMENTATION_ENDPOINT ||
    context?.env?.VITE_PRINTLAB_SEGMENTATION_ENDPOINT ||
    '',
  ).trim()
}

function responseHeaders(upstreamHeaders = new Headers()) {
  const headers = corsHeaders()
  const contentType = upstreamHeaders.get('content-type') || 'application/json; charset=utf-8'
  headers.set('content-type', contentType)
  headers.set('cache-control', 'no-store')
  return headers
}

function corsHeaders(extra = {}) {
  return new Headers({
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, accept',
    ...extra,
  })
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: corsHeaders({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    }),
  })
}
