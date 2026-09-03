import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const lib = fs.readFileSync(new URL('../src/lib/feedSettings.js', import.meta.url), 'utf8')
const admin = fs.readFileSync(new URL('../src/components/FeedSettingsAdminPage.jsx', import.meta.url), 'utf8')
const publicPage = fs.readFileSync(new URL('../src/components/PublicFeedsPage.jsx', import.meta.url), 'utf8')
const api = fs.readFileSync(new URL('../functions/api/feed-settings.js', import.meta.url), 'utf8')

test('feed settings have no browser persistence', () => {
  assert.doesNotMatch(lib, /localStorage|STORAGE_KEY/)
  assert.match(lib, /loadFeedSettingsAsync/)
  assert.match(lib, /\/api\/feed-settings/)
})

test('feed settings API uses BF_DB and authenticated writes', () => {
  assert.match(api, /BF_DB is not bound/)
  assert.match(api, /resolvePublicSitePermission/)
  assert.match(api, /CREATE TABLE IF NOT EXISTS site_settings/)
  assert.match(api, /writeAuditLog/)
})

test('admin reports confirmed production database saves', () => {
  assert.match(admin, /await saveFeedSettings\(settings\)/)
  assert.match(admin, /saved to the production database/)
  assert.doesNotMatch(admin, /saved in this browser/)
})

test('public feeds load persisted settings', () => {
  assert.match(publicPage, /loadFeedSettingsAsync/)
  assert.match(publicPage, /persisted public feed configuration/)
})
