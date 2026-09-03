const DAY_MS = 86_400_000

export function analyticsCoverageNote(dataRange, now = new Date()) {
  const trackingSince = new Date(dataRange?.tracking_since || '')
  const current = new Date(now)
  if (!Number.isFinite(trackingSince.getTime()) || !Number.isFinite(current.getTime())) return ''

  const trackingDay = Date.UTC(trackingSince.getUTCFullYear(), trackingSince.getUTCMonth(), trackingSince.getUTCDate())
  const currentDay = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate())
  const recordedDays = Math.max(1, Math.floor((currentDay - trackingDay) / DAY_MS) + 1)
  const trackingLabel = trackingSince.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

  if (recordedDays <= 7) {
    return `Tracking began ${trackingLabel}. All recorded traffic is inside the last 7 days, so the 7-, 30-, and 90-day totals can match.`
  }
  return `Tracking began ${trackingLabel}.`
}
