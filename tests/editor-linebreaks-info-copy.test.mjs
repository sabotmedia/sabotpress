import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { publicInfoCopy, getPublicInfoField } from '../src/content/publicInfoCopy.js'

const classicEditorSource = await readFile(new URL('../src/lib/classicEditorBody.js', import.meta.url), 'utf8')
const bridgeSource = await readFile(new URL('../src/components/NativeContentBridgePage.jsx', import.meta.url), 'utf8')
const infoPageSource = await readFile(new URL('../src/components/PublicInfoPage.jsx', import.meta.url), 'utf8')

test('visual editor preserves browser-created DIV block boundaries', () => {
  assert.match(classicEditorSource, /if \(tag === 'div'\)/)
  assert.match(classicEditorSource, /return `<div>\$\{children\}<\/div>`/)
  assert.doesNotMatch(classicEditorSource, /if \(tag === 'div'\)[\s\S]{0,320}return children\s*\n\s*}/)
  assert.match(bridgeSource, /editor\.innerHTML/)
  assert.match(bridgeSource, /classicEditorBodyToHtml\(draft\.body \|\| ''\)/)
})

test('fresh installs expose neutral editable info-page defaults', () => {
  for (const page of ['about', 'contact', 'submit', 'support', 'security']) {
    assert.equal(typeof publicInfoCopy[page]?.title, 'string')
    assert.equal(typeof publicInfoCopy[page]?.body, 'string')
    assert.ok(publicInfoCopy[page].body.length > 0)
    assert.equal(getPublicInfoField(page, 'body'), publicInfoCopy[page].body)
  }

  const joined = JSON.stringify(publicInfoCopy)
  assert.doesNotMatch(joined, /Sabot Media|Grays Harbor|sabot\.media|Food Not Bombs|Autistici/i)
  assert.match(publicInfoCopy.about.body, /publication description/i)
  assert.match(publicInfoCopy.contact.body, /contact information/i)
  assert.match(infoPageSource, /getPublicInfoField/)
})
