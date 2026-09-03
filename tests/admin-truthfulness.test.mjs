import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const scaffold = fs.readFileSync(new URL('../src/components/WpAdminScaffoldPages.jsx', import.meta.url), 'utf8')
const users = fs.readFileSync(new URL('../src/components/AdminUsersPage.jsx', import.meta.url), 'utf8')
const usersApi = fs.readFileSync(new URL('../src/lib/adminUsersApi.js', import.meta.url), 'utf8')
const pages = fs.readFileSync(new URL('../src/components/WpAdminPages.jsx', import.meta.url), 'utf8')

test('users admin uses D1-backed account APIs and no browser account persistence', () => {
  assert.match(scaffold, /AdminUsersPage as UsersAdminPage/)
  assert.match(usersApi, /\/api\/users/)
  assert.match(users, /Create account/)
  assert.match(users, /Users & Access/)
  assert.doesNotMatch(users, /localStorage|USER_ROLE_SETTINGS_KEY|local-admin/)
})

test('settings is the single production public config surface', () => {
  assert.match(scaffold, /<AdminPublicConfigCard\s*\/>/)
  assert.match(scaffold, /<LegacyInfoPageRecovery\s*\/>/)
  assert.doesNotMatch(pages, /AdminPublicConfigCard|CustomizeAdminPage/)
  assert.doesNotMatch(pages, /customizerLocal|saveCustomizerSettings|saveWpSettings/)
})

test('obsolete tools implementation is removed in favor of canonical operational screens', () => {
  assert.doesNotMatch(pages, /exportLocalSiteBackupJson|collectPrintlabRecords/)
  assert.doesNotMatch(pages, /ToolsAdminPage|<h1>Tools<\/h1>/)
})
