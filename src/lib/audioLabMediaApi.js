async function safeJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function uploadAudioLabRenderedMedia({ blob, project, renderedEpisode, transcript, markers } = {}) {
  if (!blob) throw new Error('No rendered audio blob available to upload')
  const projectId = String(project?.id || renderedEpisode?.projectId || '').trim()
  if (!projectId) throw new Error('AudioLab project id is required before upload')

  const filename = String(renderedEpisode?.filename || `${projectId}.wav`)
  const mimeType = String(renderedEpisode?.mimeType || blob.type || 'audio/wav')
  const form = new FormData()
  form.append('file', blob, filename)
  form.append('projectId', projectId)
  form.append('title', String(project?.episode?.title || project?.title || filename))
  form.append('filename', filename)
  form.append('mimeType', mimeType)
  form.append('duration', String(renderedEpisode?.duration || 0))
  form.append('transcript', JSON.stringify(transcript || project?.transcript || null))
  form.append('markers', JSON.stringify(markers || project?.markers || []))

  const res = await fetch('/api/audiolab/media', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  })
  const data = await safeJson(res)
  if (!res.ok || !data?.ok || !data?.media?.publicUrl) {
    throw new Error(data?.error || `AudioLab media upload failed: ${res.status}`)
  }
  return data.media
}
