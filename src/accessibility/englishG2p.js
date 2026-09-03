import { DIGIT_PHONEMES, NRL_RULES } from './nrlRules.js'

const VOWELS = new Set(['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW'])
const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXZ'
const CONTEXT = {
  '#': '[AEIOUY]+',
  '.': '[BDVGJLMNRWZ]',
  '%': '(?:ER|E|ES|ED|ING|ELY)',
  '&': '(?:S|C|G|Z|X|J|CH|SH)',
  '@': '(?:T|S|R|D|L|Z|N|J|TH|CH|SH)',
  '^': `[${CONSONANTS}]`,
  '+': '[EIY]',
  ':': `[${CONSONANTS}]*`,
}

const LETTER_NAMES = {
  A: 'EY', B: 'B IY', C: 'S IY', D: 'D IY', E: 'IY', F: 'EH F', G: 'JH IY', H: 'EY CH',
  I: 'AY', J: 'JH EY', K: 'K EY', L: 'EH L', M: 'EH M', N: 'EH N', O: 'OW', P: 'P IY',
  Q: 'K Y UW', R: 'AA R', S: 'EH S', T: 'T IY', U: 'Y UW', V: 'V IY', W: 'D AH B AH L Y UW',
  X: 'EH K S', Y: 'W AY', Z: 'Z IY',
}

const ACRONYMS = new Set([
  'AI', 'API', 'CSS', 'DNS', 'FBI', 'HTML', 'HTTP', 'HTTPS', 'LLM', 'OFAC', 'PDF', 'RSS', 'TTS',
  'UK', 'US', 'USA', 'URL', 'WAV', 'WWW',
])

// Small project-specific dictionary for names that generic 1970s spelling rules understandably do not know.
const OVERRIDES = {
  sabot: 'S AE1 B OW0',
  molotov: 'M AA1 L AH0 T AA2 V',
  autistici: 'AW0 T IY1 S T IY0 CH IY0',
  inventati: 'IH0 N V EH0 N T AA1 T IY0',
  dazibao: 'D AA0 Z IY0 B AW1',
  gaza: 'G AA1 Z AH0',
  noblogs: 'N OW1 B L AA2 G Z',
  mastodon: 'M AE1 S T AH0 D AA2 N',
  paranoia: 'P EH2 R AH0 N OY1 AH0',
  podcast: 'P AA1 D K AE2 S T',
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function expandContext(value) {
  let result = ''
  for (const char of value) result += CONTEXT[char] || escapeRegex(char)
  return result
}

function compileRule(rule) {
  const match = /^([^[]*)\[([^\]]+)\]([^=]*)=\/(.*)\/$/.exec(rule)
  if (!match) return null
  const [, left, target, right, output] = match
  return {
    target,
    left: left ? new RegExp(`${expandContext(left)}$`) : null,
    right: right ? new RegExp(`^${expandContext(right)}`) : null,
    output: output.trim() ? output.trim().split(/\s+/) : [],
  }
}

const COMPILED_RULES = Object.fromEntries(
  Object.entries(NRL_RULES).map(([letter, rules]) => [letter, rules.map(compileRule).filter(Boolean)]),
)

function normalizePhone(raw) {
  const clean = String(raw || '').replace(/[012]$/, '')
  if (clean === 'AX') return 'AH'
  if (clean === 'NX') return 'NG'
  if (clean === 'WH') return 'W'
  return clean
}

function parsePhones(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  return parts.map((part) => ({
    code: normalizePhone(part),
    stressed: /1$/.test(part),
  })).filter((phone) => phone.code)
}

function applyDefaultStress(phones) {
  if (phones.some((phone) => phone.stressed)) return phones
  const preferred = phones.findIndex((phone) => VOWELS.has(phone.code) && phone.code !== 'AH')
  const fallback = phones.findIndex((phone) => VOWELS.has(phone.code))
  const index = preferred >= 0 ? preferred : fallback
  return phones.map((phone, i) => ({ ...phone, stressed: i === index }))
}

function spellLetters(word) {
  const phones = []
  for (const letter of word) {
    const value = LETTER_NAMES[letter]
    if (value) phones.push(...applyDefaultStress(parsePhones(value)))
  }
  return phones
}

export function wordToPhones(rawWord) {
  const original = String(rawWord || '').normalize('NFKD').replace(/\p{M}/gu, '')
  const word = original.replace(/[^A-Za-z]/g, '')
  if (!word) return []
  const lower = word.toLowerCase()
  if (OVERRIDES[lower]) return parsePhones(OVERRIDES[lower])

  const upper = word.toUpperCase()
  if (upper.length === 1 || ACRONYMS.has(upper)) return spellLetters(upper)

  const text = ` ${upper} `
  const phones = []
  let pos = 1

  while (pos < text.length - 1) {
    const letter = text[pos]
    const rules = COMPILED_RULES[letter] || []
    let matched = false

    for (const rule of rules) {
      if (!text.startsWith(rule.target, pos)) continue
      const leftText = text.slice(0, pos)
      const rightText = text.slice(pos + rule.target.length)
      if (rule.left && !rule.left.test(leftText)) continue
      if (rule.right && !rule.right.test(rightText)) continue
      for (const raw of rule.output) {
        const code = normalizePhone(raw)
        if (code && !code.startsWith('<')) phones.push({ code, stressed: false })
      }
      pos += rule.target.length
      matched = true
      break
    }

    if (!matched) pos += 1
  }

  return applyDefaultStress(phones)
}

function normalizeInitialisms(text) {
  return text.replace(/\b(?:[A-Za-z]\.){2,}/g, (match) => match.replace(/\./g, ''))
}

export function textToSpeechTokens(rawText) {
  const text = normalizeInitialisms(String(rawText || '').normalize('NFKC'))
  const parts = text.match(/[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿ]+)?|\d+|[.,;:!?]/g) || []
  const tokens = []

  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      for (const digit of part) {
        const phones = applyDefaultStress((DIGIT_PHONEMES[digit] || []).map((code) => ({ code, stressed: false })))
        if (phones.length) tokens.push({ type: 'word', text: digit, phones })
      }
      continue
    }

    if (/^[.,;:!?]$/.test(part)) {
      const ms = /[.!?]/.test(part) ? 280 : /[;:]/.test(part) ? 180 : 110
      tokens.push({ type: 'pause', ms })
      continue
    }

    const phones = wordToPhones(part)
    if (phones.length) tokens.push({ type: 'word', text: part, phones })
  }

  return tokens
}
