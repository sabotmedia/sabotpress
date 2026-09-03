export function getProjectTheme(slugOrName) {
  const value = String(slugOrName || '').trim().toLowerCase()

  const key = value
    .replace(/^the\s+/, '')
    .replace(/!/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const map = {
    'harbor-rat-report': {
      className: 'theme-harbor-rat',
      accent: 'editorial / report / signal',
    },
    'molotov-now': {
      className: 'theme-molotov-now',
      accent: 'broadcast / waveform / transmission',
    },
    'communique': {
      className: 'theme-communique',
      accent: 'bulletin / dispatch / recurring',
    },
    'the-communique': {
      className: 'theme-communique',
      accent: 'bulletin / dispatch / recurring',
    },
    'black-cat-distro': {
      className: 'theme-black-cat',
      accent: 'print / distro / material',
    },
    'sabotuers': {
      className: 'theme-sabotuers',
      accent: 'comic / panel / graphic',
    },
    'the-sabotuers': {
      className: 'theme-sabotuers',
      accent: 'comic / panel / graphic',
    },
    'zines-and-comics': {
      className: 'theme-zines-comics',
      accent: 'zine / comic / visual',
    },
    'general': {
      className: 'theme-general',
      accent: 'archive / mixed / uncategorized',
    },
  }

  return map[key] || {
    className: 'theme-general',
    accent: 'project archive',
  }
}
