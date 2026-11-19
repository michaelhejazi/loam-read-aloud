import { numberWords } from '../page/speakable.js'

// Word equivalents for the text handed to TTS, not the source markdown.
// This estimates pronunciation; it never rewrites the transcript or learns
// from a generation that has not independently been checked for fidelity.
export function spokenWords(text) {
  const expanded = String(text ?? '')
    .replace(/([\p{Ll}\d])([\p{Lu}])/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .replace(/(?<=\d),(?=\d{3}\b)/g, '')
  const tokens = expanded.match(/\p{L}+(?:['’]\p{L}+)*|\d+(?:\.\d+)?|<=|>=|!=|[%×+÷=&/@<>°]/gu) ?? []
  return tokens.reduce((sum, token) => {
    if (/^\d/.test(token)) return sum + numericWords(token)
    if (/^[A-Z]{2,6}$/.test(token) || /^(?:api|sdk|cli|cpu|gpu|http|https|sql|uuid)$/i.test(token)) return sum + token.length
    const symbols = { '%': 1, '×': 1, '+': 1, '÷': 2, '=': 1, '&': 1, '/': 1, '@': 1, '<': 2, '>': 2, '<=': 5, '>=': 5, '!=': 3, '°': 1 }
    return sum + (symbols[token] ?? 1)
  }, 0)
}

function numericWords(token) {
  const [whole, decimal] = token.split('.')
  // Versions/serials with leading zeroes are usually read digit by digit.
  const integer = /^0\d/.test(whole) || whole.length > 9
    ? whole.length : cardinalWords(Number(whole))
  return integer + (decimal === undefined ? 0 : 1 + decimal.length)
}

function cardinalWords(n) {
  if (n < 1000) return numberWords(n).replace(/\band\b/g, '').trim().split(/[\s-]+/).filter(Boolean).length
  const scale = n < 1_000_000 ? 1000 : 1_000_000
  const rest = n % scale
  return cardinalWords(Math.floor(n / scale)) + 1 + (rest ? (rest < 100 ? 1 : 0) + cardinalWords(rest) : 0)
}
