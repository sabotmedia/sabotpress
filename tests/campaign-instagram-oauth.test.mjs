import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const auth = fs.readFileSync(new URL('../functions/api/campaign-instagram-auth.js', import.meta.url), 'utf8')
const callback = fs.readFileSync(new URL('../functions/api/campaign-instagram-callback.js', import.meta.url), 'utf8')

test('Instagram OAuth uses a dedicated exact-match callback URL without a query string', () => {
  assert.match(auth, /\/api\/campaign-instagram-callback/)
  assert.match(callback, /handleInstagramCallback/)
  assert.doesNotMatch(auth.match(/function callbackUrl[\s\S]*?function configurationStatus/)?.[0] || '', /INSTAGRAM_REDIRECT_URI|\?mode=callback/)
})
