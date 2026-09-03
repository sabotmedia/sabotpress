import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAnalyticsReport } from '../lib/analyticsApi'
import { analyticsCoverageNote } from '../lib/analyticsCoverage'

function TrafficGraph({ points = [] }) {
  const width = 760
  const height = 270
  const minX = 46
  const maxX = width - 20
  const minY = 20
  const maxY = height - 38
  const maxValue = Math.max(...points.flatMap((point) => [Number(point.views || 0), Number(point.sessions || 0)]), 1)
  const roundedMax = niceCeiling(maxValue)
  const xFor = (index) => minX + ((maxX - minX) * index) / Math.max(1, points.length - 1)
  const yFor = (value) => maxY - ((maxY - minY) * Number(value || 0)) / roundedMax
  const line = (key) => points.map((point, index) => `${index ? 'L' : 'M'} ${xFor(index).toFixed(2)} ${yFor(point[key]).toFixed(2)}`).join(' ')
  const viewsLine = line('views')
  const sessionsLine = line('sessions')
  const area = viewsLine ? `${viewsLine} L ${maxX} ${maxY} L ${minX} ${maxY} Z` : ''
  const gridValues = Array.from({ length: 5 }, (_, index) => Math.round((roundedMax * index) / 4))
  const labelCount = Math.min(5, points.length)
  const labelIndexes = new Set(Array.from({ length: labelCount }, (_, index) => Math.round((index * (points.length - 1)) / Math.max(1, labelCount - 1))))

  return (
    <div className="wp-analytics-chart-wrap">
      <div className="wp-analytics-chart-legend" aria-hidden="true">
        <span><i className="is-views" />Views</span>
        <span><i className="is-sessions" />Sessions</span>
      </div>
      <svg className="wp-analytics-graph" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily page views and privacy-preserving sessions">
        {gridValues.map((value) => {
          const y = yFor(value)
          return (
            <g key={value}>
              <line x1={minX} y1={y} x2={maxX} y2={y} className="wp-analytics-graph__grid" />
              <text x={minX - 10} y={y + 4} textAnchor="end" className="wp-analytics-graph__axis-label">{number(value)}</text>
            </g>
          )
        })}
        {area ? <path d={area} className="wp-analytics-graph__area" /> : null}
        {viewsLine ? <path d={viewsLine} className="wp-analytics-graph__line wp-analytics-graph__line--views" /> : null}
        {sessionsLine ? <path d={sessionsLine} className="wp-analytics-graph__line wp-analytics-graph__line--sessions" /> : null}
        {points.map((point, index) => (
          <g key={point.day}>
            <circle cx={xFor(index)} cy={yFor(point.views)} r="3" className="wp-analytics-graph__point wp-analytics-graph__point--views">
              <title>{formatDay(point.day)}: {number(point.views)} views</title>
            </circle>
            <circle cx={xFor(index)} cy={yFor(point.sessions)} r="3" className="wp-analytics-graph__point wp-analytics-graph__point--sessions">
              <title>{formatDay(point.day)}: {number(point.sessions)} sessions</title>
            </circle>
            {labelIndexes.has(index) ? <text x={xFor(index)} y={height - 10} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} className="wp-analytics-graph__date">{formatDay(point.day)}</text> : null}
          </g>
        ))}
      </svg>
    </div>
  )
}

export function WpAnalyticsWidgets({ compact = false }) {
  const [days, setDays] = useState(compact ? 7 : 30)
  const [analytics, setAnalytics] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current
    try {
      setState('loading')
      setError('')
      const report = await fetchAnalyticsReport(days)
      if (currentRequest !== requestId.current) return
      if (Number(report?.days) !== days) throw new Error(`analytics returned ${report?.days || 'an unknown'}-day data for the ${days}-day report`)
      setAnalytics(report)
      setState('loaded')
    } catch (nextError) {
      if (currentRequest !== requestId.current) return
      setAnalytics(null)
      setError(String(nextError?.message || nextError))
      setState('error')
    }
  }, [days])

  useEffect(() => {
    load()
    return () => { requestId.current += 1 }
  }, [load])

  const currentAnalytics = Number(analytics?.days) === days ? analytics : null
  const loading = state === 'loading' || !currentAnalytics
  const summary = currentAnalytics?.summary || {}
  const realtime = currentAnalytics?.realtime || {}
  const coverageNote = analyticsCoverageNote(currentAnalytics?.dataRange)
  const viewsPerSession = summary.sessions ? Number(summary.views || 0) / summary.sessions : 0
  const metrics = [
    { title: 'Views Today', value: summary.views_today },
    { title: 'Sessions Today', value: summary.sessions_today },
    { title: `Views · ${days}d`, value: summary.views, change: percentChange(summary.views, summary.previous_views) },
    { title: `Sessions · ${days}d`, value: summary.sessions, change: percentChange(summary.sessions, summary.previous_sessions) },
    { title: `Views / Session · ${days}d`, value: viewsPerSession, decimal: true },
    { title: 'Active · 30 min', value: realtime.sessions },
  ]

  return (
    <section className={`wp-dashboard-grid wp-dashboard-grid--analytics${compact ? ' is-compact' : ''}`} aria-busy={loading}>
      {!compact ? (
        <div className="wp-analytics-toolbar wp-meta-box wp-meta-box--full">
          <div>
            <strong>Traffic overview</strong>
            <span>{currentAnalytics?.generatedAt ? `Updated ${formatTime(currentAnalytics.generatedAt)}` : 'Loading current report…'}</span>
            <span>Today and daily totals use Pacific Time.</span>
            {coverageNote ? <span className="wp-analytics-coverage-note">{coverageNote}</span> : null}
          </div>
          <div className="wp-analytics-periods" aria-label="Analytics reporting period">
            {[7, 30, 90].map((period) => (
              <button key={period} type="button" aria-pressed={days === period} className={`button${days === period ? ' button--primary' : ''}`} onClick={() => setDays(period)}>
                {period} days
              </button>
            ))}
            <button type="button" className="button" onClick={load} disabled={state === 'loading'}>{state === 'loading' ? 'Refreshing…' : 'Refresh'}</button>
          </div>
        </div>
      ) : null}

      {state === 'error' ? (
        <article className="wp-meta-box wp-meta-box--full wp-meta-box--notice" role="alert">
          <h2>Analytics unavailable</h2>
          <p>{error}</p>
          <button type="button" className="button" onClick={load}>Try again</button>
        </article>
      ) : null}

      {metrics.slice(0, compact ? 4 : metrics.length).map((metric) => (
        <Metric key={metric.title} {...metric} loading={loading} />
      ))}

      <article className="wp-meta-box wp-analytics-card wp-analytics-card--traffic">
        <div className="wp-analytics-card__header">
          <div><h2>Traffic over time</h2><p>Every point is recorded first-party traffic, not an estimate.</p></div>
          <strong>{number(summary.views)} views</strong>
        </div>
        {currentAnalytics?.daily?.length ? <TrafficGraph points={fillDays(currentAnalytics.daily, days)} /> : <Empty loading={loading} />}
      </article>

      <article className="wp-meta-box wp-analytics-card wp-analytics-card--content">
        <div className="wp-analytics-card__header">
          <div><h2>Top Content</h2><p>Legacy, alternate, and print URLs are consolidated.</p></div>
        </div>
        {currentAnalytics?.topPages?.length ? (
          <ol className="wp-analytics-pages">
            {currentAnalytics.topPages.slice(0, compact ? 5 : 10).map((page, index) => (
              <li key={page.path}>
                <span className="wp-analytics-pages__rank">{index + 1}</span>
                <div className="wp-analytics-pages__identity">
                  <Link to={page.path}>{page.title || labelPath(page.path)}</Link>
                  <code>{page.path}</code>
                </div>
                <div className="wp-analytics-pages__numbers">
                  <strong>{number(page.views)}</strong>
                  <span>{number(page.sessions)} sessions · {share(page.views, summary.views)}%</span>
                </div>
              </li>
            ))}
          </ol>
        ) : <Empty loading={loading} />}
      </article>

      {!compact ? (
        <>
          <Breakdown title="External Referrers" subtitle="Sessions entering from an external site" rows={currentAnalytics?.referrers} labelKey="referrer" empty="No external referrers recorded yet." />
          <Breakdown title="Campaign Entries" subtitle="Sessions entering with a campaign tag" rows={currentAnalytics?.campaigns} empty="Campaign-tagged entries will appear here." />
          <Breakdown title="Traffic Sources" subtitle="How sessions first reached SabotPress" rows={currentAnalytics?.sources} />
          <Breakdown title="Devices" rows={currentAnalytics?.devices} />
          <Breakdown title="Browsers" rows={currentAnalytics?.browsers} />
          <Breakdown title="Countries" subtitle="Shown only after three views for privacy" rows={currentAnalytics?.countries} empty="No country has reached the privacy threshold yet." />
          <article className="wp-meta-box wp-meta-box--full wp-analytics-methodology">
            <div>
              <h2>What these numbers mean</h2>
              <p>Views count public-page loads. Sessions count browser tabs using a daily rotating hash; they are deliberately not claimed as unique people. Historic aliases are rolled into their canonical content path.</p>
            </div>
            <dl>
              <div><dt>Source</dt><dd>First-party D1 events</dd></div>
              <div><dt>Tracking since</dt><dd>{formatDateTime(currentAnalytics?.dataRange?.tracking_since) || 'No events yet'}</dd></div>
              <div><dt>Latest event</dt><dd>{formatDateTime(currentAnalytics?.dataRange?.last_event_at) || 'No events yet'}</dd></div>
              <div><dt>Retention</dt><dd>{currentAnalytics?.privacy?.retention || '400 days'}</dd></div>
              <div><dt>Excluded</dt><dd>Bots, admin/API routes, DNT and GPC</dd></div>
              <div><dt>Never stored</dt><dd>Cookies, raw IPs, fingerprints</dd></div>
            </dl>
          </article>
        </>
      ) : null}
    </section>
  )
}

function Metric({ title, value, loading, change = null, decimal = false }) {
  return (
    <article className="wp-meta-box wp-meta-box--stat wp-analytics-stat">
      <h2>{title}</h2>
      <div className="wp-analytics-stat__value">
        <p className="wp-metric">{loading ? '—' : decimal ? Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }) : number(value)}</p>
        {change != null ? <span className={change > 0 ? 'is-up' : change < 0 ? 'is-down' : 'is-flat'}>{change > 0 ? '↑' : change < 0 ? '↓' : '→'} {Math.abs(change)}%</span> : null}
      </div>
      {change != null ? <small>versus prior {title.match(/\d+d/)?.[0] || 'period'}</small> : null}
    </article>
  )
}

function Breakdown({ title, subtitle = '', rows = [], labelKey = 'label', empty = 'No data recorded yet.' }) {
  const safeRows = Array.isArray(rows) ? rows : []
  const total = safeRows.reduce((sum, row) => sum + Number(row.views || 0), 0)
  const max = Math.max(...safeRows.map((row) => Number(row.views || 0)), 1)
  return (
    <article className="wp-meta-box wp-analytics-breakdown-card">
      <div className="wp-analytics-card__header">
        <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
        {safeRows.length ? <strong>{number(total)}</strong> : null}
      </div>
      {safeRows.length ? (
        <ul className="wp-analytics-breakdown">
          {safeRows.map((row) => (
            <li key={row[labelKey]}>
              <div><span>{row[labelKey] || 'Unknown'}</span><strong>{number(row.views)}</strong></div>
              <span className="wp-analytics-breakdown__bar"><i style={{ width: `${Math.max(2, (Number(row.views || 0) / max) * 100)}%` }} /></span>
            </li>
          ))}
        </ul>
      ) : <p className="description">{empty}</p>}
    </article>
  )
}

function Empty({ loading }) {
  return <p className="wp-analytics-empty">{loading ? 'Loading real traffic data…' : 'No traffic recorded for this period yet.'}</p>
}

function number(value) {
  return Number(value || 0).toLocaleString()
}

function share(value, total) {
  if (!Number(total)) return '0'
  return ((Number(value || 0) / Number(total)) * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })
}

function percentChange(current, previous) {
  const before = Number(previous || 0)
  const now = Number(current || 0)
  if (!before) return null
  return Math.round(((now - before) / before) * 100)
}

function niceCeiling(value) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, value)))
  const normalized = value / magnitude
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return nice * magnitude
}

function formatDay(value) {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : value
}

function formatTime(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
}

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
}

function labelPath(path) {
  return path === '/' ? 'Homepage' : path.replace(/^\//, '').replace(/[-/]+/g, ' ')
}

function fillDays(rows, days) {
  const byDay = new Map(rows.map((row) => [row.day, row]))
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date()
    date.setUTCDate(date.getUTCDate() - (days - offset - 1))
    const day = date.toISOString().slice(0, 10)
    return byDay.get(day) || { day, views: 0, sessions: 0 }
  })
}
