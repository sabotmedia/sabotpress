import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveNamedQueries } from '../functions/api/analytics/reportQueries.js'
import { resolvePageTitle } from '../functions/api/analytics/report.js'
import { analyticsCoverageNote } from '../src/lib/analyticsCoverage.js'
import { daysAgo, reportingDay } from '../functions/api/analytics/_lib.js'

const reportSource = readFileSync(new URL('../functions/api/analytics/report.js', import.meta.url), 'utf8')
const widgetSource = readFileSync(new URL('../src/components/WpAnalyticsWidgets.jsx', import.meta.url), 'utf8')

test('analytics report preserves named result sections regardless of promise timing', async () => {
  const result = await resolveNamedQueries({
    summary: Promise.resolve({ views: 12 }),
    daily: new Promise((resolve) => setTimeout(() => resolve([{ day: '2026-08-27' }]), 5)),
    topPages: Promise.resolve([{ path: '/post/example' }]),
    referrers: Promise.resolve([{ referrer: 'example.org' }]),
    campaigns: Promise.resolve([{ label: 'summer-tour' }]),
    sources: Promise.resolve([{ label: 'External referral' }]),
  })

  assert.deepEqual(result.summary, { views: 12 })
  assert.equal(result.daily[0].day, '2026-08-27')
  assert.equal(result.topPages[0].path, '/post/example')
  assert.equal(result.referrers[0].referrer, 'example.org')
  assert.equal(result.campaigns[0].label, 'summer-tour')
  assert.equal(result.sources[0].label, 'External referral')
})

test('analytics report resolves current native titles by canonical path', () => {
  const titles = new Map([['example-story', 'Current Editorial Title']])
  assert.equal(resolvePageTitle({ path: '/post/example-story', title: 'Stale Page Title | Sabot Media' }, titles), 'Current Editorial Title')
  assert.equal(resolvePageTitle({ path: '/', title: 'Stale Page Title | Sabot Media' }, titles), 'Homepage')
  assert.equal(resolvePageTitle({ path: '/unknown-route', title: '' }, titles), 'Unknown Route')
})

test('analytics acquisition reports use only the first event in each privacy session', () => {
  assert.match(reportSource, /ROW_NUMBER\(\) OVER \(PARTITION BY session_hash ORDER BY occurred_at, id\) AS entry_rank/)
  assert.equal((reportSource.match(/WHERE entry_rank = 1/g) || []).length, 3)
})

test('analytics range changes never pair a selected label with another report', () => {
  assert.match(widgetSource, /Number\(analytics\?\.days\) === days \? analytics : null/)
  assert.match(widgetSource, /currentRequest !== requestId\.current/)
  assert.match(widgetSource, /Number\(report\?\.days\) !== days/)
})

test('analytics explains when limited history makes all range totals match', () => {
  const note = analyticsCoverageNote(
    { tracking_since: '2026-08-29T12:00:00.000Z' },
    new Date('2026-08-31T21:00:00.000Z'),
  )
  assert.match(note, /Tracking began Aug 29, 2026/)
  assert.match(note, /7-, 30-, and 90-day totals can match/)
  assert.equal(analyticsCoverageNote({}, new Date('2026-08-31T21:00:00.000Z')), '')
})

test('analytics reporting days use Pacific time rather than UTC midnight', () => {
  const utcAfterMidnight = new Date('2026-09-01T00:30:00.000Z')
  assert.equal(reportingDay(utcAfterMidnight), '2026-08-31')
  assert.equal(daysAgo(7, utcAfterMidnight), '2026-08-25')
  assert.equal(reportingDay(new Date('2026-09-01T07:30:00.000Z')), '2026-09-01')
  assert.equal(reportingDay(new Date('2026-12-01T07:30:00.000Z')), '2026-11-30')
  assert.match(reportSource, /ensureAnalyticsReportingDays\(db\)/)
  assert.match(widgetSource, /daily totals use Pacific Time/)
})
