async function request(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) } })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) throw new Error(data?.error || `request failed: ${response.status}`)
  return data
}
function contributorSessionHeader(session) { return session ? { 'x-sabot-contributor-session': session } : {} }
export function loadCorrespondence(campaign, session = '', admin = false) { return request(`/api/campaign-correspondence?campaign=${encodeURIComponent(campaign)}${admin ? '&view=admin' : ''}`, { headers: contributorSessionHeader(session) }) }
export function authenticateContributor(token, pin) { return request('/api/campaign-contributor-auth', { method: 'POST', body: JSON.stringify({ token, pin }) }) }
export function sendMessage(campaign, message, session = '', publish = false) { return request('/api/campaign-correspondence', { method: 'POST', headers: contributorSessionHeader(session), body: JSON.stringify({ action: publish ? 'publish-message' : 'message', campaign, ...message }) }) }
export function submitQuestion(campaign, values) { return request('/api/campaign-correspondence', { method: 'POST', body: JSON.stringify({ action: 'question', campaign, ...values }) }) }
export function createContributor(campaign, values) { return request('/api/campaign-correspondence', { method: 'POST', body: JSON.stringify({ action: 'contributor', campaign, ...values }) }) }
export function patchCorrespondence(values, session = '') { return request('/api/campaign-correspondence', { method: 'PATCH', headers: contributorSessionHeader(session), body: JSON.stringify(values) }) }
export function deleteCorrespondenceMessage(id, session = '') { return request('/api/campaign-correspondence', { method: 'DELETE', headers: contributorSessionHeader(session), body: JSON.stringify({ action: 'message', id }) }) }
export async function uploadCampaignArchiveMedia(file) {
  const body = new FormData(); body.append('file', file); body.append('folder', 'campaign-archives'); body.append('title', file.name || 'Instagram archive')
  const response = await fetch('/api/media/files', { method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json' }, body })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) throw new Error(data?.error || `upload failed: ${response.status}`)
  return { mediaUrl: data.media?.publicUrl || data.media?.url, mediaType: String(file.type || '').split('/')[0] }
}
export async function uploadContributorMedia(file, session, onProgress) {
  const body = new FormData(); body.append('file', file)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/campaign-contributor-media'); xhr.setRequestHeader('x-sabot-contributor-session', session); xhr.setRequestHeader('accept', 'application/json')
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100)) }
    xhr.onerror = () => reject(new Error('Upload interrupted. Tap retry when your connection returns.'))
    xhr.onload = () => { let data; try { data = JSON.parse(xhr.responseText) } catch {} if (xhr.status >= 200 && xhr.status < 300 && data?.ok) resolve(data); else reject(new Error(data?.error || `upload failed: ${xhr.status}`)) }
    xhr.send(body)
  })
}
