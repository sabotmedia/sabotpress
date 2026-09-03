import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const rail = fs.readFileSync(new URL('../src/components/AdminRail.jsx', import.meta.url), 'utf8')
const palette = fs.readFileSync(new URL('../src/components/AdminCommandPalette.jsx', import.meta.url), 'utf8')

for (const route of ['analytics', 'taxonomy', 'qa', 'siteHealth', 'backup', 'auditLog', 'users']) {
  test(`admin rail exposes ${route} when capability permits it`, () => {
    assert.match(rail, new RegExp(`adminRoutes\\.${route}`))
  })
}

test('admin rail hydrates publication setup and filters disabled modules', () => {
  assert.match(rail, /hydratePublishingSetup\(\)/)
  assert.match(rail, /isPublishingModuleEnabled/)
  assert.match(rail, /item\.module/)
  assert.doesNotMatch(rail, /loadSites\(/)
})

test('navigation uses real Users and Access instead of advisory Editor Roles', () => {
  assert.match(rail, /Users & Access/)
  assert.doesNotMatch(rail, /Editor Roles|adminRoutes\.roles/)
  assert.doesNotMatch(palette, /Editor Roles|adminRoutes\.roles/)
})

test('command palette exposes operational backend routes without obsolete architecture screens', () => {
  for (const route of ['analytics', 'taxonomy', 'users']) {
    assert.match(palette, new RegExp(`adminRoutes\\.${route}`))
  }
  assert.doesNotMatch(palette, /adminRoutes\.platformMap|Platform Map/)
  assert.doesNotMatch(palette, /adminRoutes\.(sites|tools|podcastSettings)/)
})

test('settings is the single site-configuration destination', () => {
  assert.equal((rail.match(/label: 'Settings'/g) || []).length, 1)
  assert.doesNotMatch(rail, /label: 'Customize'/)
  assert.doesNotMatch(palette, /label: 'Customize'|adminRoutes\.customize/)
  assert.doesNotMatch(rail, /label: 'Sites & Domains'|label: 'Tools'|label: 'Podcast Settings/)
})
