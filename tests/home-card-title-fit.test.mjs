import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const css = fs.readFileSync(new URL('../src/home-feed-v3.css', import.meta.url), 'utf8')
const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const homepage = fs.readFileSync(new URL('../src/components/NativeUpdatesPage.jsx', import.meta.url), 'utf8')
const card = fs.readFileSync(new URL('../src/components/HomeFeedCard.jsx', import.meta.url), 'utf8')

test('homepage no longer renders the legacy publication card or grid class family', () => {
  assert.match(homepage, /HomeFeedCard item=\{featuredItem\} variant="hero"/)
  assert.match(homepage, /HomeFeedCard key=\{item\.id\} item=\{item\} variant="recent"/)
  assert.match(homepage, /home-feed-grid home-feed-grid--\$\{homepageSettings\.featuredLayout\}/)
  assert.match(homepage, /data-home-renderer="v3"/)
  assert.doesNotMatch(homepage, /publication-recent-grid/)
  assert.doesNotMatch(homepage, /publication-post-card/)
  assert.doesNotMatch(homepage, /publication-hero-card/)
})

test('all three title display modes use the isolated homepage card component', () => {
  assert.match(card, /data-home-card-mode="hidden"/)
  assert.match(card, /data-home-card-mode="overlay"/)
  assert.match(card, /data-home-card-mode="below"/)
  assert.match(card, /resolveFeaturedTitleDisplay/)
  assert.doesNotMatch(card, /publication-post-card/)
  assert.doesNotMatch(card, /publication-hero-card/)
})

test('overlay titles are normal-flow content and cannot be line-clamped', () => {
  assert.match(css, /\.home-feed-card__overlay-flow\s*\{[\s\S]*position:\s*relative[\s\S]*height:\s*auto[\s\S]*overflow:\s*visible/)
  assert.match(css, /home-feed-card--recent \.home-feed-card__overlay-flow[\s\S]*margin-top:\s*clamp\(-/)
  assert.match(css, /\.home-feed-card__title\s*\{[\s\S]*max-height:\s*none[\s\S]*overflow:\s*visible[\s\S]*-webkit-line-clamp:\s*unset/)
  assert.doesNotMatch(css, /\.home-feed-card__overlay-flow[\s\S]{0,400}position:\s*absolute/)
})

test('homepage grid rows and cards are content-height', () => {
  assert.match(css, /\.home-feed-grid\s*\{[\s\S]*grid-auto-rows:\s*auto[\s\S]*align-items:\s*start[\s\S]*overflow:\s*visible/)
  assert.match(css, /\.home-feed-card\s*\{[\s\S]*height:\s*auto[\s\S]*max-height:\s*none[\s\S]*align-self:\s*start[\s\S]*overflow:\s*visible/)
})

test('v3 stylesheet loads after every legacy homepage compatibility layer', () => {
  assert.ok(main.indexOf("./home-feed-v3.css") > main.indexOf("./public-card-overlay-v2.css"))
  assert.ok(main.indexOf("./home-feed-v3.css") > main.indexOf("./public-card-title-fit.css"))
  assert.ok(main.indexOf("./home-feed-v3.css") > main.indexOf("./sitewide-mobile-polish.css"))
})
