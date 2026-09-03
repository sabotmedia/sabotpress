import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const routes = fs.readFileSync(new URL('../src/routing/routes.js', import.meta.url), 'utf8')
const rail = fs.readFileSync(new URL('../src/components/AdminRail.jsx', import.meta.url), 'utf8')
const palette = fs.readFileSync(new URL('../src/components/AdminCommandPalette.jsx', import.meta.url), 'utf8')
const podcastAdmin = fs.readFileSync(new URL('../src/components/PodcastAdminPage.jsx', import.meta.url), 'utf8')
const podcastSettingsPage = fs.readFileSync(new URL('../src/components/PodcastSettingsPage.jsx', import.meta.url), 'utf8')
const podcastSettingsBackend = fs.readFileSync(new URL('../functions/api/_lib/podcastSettings.js', import.meta.url), 'utf8')
const podcastImport = fs.readFileSync(new URL('../functions/api/podcast-import.js', import.meta.url), 'utf8')
const podcastFeeds = fs.readFileSync(new URL('../functions/feeds/[[path]].js', import.meta.url), 'utf8')
const middleware = fs.readFileSync(new URL('../functions/_middleware.js', import.meta.url), 'utf8')

test('podcast settings has a canonical named admin route and protected page', () => {
  assert.match(routes, /podcastSettings: '\/wp-admin\/podcasts\/settings'/)
  assert.match(app, /path=\{`\$\{adminRoutes\.podcasts\}\/settings`\} element=\{protect\(<PodcastSettingsPage/)
})

test('podcast area has one normal admin destination with settings nested inside it', () => {
  assert.match(rail, /adminRoutes\.podcasts, label: 'Podcasts'/)
  assert.doesNotMatch(rail, /adminRoutes\.podcastSettings/)
  assert.doesNotMatch(palette, /Podcast Settings \/ Import RSS|adminRoutes\.podcastSettings/)
})

test('podcast admin is show-first and exposes Add Podcast', () => {
  assert.match(podcastAdmin, /loadPodcastShowsAsync/)
  assert.match(podcastAdmin, />Add Podcast</)
  assert.match(podcastAdmin, /Podcast Shows/)
  assert.match(podcastAdmin, /showSourceUrls/)
  assert.match(podcastAdmin, /sourceFeedUrl/)
  assert.match(podcastAdmin, /rssFeedUrl/)
  assert.match(podcastAdmin, /href="\/feeds\/podcasts\/all\.xml"/)
  assert.doesNotMatch(podcastAdmin, /getPieces|importedPodcastPieces|source: 'archive'/)
})

test('podcast settings edits or creates one show instead of one global singleton', () => {
  assert.match(podcastSettingsPage, /useSearchParams/)
  assert.match(podcastSettingsPage, /searchParams\.get\('show'\)/)
  assert.match(podcastSettingsPage, /searchParams\.get\('new'\) === '1'/)
  assert.match(podcastSettingsPage, /showId: activeShowId/)
  assert.match(podcastSettingsPage, /Create this podcast from an RSS feed/)
  assert.match(podcastSettingsPage, /Adding a different podcast should start from Add Podcast/)
})

test('podcast backend persists a show registry and scopes imports by source feed', () => {
  assert.match(podcastSettingsBackend, /PODCAST_SHOWS_SETTING_KEY = 'podcast-shows-v1'/)
  assert.match(podcastSettingsBackend, /readPodcastShows/)
  assert.match(podcastSettingsBackend, /upsertPodcastShow/)
  assert.match(podcastSettingsBackend, /sourceFeedUrls/)
  assert.match(podcastImport, /requestedShowId/)
  assert.match(podcastImport, /entryBelongsToShowImport/)
  assert.match(podcastImport, /entityType: 'podcast_show'/)
})

test('podcast feeds support a separate canonical XML feed per show', () => {
  assert.match(podcastFeeds, /\^podcasts\\\/\(\[a-z0-9-\]\+\)\\\.xml\$/)
  assert.match(podcastFeeds, /findPodcastShow\(db, slug\)/)
  assert.match(podcastFeeds, /getPodcastFeedItems\(db, show\)/)
  assert.match(podcastFeeds, /`\/feeds\/podcasts\/\$\{show\.slug\}\.xml`/)
})

test('edge middleware serves the SPA shell for nested authenticated wp-admin routes', () => {
  assert.match(middleware, /'\/wp-admin'/)
  assert.match(middleware, /pathname\.startsWith\(`\$\{path\}\/`\)/)
  assert.match(middleware, /context\.env\.ASSETS\.fetch/)
})
