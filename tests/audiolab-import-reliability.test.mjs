import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [main, importer, standalone, css] = await Promise.all([
  readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/audioLabImportReliability.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/audioLabStandalone.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/audio-lab-standalone.css', import.meta.url), 'utf8'),
])

test('AudioLab reliable importer owns the hidden audio picker before React renders', () => {
  const standaloneIndex = main.indexOf("import './audioLabStandalone.js'")
  const importerIndex = main.indexOf("import './audioLabImportReliability.js'")
  const keyboardIndex = main.indexOf("import './audioLabKeyboardShortcuts.js'")
  assert.ok(standaloneIndex >= 0 && importerIndex > standaloneIndex && keyboardIndex > importerIndex)
  assert.match(importer, /document\.addEventListener\('change', interceptAudioImport, true\)/)
  assert.match(importer, /stopImmediatePropagation\(\)/)
  assert.match(importer, /putAudioLabAssetFromFile/)
  assert.match(importer, /saveAudioLabProject/)
  assert.match(importer, /window\.location\.reload\(\)/)
})

test('AudioLab import accepts common audio extensions even when browser MIME is missing', () => {
  for (const extension of ['mp3', 'wav', 'ogg', 'opus', 'm4a', 'webm', 'aac', 'flac']) {
    assert.match(importer, new RegExp(`\\['${extension}',\\s*'audio/`))
  }
  assert.match(importer, /audioElementDuration/)
  assert.match(importer, /decodeDurationFallback/)
})

test('AudioLab supports direct drag and drop into the track workspace', () => {
  assert.match(importer, /document\.addEventListener\('dragover', handleDragOver, true\)/)
  assert.match(importer, /document\.addEventListener\('drop', handleDrop, true\)/)
  assert.match(importer, /closest\('\.audio-lab-multitrack'\)/)
})

test('empty AudioLab projects collapse the useless overview and show a useful start state', () => {
  assert.match(standalone, /audio-lab-empty-project/)
  assert.match(standalone, /renderedTrackCount === 0/)
  assert.match(css, /audio-lab-empty-project \.audio-lab-timeline-shell[\s\S]*?grid-template-rows:\s*0 0 minmax\(0, 1fr\)/)
  assert.match(css, /Import audio, drag a file here, or press R to record/)
})

test('Studio status messages render as a bottom status bar instead of bottom-right overlays', () => {
  assert.match(css, /\.audio-lab-notice,[\s\S]*?\.audio-lab-import-status[\s\S]*?left:\s*6px[\s\S]*?right:\s*6px/)
})
