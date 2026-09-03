import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { collectSystemSnapshot, summarizeSnapshot } from '../src/lib/systemBackup.js'

const list = async () => ({ ok: true, mode: 'd1', items: [] })

test('verified backup accepts D1 feed defaults when no custom row exists', async () => {
  const snapshot = await collectSystemSnapshot({
    fetchNativeEntries: list,
    fetchNativeRevisions: list,
    fetchTaxonomyTerms: list,
    fetchAdminUsers: list,
    fetchEditorRoles: list,
    fetchAuditLog: list,
    fetchMediaAssets: list,
    fetchCollections: list,
    fetchCampaigns: list,
    fetchCampaignRevisions: list,
    fetchCampaignCoverage: list,
    fetchPublications: list,
    fetchSites: list,
    fetchFeedSettings: async () => ({ ok: true, mode: 'd1', settings: null }),
    fetchPodcastSettings: async () => ({ ok: true, mode: 'd1', settings: null }),
    loadPublicConfigPayload: async () => ({ ok: true, mode: 'd1', config: {} }),
  })
  assert.deepEqual(snapshot.feedSettings, {})
  assert.deepEqual(snapshot.podcastSettings, {})
  assert.deepEqual(snapshot.campaigns, [])
  assert.equal(summarizeSnapshot(snapshot).complete, true)
  assert.equal(summarizeSnapshot(snapshot).feedSettingsIncluded, true)
  assert.equal(summarizeSnapshot(snapshot).podcastSettingsIncluded, true)
})

test('obsolete Platform Map is removed from normal navigation', () => {
  const rail = fs.readFileSync(new URL('../src/components/AdminRail.jsx', import.meta.url), 'utf8')
  const palette = fs.readFileSync(new URL('../src/components/AdminCommandPalette.jsx', import.meta.url), 'utf8')
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(rail, /Platform Map/)
  assert.doesNotMatch(palette, /Platform Map/)
  assert.match(app, /path=\{adminRoutes\.platformMap\} element=\{protect\(<Navigate to=\{adminRoutes\.siteHealth\}/)
})

test('domain setup is provider neutral and gives the current host DNS instructions', () => {
  const sites = fs.readFileSync(new URL('../src/components/SitesAdminPage.jsx', import.meta.url), 'utf8')
  assert.match(sites, /Domain setup/)
  assert.match(sites, /Show DNS instructions/)
  assert.match(sites, /deployment\.provider/)
  assert.match(sites, /deployment\.dns/)
  assert.match(sites, /news\.example\.org/)
  assert.doesNotMatch(sites, /sabot\.media|Register sabot|canonical production site/)
})

test('Media Library uses the current component CSS contract without obsolete grid-fix layers', () => {
  const css = fs.readFileSync(new URL('../src/admin-media-library.css', import.meta.url), 'utf8')
  const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.match(css, /\.media-library-layout/)
  assert.match(css, /\.media-library-grid/)
  assert.match(css, /\.media-library-tile/)
  assert.match(css, /\.media-attachment-details/)
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(300px, 360px\)/)
  assert.doesNotMatch(main, /admin-media-library-grid-fix\.css/)
  assert.doesNotMatch(main, /admin-media-file-types\.css/)
})
