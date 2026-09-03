import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const publicConfig = fs.readFileSync(new URL('../src/lib/publicConfig.js', import.meta.url), 'utf8')
const resolvedConfig = fs.readFileSync(new URL('../src/lib/useResolvedConfig.js', import.meta.url), 'utf8')
const editContext = fs.readFileSync(new URL('../src/components/PublicEditContext.jsx', import.meta.url), 'utf8')
const infoPage = fs.readFileSync(new URL('../src/components/PublicInfoPage.jsx', import.meta.url), 'utf8')

test('published public config never implicitly falls back to browser localStorage', () => {
  assert.match(publicConfig, /resolvePublicConfig\(runtimeConfig = \{\}\)/)
  const resolveBody = publicConfig.slice(publicConfig.indexOf('export function resolvePublicConfig'), publicConfig.indexOf('export function getConfiguredText'))
  assert.doesNotMatch(resolveBody, /getStoredPublicConfig/)
  assert.match(resolveBody, /mergeSchemaConfigs\(publicSiteDefaults, runtimeConfig \|\| \{\}\)/)
})

test('non-editing public pages require loaded D1 config and ignore local drafts', () => {
  assert.match(resolvedConfig, /backendMode !== 'd1'/)
  assert.match(resolvedConfig, /loadState !== 'loaded'/)
  assert.match(resolvedConfig, /isAdmin && isEditing/)
  assert.match(resolvedConfig, /savedConfig \|\| EMPTY_CONFIG/)
  const publishedPath = resolvedConfig.slice(resolvedConfig.indexOf("if (backendMode !== 'd1'"))
  assert.doesNotMatch(publishedPath, /effectiveConfig \|\| EMPTY_CONFIG/)
})

test('legacy local edit caches cannot become the published source of truth', () => {
  assert.match(editContext, /sabot-public-edit-draft-v2/)
  assert.match(editContext, /effectiveConfig/)
  assert.match(resolvedConfig, /authenticated editor/)
  assert.match(resolvedConfig, /Published public pages must be device-independent/)
})

test('about contact submit support and security share the authoritative PublicInfoPage renderer', () => {
  assert.match(infoPage, /getEditablePage\(page\)/)
  assert.match(infoPage, /EditableText/)
  assert.match(infoPage, /editablePage\.body\.field/)
})
