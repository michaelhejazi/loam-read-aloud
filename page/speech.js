// Listen and Brief: what the page reads aloud, and when it offers to.
//
// A person may hear an agent's reply rather than read it — often on the
// phone, often while doing something else. The server makes the audio
// (`/x/read-aloud/speech`, server/app.js); this file is the part of the page that has to be right
// without a browser: which words make up a reply, how many there are, and the
// device's settings for it. `app.js` draws the glyphs and the player from these.
//
// **The unit is the response set**: every agent turn after one of the person's
// messages, up to their next message or the end of the thread. An agent that
// answers in three turns — a result, then a background task's report, then a
// closing line — has said one thing to the person, and that is what is heard.
// Its text is what the agent said to them as the page drew it (the `.say`
// markdown), in order, joined by blank lines: never a tool fold, the thinking,
// a tool result, a permission or question card, or a harness line. It is
// computed from the thread every time, so an old reply is as listenable as the
// newest.

// The rates the pill cycles through, in order. The first is where a device
// with no setting starts.
export const SPEECH_RATES = Object.freeze([1, 1.5, 2])

// Listen from 10 to 500 words in tens; Brief from 100 to 1,000 in fifties.
export const LISTEN_MIN = 10
export const LISTEN_MAX = 500
export const LISTEN_STEP = 10
export const BRIEF_MIN = 100
export const BRIEF_MAX = 1000
export const BRIEF_STEP = 50
export const SPEECH_DEFAULTS = Object.freeze({ listenFrom: 50, briefFrom: 200, rate: 1 })

// The setting, read whole and cleaned: a value written by hand or by a later
// version is a default, never a glyph that cannot appear.
export function speechSettings(held) {
  const value = held && typeof held === 'object' ? held : {}
  return {
    listenFrom: stepped(value.listenFrom, LISTEN_MIN, LISTEN_MAX, LISTEN_STEP, SPEECH_DEFAULTS.listenFrom),
    briefFrom: stepped(value.briefFrom, BRIEF_MIN, BRIEF_MAX, BRIEF_STEP, SPEECH_DEFAULTS.briefFrom),
    rate: SPEECH_RATES.includes(value.rate) ? value.rate : SPEECH_DEFAULTS.rate,
  }
}

function stepped(n, min, max, step, fallback) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n / step) * step))
}

// The rate after this one: 1× → 1.5× → 2× → 1×.
export function nextRate(rate) {
  const at = SPEECH_RATES.indexOf(rate)
  return SPEECH_RATES[(at + 1) % SPEECH_RATES.length]
}

export function rateLabel(rate) {
  return `${rate}×`
}

// Words as a reader would count them: runs of anything that is not space.
// Markdown's marks ride along with the word they touch, which is the right
// answer for a threshold — a list of fifty one-word bullets is fifty words.
export function wordCount(text) {
  const words = String(text ?? '').match(/\S+/g)
  return words ? words.length : 0
}

// `1:05`, `12:40`, `1:02:09`. Unknown is `–:––`, never `0:00`: a track whose
// length is not known yet has not got a length of nothing.
export function clock(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '–:––'
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

// The thousands written as a person reads them: "1,000 words".
export function wordsLabel(n) {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} words`
}

// The response sets of a thread, from the flattened lines the thread draws —
// `threadItems()` in app.js, whose entries are `{what, block?, item?}`.
//
// Each set is `{ start, end, text, words, anchor, first }`:
//
// - `start`/`end`: the flat indices it covers, `end` exclusive — from the line
//   after the person's message to the line before their next one.
// - `text`: the agent's `.say` text blocks, each trimmed, joined by a blank
//   line. Nothing else in the set is in it.
// - `anchor`: the index of the set's **last turn line** — its last `result` —
//   when nothing the agent said comes after it; otherwise `null`, which is a set
//   still being written, and its glyphs go at its end.
// - `first`: the set's first entry, whose object is the set's identity for the
//   reconciler — stable while the set grows, and while history is prepended
//   above it, which a key from the person's message above would not be.
//
// A set with no words is not returned: there is nothing in it to hear.
export function responseSets(flat) {
  const sets = []
  let current = null
  const close = (end) => {
    if (current && current.texts.length > 0) {
      const text = current.texts.join('\n\n')
      const anchor = current.lastResult !== null && current.lastResult > current.lastText ? current.lastResult : null
      sets.push({ start: current.start, end, text, words: wordCount(text), anchor, first: current.first })
    }
    current = null
  }
  for (let i = 0; i < flat.length; i += 1) {
    const entry = flat[i]
    if (entry.what === 'user') {
      close(i)
      continue
    }
    if (!current) current = { start: i, texts: [], lastText: -1, lastResult: null, first: entry }
    if (entry.what === 'text') {
      const said = String(entry.block?.text ?? '').trim()
      if (said !== '') {
        current.texts.push(said)
        current.lastText = i
      }
    } else if (entry.what === 'result') {
      current.lastResult = i
    }
  }
  close(flat.length)
  return sets
}

// How long a reply takes to hear, as the read-aloud menu says it: about 150
// words a minute, rounded the way a person says a length — "about 40 s",
// "about 1½ min", "about 7 min". Ten seconds is the shortest it says.
export const WORDS_PER_MINUTE = 150

export function listenEstimate(words) {
  const seconds = (Math.max(0, Number(words) || 0) / WORDS_PER_MINUTE) * 60
  if (seconds < 55) return `about ${Math.max(10, Math.round(seconds / 10) * 10)} s`
  if (seconds < 165) {
    const halves = Math.round(seconds / 30) / 2
    const whole = Math.floor(halves)
    return `about ${whole}${halves > whole ? '½' : ''} min`
  }
  return `about ${Math.round(seconds / 60)} min`
}

// A brief's length is the server's contract, not the reply's: a few hundred
// words at most, which is a minute or two whatever went in.
export const BRIEF_ESTIMATE = 'about 1 to 2 min'

// How long a take takes to make, as the menu says it before the tap: a brief is
// written and then voiced, which is about half a minute whatever went in; a
// reply read as written is about ten seconds and then a little for every word.
// The server's figures, measured on the deployed box, rounded the way the
// lengths above are.
export function makeEstimate(words, mode) {
  const seconds = mode === 'brief' ? 30 : 10 + Math.max(0, Number(words) || 0) * 0.06
  if (seconds < 55) return `takes about ${Math.max(10, Math.round(seconds / 10) * 10)} s to make`
  return `takes about ${Math.round(seconds / 60)} min to make`
}

// What a row of the read-aloud menu says under its word, for the take's state:
// `none`, `making`, `ready` (or playing, paused, ended — a take that exists),
// or `failed`. **Ready is said only from what the server has**, so "Ready ·
// 2:09" is a promise that the tap plays at once.
export function takeLine({ mode, words, phase, duration = null }) {
  if (phase === 'ready') return typeof duration === 'number' && Number.isFinite(duration) ? `Ready · ${clock(duration)}` : 'Ready'
  if (phase === 'making') return 'Making · it waits for your tap when it is ready'
  if (phase === 'failed') return 'It could not be made · tap to try again'
  const what = mode === 'brief' ? `Summary first, attention items last · ${BRIEF_ESTIMATE}` : `The reply, read as written · ${listenEstimate(words)}`
  return `${what} · ${makeEstimate(words, mode)}`
}

// The docked bar's leading words: "Ready · Listen · Ada" for a take made and
// not yet heard, "Making · Brief · Ada" for one on its way, and the plain
// "Listen · Ada" once it has been played.
export function barWho({ kind, mode, agentName }) {
  const word = mode === 'brief' ? 'Brief' : 'Listen'
  const lead = kind === 'ready' ? 'Ready · ' : kind === 'making' ? 'Making · ' : ''
  return `${lead}${word} · ${agentName}`
}
