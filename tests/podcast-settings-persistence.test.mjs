import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const client = fs.readFileSync(new URL('../src/lib/podcastSettings.js', import.meta.url), 'utf8')
const page = fs.readFileSync(new URL('../src/components/PodcastSettingsPage.jsx', import.meta.url), 'utf8')
const api = fs.readFileSync(new URL('../functions/api/podcast-settings.js', import.meta.url), 'utf8')
const helper = fs.readFileSync(new URL('../functions/api/_lib/podcastSettings.js', import.meta.url), 'utf8')
const podcastFeed = fs.readFileSync(new URL('../functions/rss/podcast.xml.js', import.meta.url), 'utf8')

test('podcast settings have no browser-only persistence', () => {
  assert.doesNotMatch(client, /localStorage|PODCAST_SETTINGS_KEY/)
  assert.match(client, /\/api\/podcast-settings/)
  assert.match(client, /loadPodcastShowsAsync/)
  assert.match(client, /loadPodcastSettingsAsync/)
  assert.match(client, /await fetch/)
})

test('podcast settings API persists a multi-show registry through D1 with publishing permission', () => {
  assert.match(api, /permissionHasCapability\(permission, 'publishing:write'\)/)
  assert.match(api, /upsertPodcastShow/)
  assert.match(api, /readPodcastShows/)
  assert.match(helper, /INSERT INTO site_settings/)
  assert.match(helper, /podcast-shows-v1/)
  assert.match(helper, /podcast-settings-v1/)
  assert.match(helper, /defaultShowId/)
  assert.doesNotMatch(helper, /db\.exec/)
})

test('Podcast Settings UI edits one show and confirms database save', () => {
  assert.match(page, /useSearchParams/)
  assert.match(page, /searchParams\.get\('show'\)/)
  assert.match(page, /searchParams\.get\('new'\) === '1'/)
  assert.match(page, /await savePodcastSettings/)
  assert.match(page, /saved to the production database/)
  assert.match(page, /Each podcast gets a separate URL/)
  assert.doesNotMatch(page, /saved locally|localStorage/)
})

test('podcast RSS consumes a selected show and its directory metadata', () => {
  assert.match(podcastFeed, /readPodcastShows\(db\)/)
  assert.match(podcastFeed, /getPodcastFeedItems\(db, show\)/)
  assert.match(podcastFeed, /podcastShowOwnsEntry/)
  assert.match(podcastFeed, /<itunes:author>/)
  assert.match(podcastFeed, /<itunes:category/)
  assert.match(podcastFeed, /<itunes:image/)
  assert.match(podcastFeed, /<itunes:owner>/)
  assert.match(podcastFeed, /<enclosure url=/)
})
