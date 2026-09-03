import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const taxonomy = fs.readFileSync(new URL('../src/components/TaxonomyAdminPage.jsx', import.meta.url), 'utf8')
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const users = fs.readFileSync(new URL('../src/components/AdminUsersPage.jsx', import.meta.url), 'utf8')

test('taxonomy uses the current admin shell instead of legacy project-page chrome', () => {
  assert.match(taxonomy, /<AdminFrame>/)
  assert.match(taxonomy, /wp-admin-screen/)
  assert.match(taxonomy, /wp-screen-header/)
  assert.match(taxonomy, /wp-meta-box/)
  assert.match(taxonomy, /wp-posts-table/)
  assert.doesNotMatch(taxonomy, /project-hero/)
  assert.doesNotMatch(taxonomy, /archive-controls/)
})

test('legacy editor roles route redirects to the real Users and Access surface', () => {
  assert.match(app, /path=\{adminRoutes\.roles\} element=\{protect\(<Navigate to=\{adminRoutes\.users\}/)
  assert.match(users, /<AdminFrame>/)
  assert.match(users, /wp-admin-screen/)
  assert.match(users, /Users & Access/)
  assert.match(users, /Create account/)
  assert.match(users, /Role boundaries/)
  assert.doesNotMatch(users, /project-hero|archive-controls/)
})
