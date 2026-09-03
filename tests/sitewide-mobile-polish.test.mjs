import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/sitewide-mobile-polish.css', import.meta.url), 'utf8')
const publicMobile = fs.readFileSync(new URL('../src/public-mobile.css', import.meta.url), 'utf8')
const featuredImageOnly = fs.readFileSync(new URL('../src/public-featured-image-only.css', import.meta.url), 'utf8')

test('site-wide mobile authority is loaded after legacy responsive CSS', () => {
  const mobileIndex = main.indexOf("import './sitewide-mobile-polish.css'")
  assert.ok(mobileIndex > main.indexOf("import './public-mobile.css'"))
  assert.ok(mobileIndex > main.indexOf("import './public-featured-image-only.css'"))
  assert.ok(mobileIndex > main.indexOf("import './admin-navigation.css'"))
})

test('mobile authority covers public shell, masthead, archive, reading, gallery, reader and footer', () => {
  for (const selector of [
    '.public-route-shell',
    '.publication-topbar',
    '.publication-homepage',
    '.archive-page',
    '.piece-layout',
    '.feeds-public-page__panel',
    '.collection-lead',
    '.publication-gallery-grid',
    '.publication-reader',
    '.publication-footer',
  ]) assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(css, /@media \(max-width: 900px\)/)
  assert.match(css, /@media \(max-width: 600px\)/)
  assert.match(css, /@media \(max-width: 390px\)/)
})

test('featured image only cards remain natural-height on phones', () => {
  assert.match(featuredImageOnly, /publication-hero-card--title-hidden/)
  assert.match(featuredImageOnly, /min-height: 0 !important/)
  assert.match(css, /publication-hero-card--title-hidden/)
  assert.match(css, /publication-post-card--title-hidden/)
  assert.match(css, /min-height: 0 !important/)
})

test('mobile authority replaces legacy giant viewport card sizing with bounded responsive sizing', () => {
  assert.match(publicMobile, /68svh/)
  assert.doesNotMatch(css, /min-height:\s*68svh/)
  assert.match(css, /min\(50svh, 27rem\)/)
  assert.match(css, /clamp\(2\.05rem, 10\.8vw, 3\.5rem\)/)
})

test('admin mobile coverage includes navigation, forms, tables, media picker and dense labs containment', () => {
  for (const selector of [
    '.wp-admin-topbar',
    '.admin-frame__main',
    '.admin-rail',
    '.admin-frame table',
    '.media-library-grid',
    '.media-picker-modal__panel',
    '.print-lab-page',
    '.audio-lab-page',
  ]) assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(css, /font-size: 16px !important/)
  assert.match(css, /overflow-x: auto/)
})

test('mobile polish includes touch, safe-area and reduced-motion safeguards', () => {
  assert.match(css, /env\(safe-area-inset-top\)/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
  assert.match(css, /min-height: 44px/)
  assert.match(css, /prefers-reduced-motion: reduce/)
})
