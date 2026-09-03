async function safeJson(response) {
  try { return await response.json() } catch { return null }
}

export async function loadCampaign(slug = 'example-campaign', { includeDrafts = false } = {}) {
  const params = new URLSearchParams({ slug })
  if (includeDrafts) params.set('includeDrafts', '1')
  const response = await fetch(`/api/campaigns?${params.toString()}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
  const data = await safeJson(response)
  if (!response.ok || !data?.ok || !data?.item) throw new Error(data?.error || `campaign load failed: ${response.status}`)
  return data.item
}

export async function loadCampaigns({ includeDrafts = false } = {}) {
  const params = new URLSearchParams()
  if (includeDrafts) params.set('includeDrafts', '1')
  const query = params.toString()
  const response = await fetch(`/api/campaigns${query ? `?${query}` : ''}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
  const data = await safeJson(response)
  if (!response.ok || !data?.ok || !Array.isArray(data?.items)) throw new Error(data?.error || `campaign list failed: ${response.status}`)
  return data.items
}

export async function saveCampaign(item, revisionNote = 'save') {
  const response = await fetch('/api/campaigns', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ item, revisionNote }),
  })
  const data = await safeJson(response)
  if (!response.ok || !data?.ok || !data?.item) throw new Error(data?.error || `campaign save failed: ${response.status}`)
  return data.item
}

export async function loadCampaignRevisions(campaignId, limit = 30) {
  const params = new URLSearchParams({ campaignId, limit: String(limit) })
  const response = await fetch(`/api/campaign-revisions?${params.toString()}`, {
    method: 'GET', credentials: 'same-origin', headers: { accept: 'application/json' },
  })
  const data = await safeJson(response)
  if (!response.ok || !data?.ok || !Array.isArray(data?.items)) throw new Error(data?.error || `campaign revisions failed: ${response.status}`)
  return data.items
}

export async function restoreCampaignRevision(revisionId) {
  const response = await fetch('/api/campaign-revisions', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ revisionId }),
  })
  const data = await safeJson(response)
  if (!response.ok || !data?.ok || !data?.item) throw new Error(data?.error || `campaign revision restore failed: ${response.status}`)
  return data.item
}

export async function deleteCampaign(id) {
  const response = await fetch('/api/campaigns', {
    method: 'DELETE', credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ id }),
  })
  const data = await safeJson(response)
  if (!response.ok || !data?.ok) throw new Error(data?.error || `campaign delete failed: ${response.status}`)
  return data.removed
}

export async function loadCampaignMonitor(slug = 'example-campaign') {
  const params = new URLSearchParams({ campaign: slug })
  const response = await fetch(`/api/campaign-monitor?${params.toString()}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
  const data = await safeJson(response)
  if (!data) throw new Error(`campaign monitor failed: ${response.status}`)
  if (!response.ok || !data.ok) return data
  return data
}

export async function loadCampaignCoverage(options = {}) {
  const params = new URLSearchParams({ campaign: options.campaign || 'example-campaign' })
  if (options.q) params.set('q', options.q)
  if (options.language) params.set('language', options.language)
  if (options.outlet) params.set('outlet', options.outlet)
  if (options.page) params.set('page', String(options.page))
  if (options.limit) params.set('limit', String(options.limit))
  if (options.admin) params.set('admin', '1')
  if (options.editorialStatus) params.set('editorialStatus', options.editorialStatus)
  const response = await fetch(`/api/campaign-coverage?${params.toString()}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
  const data = await safeJson(response)
  if (!response.ok || !data?.ok || !Array.isArray(data.items)) throw new Error(data?.error || `campaign coverage archive failed: ${response.status}`)
  return data
}

export async function updateCampaignCoverageEditorial({ id, campaign, editorialStatus, editorialNote }) {
  const response = await fetch('/api/campaign-coverage', {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ id, campaign, editorialStatus, editorialNote }),
  })
  const data = await safeJson(response)
  if (!response.ok || !data?.ok || !data?.item) throw new Error(data?.error || `coverage moderation failed: ${response.status}`)
  return data.item
}
