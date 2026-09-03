import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const manifest = fs.readFileSync(new URL('../functions/api/feed-manifest.js', import.meta.url), 'utf8')
const rssFeeds = fs.readFileSync(new URL('../src/lib/rssFeeds.js', import.meta.url), 'utf8')
const feedsAdmin = fs.readFileSync(new URL('../src/components/FeedSettingsAdminPage.jsx', import.meta.url), 'utf8')
const publicFeeds = fs.readFileSync(new URL('../src/components/PublicFeedsPage.jsx', import.meta.url), 'utf8')

test('feed manifest discovers every podcast show and exposes per-show syndication metadata', () => {
  assert.match(manifest, /readPodcastShows\(db\)/)
  assert.match(manifest, /podcastRegistry\.shows\.map/)
  assert.match(manifest, /feedPath: `podcasts\/\$\{show\.slug\}\.xml`/)
  assert.match(manifest, /podcastShowCount/)
  assert.match(manifest, /podcastShows/)
  assert.match(manifest, /unassignedPodcastItemCount/)
  assert.match(manifest, /podcastDefaultAlias/)
})

test('generic website RSS does not compete with directory-grade podcast show feeds', () => {
  assert.doesNotMatch(rssFeeds, /bundle\['podcasts\/all\.xml'\]/)
  assert.match(rssFeeds, /prefix: 'formats'/)
  assert.match(rssFeeds, /Podcast show feeds are deliberately not generated here/)
})

test('feeds admin explains the boundary and links back to podcast show management', () => {
  assert.match(feedsAdmin, /What belongs here, and what belongs in Podcasts\?/)
  assert.match(feedsAdmin, /Podcast syndication/)
  assert.match(feedsAdmin, /directory-grade RSS feed with audio enclosures/)
  assert.match(feedsAdmin, /adminRoutes\.podcasts/)
  assert.match(feedsAdmin, /adminRoutes\.podcastSettings/)
  assert.match(feedsAdmin, /unassignedPodcastItemCount/)
})

test('public feeds directory presents named podcast shows rather than a fake combined podcast feed', () => {
  assert.match(publicFeeds, /Directory-grade podcast feeds, one per show/)
  assert.match(publicFeeds, /podcastShows\.map/)
  assert.match(publicFeeds, /show\.feedPath/)
  assert.match(publicFeeds, /legacy alias for the default show/)
  assert.match(publicFeeds, /formats\/podcast\.xml/)
})
