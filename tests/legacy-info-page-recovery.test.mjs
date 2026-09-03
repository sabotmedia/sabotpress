import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const recovery = fs.readFileSync(new URL('../src/components/LegacyInfoPageRecovery.jsx', import.meta.url), 'utf8')
const settings = fs.readFileSync(new URL('../src/components/WpAdminScaffoldPages.jsx', import.meta.url), 'utf8')
const publicConfig = fs.readFileSync(new URL('../src/lib/publicConfig.js', import.meta.url), 'utf8')

test('legacy recovery is exposed in Settings instead of affecting public rendering', () => {
  assert.match(settings, /LegacyInfoPageRecovery/)
  assert.match(settings, /<LegacyInfoPageRecovery \/>/)
  assert.match(publicConfig, /resolvePublicConfig\(runtimeConfig = \{\}\)/)
  assert.doesNotMatch(publicConfig, /runtimeConfig \|\| getStoredPublicConfig\(\)/)
})

test('recovery targets the shared info page family and leaves security opt-in', () => {
  for (const prefix of ['info.about.', 'info.contact.', 'info.submit.', 'info.support.', 'info.security.']) {
    assert.match(recovery, new RegExp(prefix.replaceAll('.', '\\.')))
  }
  assert.match(recovery, /group\.id !== 'security'/)
})

test('recovery writes selected legacy fields to D1 while preserving the rest of saved config', () => {
  assert.match(recovery, /let next = savedConfig/)
  assert.match(recovery, /copyPrefix\(next, legacy, group\.prefix\)/)
  assert.match(recovery, /savePublicConfigPayload\(\{ publicSite: next \}\)/)
  assert.doesNotMatch(recovery, /buildPublicConfigPayload/)
  assert.match(recovery, /blocks: \{ \.\.\.\(target\?\.blocks \|\| \{\}\) \}/)
})

test('recovery requires an authenticated writable D1 session and explicit user action', () => {
  assert.match(recovery, /canSave/)
  assert.match(recovery, /onClick=\{recover\}/)
  assert.match(recovery, /disabled=\{!canSave \|\| !selectedGroups\.length/)
  assert.match(recovery, /await reloadFromBackend\(\)/)
})
