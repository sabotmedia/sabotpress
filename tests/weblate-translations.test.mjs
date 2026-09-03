import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildWeblateSourceBundle,
  translationFromWeblateBundle,
} from '../functions/api/_lib/nativePublicTranslations.js'

test('Weblate source bundle splits article HTML into ordered translation units', () => {
  const bundle = buildWeblateSourceBundle({
    title: 'Title',
    excerpt: 'Excerpt',
    bodyHtml: '<h2>Heading</h2><p>First paragraph.</p><ul><li>One</li><li>Two</li></ul><p>Last paragraph.</p>',
  })

  assert.deepEqual(bundle.body, {
    '001': '<h2>Heading</h2>',
    '002': '<p>First paragraph.</p>',
    '003': '<ul><li>One</li><li>Two</li></ul>',
    '004': '<p>Last paragraph.</p>',
  })
  assert.equal(bundle.bodyHtml, undefined)
})

test('Weblate source segmentation preserves nested block markup', () => {
  const bundle = buildWeblateSourceBundle({
    title: 'Nested',
    bodyHtml: '<blockquote><p>Quoted paragraph.</p></blockquote><figure><img src="/image.jpg"><figcaption>Caption</figcaption></figure><hr><p>After.</p>',
  })

  assert.deepEqual(bundle.body, {
    '001': '<blockquote><p>Quoted paragraph.</p></blockquote>',
    '002': '<figure><img src="/image.jpg"><figcaption>Caption</figcaption></figure>',
    '003': '<hr>',
    '004': '<p>After.</p>',
  })
})

test('Weblate translated body units are reassembled in numeric order', () => {
  const translated = translationFromWeblateBundle({
    title: 'Titolo',
    body: {
      '010': '<p>Dieci</p>',
      '002': '<p>Due</p>',
      '001': '<h2>Uno</h2>',
    },
  }, {
    nativeContentId: 'native-1',
    languageCode: 'it',
  })

  assert.equal(translated.translation.bodyHtml, '<h2>Uno</h2><p>Due</p><p>Dieci</p>')
})

test('legacy Weblate bodyHtml imports remain supported', () => {
  const translated = translationFromWeblateBundle({
    title: 'Titre',
    bodyHtml: '<p>Ancien format</p>',
  }, {
    nativeContentId: 'native-1',
    languageCode: 'fr',
  })

  assert.equal(translated.translation.bodyHtml, '<p>Ancien format</p>')
})
