import test from 'node:test'
import assert from 'node:assert/strict'

import { unwrapWeblateBundle } from '../src/lib/nativeTranslationsApi.js'

test('unwrapWeblateBundle accepts direct translation JSON', () => {
  const bundle = { title: 'Titolo', body: { '001': '<p>Ciao</p>' } }
  assert.equal(unwrapWeblateBundle(bundle), bundle)
})

test('unwrapWeblateBundle accepts Sabot source-export wrapper', () => {
  const bundle = { title: 'Titre', body: { '001': '<p>Salut</p>' } }
  assert.equal(unwrapWeblateBundle({ ok: true, bundle }), bundle)
})

test('unwrapWeblateBundle rejects non-object files', () => {
  assert.throws(() => unwrapWeblateBundle(['bad']), /JSON object/)
})
