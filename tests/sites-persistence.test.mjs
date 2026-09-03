import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const client = fs.readFileSync(new URL('../src/lib/siteDomains.js', import.meta.url), 'utf8')
const component = fs.readFileSync(new URL('../src/components/SitesAdminPage.jsx', import.meta.url), 'utf8')
const api = fs.readFileSync(new URL('../functions/api/sites.js', import.meta.url), 'utf8')
const adapter = fs.readFileSync(new URL('../functions/api/deployment-status.js', import.meta.url), 'utf8')

test('sites client has no localStorage persistence fallback', () => {
  assert.doesNotMatch(client, /localStorage|SITES_STORAGE_KEY/)
  assert.match(client, /\/api\/sites/)
  assert.match(client, /data\.mode !== 'd1'/)
})

test('sites API fails closed without BF_DB and creates its schema idempotently', () => {
  assert.match(api, /BF_DB is not bound/)
  assert.match(api, /CREATE TABLE IF NOT EXISTS site_domains/)
  assert.match(api, /resolvePublicSitePermission/)
})

test('domain UI and API are provider neutral', () => {
  assert.match(component, /Show DNS instructions/)
  assert.match(component, /fetchDeploymentStatus/)
  assert.match(adapter, /SABOT_DEPLOYMENT_PROVIDER/)
  assert.match(adapter, /SABOT_DEPLOYMENT_DNS_TARGET/)
  assert.match(api, /isValidHostname/)
  assert.doesNotMatch(component, /sabot\.media|Workers &amp; Pages/)
  assert.doesNotMatch(api, /canonical sabot\.media|CANONICAL_DOMAIN/)
})
