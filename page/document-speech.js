import { speakable, speakableBlocks } from './speakable.js'

export const DOCUMENT_VOICE = 'Aoede'
export const DOCUMENT_STYLE = 'warm, natural and unhurried'
export const PREBUILT_VOICES = Object.freeze([
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe',
  'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
])

export function readAloudSettings(held) {
  return { voice: PREBUILT_VOICES.includes(held?.voice) ? held.voice : DOCUMENT_VOICE,
    describeTablesAndDiagrams: held?.describeTablesAndDiagrams !== false }
}

export function withoutFrontmatter(text) {
  return String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    .replace(/^---[ \t]*\n[\s\S]*?\n(?:---|\.\.\.)[ \t]*(?:\n|$)/, '')
}

export function documentSpeakable(text) {
  return speakable(documentMarkdown(text))
}

export function documentSpeechBlocks(text) {
  return speakableBlocks(documentMarkdown(text))
}

function documentMarkdown(text) {
  // An unaliased wiki-link is a note title, not a vault path or fragment.
  return withoutFrontmatter(text).replace(/(!?\[\[)([^\]|]+)(\]\])/g, (_, open, target, end) =>
    `${open}${target}|${target.split('#')[0].split('/').at(-1).replace(/\.md$/i, '') || target.replace(/^#/, '')}${end}`)
}

export function documentWords(text, { describeTablesAndDiagrams = true } = {}) {
  return documentSpeechBlocks(text).reduce((sum, block) => sum +
    (describeTablesAndDiagrams && block.description ? 30 : (block.text.match(/\S+/g)?.length ?? 0)), 0)
}

export function minutesLabel(minutes) {
  if (minutes < 1) return `${Math.round(minutes * 60)} s`
  return `${Number(minutes.toFixed(1))} min`
}

// Indexed slider stops, not a continuous promise of exact speech duration.
// Briefs stay clearly shorter than Full: no stop above 75% of the note.
export function documentStops(words) {
  const full = Math.max(0, Number(words) || 0) / 150
  const candidates = [0.5, 1, 3, 5, 10, 20, 30, 45, 60, 90, 120, 180, 240]
  const stops = candidates.filter((minutes) => (minutes !== 0.5 || full < 3) && minutes <= full * 0.75).map((minutes) => ({
    minutes, mode: 'brief', words: Math.round(minutes * 150),
    label: minutesLabel(minutes),
    short: minutesLabel(minutes),
  }))
  stops.push({ minutes: 'full', mode: 'verbatim', words, label: `Full · ${minutesLabel(full < 1 ? Math.max(1 / 60, full) : Math.round(full))}`, short: 'Full' })
  return stops
}

export const VOICE_SAMPLE = 'Here is a little time to listen. I will read your notes clearly, at an unhurried pace, so you can follow the ideas wherever you are.'
