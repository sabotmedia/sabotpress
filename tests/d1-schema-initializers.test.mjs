import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const files = [
  'functions/api/_lib/taxonomy.js',
  'functions/api/_lib/editorRoles.js',
  'functions/api/_lib/mediaAssets.js',
  'functions/api/_lib/publicSiteConfig.js',
  'functions/api/_lib/auditLog.js',
  'functions/api/_lib/nativeContentSources.js',
  'functions/api/_lib/nativePublicTranslations.js',
  'functions/api/feed-settings.js',
  'functions/api/sites.js',
  'functions/api/collections.js',
]

for (const file of files) {
  test(`${file} avoids db.exec schema batches`, () => {
    const src = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /db\.exec\s*\(/)
    assert.match(src, /db\.prepare\s*\(/)
  })
}

test('public site config fails closed when D1 is unavailable', () => {
  const api = fs.readFileSync(new URL('../functions/api/public-site-config.js', import.meta.url), 'utf8')
  const client = fs.readFileSync(new URL('../src/lib/publicConfigApi.js', import.meta.url), 'utf8')
  assert.match(api, /databaseUnavailable\('public site config reads'\)/)
  assert.match(api, /databaseUnavailable\('public site config writes'\)/)
  assert.doesNotMatch(api, /mode:\s*'scaffold'[\s\S]*saved:\s*true/)
  assert.match(client, /data\.mode !== 'd1'/)
})

test('native translation API keeps writes behind editorial auth', () => {
  const api = fs.readFileSync(new URL('../functions/api/native-translations.js', import.meta.url), 'utf8')
  assert.match(api, /resolvePublicSitePermission/)
  assert.match(api, /if \(!permission\.canEdit\)/)
  assert.match(api, /native_translation\.upsert/)
  assert.match(api, /native_translation\.delete/)
})

test('public translation selector sanitizes locally rendered translated HTML', () => {
  const selector = fs.readFileSync(new URL('../src/publicTranslationSelector.js', import.meta.url), 'utf8')
  assert.match(selector, /sanitizeTranslatedHtml/)
  assert.match(selector, /querySelectorAll\('script, style, iframe, object, embed, form/)
  assert.match(selector, /name\.startsWith\('on'\)/)
})
