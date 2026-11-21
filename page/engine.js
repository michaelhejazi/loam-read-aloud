
// This plugin's own server, through Loam's plugin gateway (server/app.js).
const SERVER = '/x/read-aloud/'
// Mounted once. Cross-module state and operations are explicit host services.
import { BrowserAudio } from './browser-audio.js'
import { openAIVoices } from './openai-voices.js'
export function mount(host) {
const { agentLook, onNode, h, icon, kept, wave, morph, authExpired, fetch, DOCUMENT_STYLE, documentWords, documentStops, VOICE_SAMPLE, fileNameOf, takeLine, barWho, rateLabel, speechClock, nextRate, menuSurface, markdown } = host


// ------------------------------------------------------- listen and brief
//
// The owner, 2026-10-02: they want to hear an agent's reply rather than read it,
// often on the phone and often while doing something else. One quiet speaker
// glyph at the right of the turn line under a **response set** (see
// `speech.js`), named "Read aloud". A tap opens a small menu anchored to it with
// two rows, each a mark, a word and a line saying what it is and how long:
// **Listen**, the reply as written, and **Brief**, a short spoken summary — the
// second only from the device's Brief threshold. The owner, the same day, on the
// two glyphs this replaced: "The icon for the brief is a little vague … the user
// can choose between one of them, with text next to it". Choosing a row asks
// this app's server for the audio and a player row appears under that line.
//
// **The voice must outlive every redraw**, because the thread is redrawn on
// every stream event and a reply is usually read aloud while the agent is still
// writing. So the `Audio` is never on the page at all, and the row is one node
// made once per player and placed with `kept()` — the reconciler moves a
// stand-in and never patches, rebuilds or re-parents what is playing. The row's
// own insides are redrawn by `drawPlayer()`, on the audio's own events, so a
// clock ticking is a few spans and not a page.
//
// **And it follows the person** (the owner, 2026-10-02: "When I scroll, it's very
// easy to lose where the player was … even when I leave the chat I can see it in
// my chat list window still playing"). One audio, two surfaces: the row, which
// is the full player while it is on the screen, and a **docked bar** under the
// header of whatever screen is up — drawn when the row has scrolled out of view
// (an intersection observer says so) or is not on the page at all, because the
// chat was left. The bar is a second kept node of the same player, redrawn by
// the same `drawTake()`, so the two can never disagree. A tap on its words goes
// back to the chat and the row. Leaving a chat does not stop the voice; ✕ does.
//
// **And it never plays by itself** (the owner, 2026-10-04: "I might be somewhere
// else or not ready to listen to it due to the delay"). A take is made and stops
// at ready; the bar carries "Making · …" and then "Ready · …" to wherever they
// is; several takes can be made and held at once, one playing; and the glyph
// says before the tap whether a take is there, from what the server has. See
// "Every response can have a take" below.
//
// A reload ends playback: nothing of a take is stored on the device, and the
// glyphs on a page loaded fresh are asked of the server again.
const SPEECH_POLL_MS = 1000


// How long a lookup's answer is trusted before a glyph asks again. The menu
// asks afresh every time it opens, so this is only how stale a glyph's mark
// can be on a screen nobody touches.
const LOOKUP_FRESH_MS = 5 * 60_000


// How many times a vanished file is asked for again without the person seeing
// it, before it is a failure they are shown.
const SPEECH_REPOSTS = 2

const SEEK_STEP_S = 5

const SPEECH_STAGES = { writing: 'Writing the brief…', describing: 'Describing tables and diagrams…', voicing: 'Voicing…', encoding: 'Encoding…' }

const SPEECH_ACTIONS = ['play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'stop']

const SPEECH_MODES = ['verbatim', 'brief']


// The dock floats over the foot of a chat, so a row behind it is not one a
// person can see. The stylesheet's own figure for the dock's height.
const ROW_HIDDEN_BELOW_PX = 96



// **Every response can have a take, one per mode**, and each take is in one of
// these states: none, making, ready, playing, paused, ended, failed. `phase` is
// the server's half — none, making, ready, failed — and the audio element is
// the rest: a ready take with an audio that is playing is playing, and so on.
// See `takeState()`. The owner, 2026-10-04: "since there's a delay until it gets
// created, I'd much rather it not be played automatically". **Nothing moves to
// playing except a tap**: the one `play()` in this file is `startPlay()`, and
// it is called from a tap, the lock screen, or the answer to a tap that the
// server had ready at once.
//
// Keyed by chat, mode and the set's text — which is what the server's id is
// made of — so a chat reopened from new objects finds its takes again, and a
// take made on the phone is found by the desktop's lookup under the same text.
const takes = new Map()

let takeSerial = 0


// The take last played. While it is playing or paused it owns the docked bar.
let current = null


// The takes whose rows this draw placed in the thread. Cleared at the top of
// `render()` and filled by `turnRow()`, which is drawn before any bar is.
const rowsPlaced = new Set()

let rowWatch = null



// The identity of a response set, for the glyph and the menu: its first
// line's object, which stays put while the set grows and while earlier history
// is prepended above it.
function setKey(set) {
  return set.key ?? `say:${host.keyOf(set.first.item ?? set.first.block)}`
}

function speechWord(mode) {
  return mode === 'brief' ? 'Brief' : 'Listen'
}

function speechKicker(t) {
  return `${speechWord(t.mode)} · ${t.agentName}${t.provider === 'openai' ? ' · OpenAI generated voice' : ''}`
}

const takeKeyOf = (chatId, mode, text, request = null) => `${chatId}\n${mode}\n${text}${request && Object.keys(request).length ? `\n${JSON.stringify(request)}` : ''}${mode === 'verbatim' ? `\ndescribe:${host.store.readAloud.describeTablesAndDiagrams !== false}` : ''}`

const takeAlive = (t) => Boolean(t) && takes.get(t.tkey) === t

const isPlaying = (t) => Boolean(t?.audio && !t.audio.paused && !t.audio.ended)



// The take's one state, from the server's half and the audio's.
function takeState(t) {
  if (!t || t.phase === 'none') return 'none'
  if (t.phase !== 'ready') return t.phase
  if (!t.audio || !t.started) return 'ready'
  if (t.audio.ended) return 'ended'
  return t.audio.paused ? 'paused' : 'playing'
}



// The modes this device's thresholds offer on a set.
function setModes(set) {
  const out = []
  if (set.words >= host.state.speech.listenFrom) out.push('verbatim')
  if (host.state.provider !== 'browser' && set.words >= host.state.speech.briefFrom) out.push('brief')
  return out
}



// The take of a set's mode in the open chat: the one made of exactly its text,
// or — for a set that has grown since a take of it was opened — that take,
// while it is still on the screen.
function findTake(set, mode) {
  const chatId = set.context?.id
  if (!chatId) return null
  const exact = takes.get(takeKeyOf(chatId, mode, set.text, set.context?.request))
  if (exact) return exact
  let found = null
  for (const t of takes.values()) {
    if (t.chatId !== chatId || t.mode !== mode || !t.open || t.text === '' || !set.text.startsWith(t.text) ||
      (mode === 'verbatim' && t.describeTablesAndDiagrams !== (host.store.readAloud.describeTablesAndDiagrams !== false)) ||
      JSON.stringify(t.request ?? {}) !== JSON.stringify(set.context?.request ?? {})) continue
    if (!found || t.serial > found.serial) found = t
  }
  return found
}



// A thread message can supply the same identity metadata that Files supplies.
function newTake(set, mode, context = null) {
  const open = context ?? set.context
  context ??= set.context
  const record = { title: open.title }
  const look = agentLook(open.agent, host.state.agents)
  const el = document.createElement('div')
  const bar = document.createElement('div')
  takeSerial += 1
  el.__key = `player:${takeSerial}`
  bar.__key = `playerbar:${takeSerial}`
  const t = {
    serial: takeSerial,
    tkey: takeKeyOf(open.id, mode, set.text, context?.request),
    mode,
    describeTablesAndDiagrams: host.store.readAloud.describeTablesAndDiagrams !== false,
    chatId: open.id,
    agent: open.agent,
    threadId: context?.threadId,
    request: context?.request,
    agentName: context?.name ?? (look.name || open.agent || ''),
    title: typeof record?.title === 'string' ? record.title : '',
    text: set.text,
    browser: host.state.provider === 'browser',
    provider: host.state.provider,
    phase: host.state.provider === 'browser' ? 'ready' : 'none',
    stage: null,
    progress: null,
    id: null,
    url: null,
    duration: null,
    brief: null,
    briefOpen: false,
    error: '',
    reposts: 0,
    audio: null,
    timer: null,
    dragging: false,
    // Played at least once since it was last made: "unplayed" is its absence.
    started: false,
    // Whether its row is under its set: a take this device asked for, made or
    // played. A take only looked up has a mark on the glyph and no row.
    open: false,
    // ✕ on the bar's ready or making form: the bar lets it go, the row keeps it.
    dismissed: false,
    readyAt: 0,
    checkedAt: 0,
    looking: false,
    // Where the row is: on the screen, as far as anything has said.
    inView: true,
    // Set by a tap on the bar's words: the row is to be scrolled into view once
    // the chat has opened and drawn it.
    reveal: false,
    el,
    bar,
  }
  // The row is a group the keyboard can stand on: space plays and pauses, and
  // the arrows move five seconds. A space on one of its buttons is that
  // button's, and is left to it.
  el.setAttribute('tabindex', '0')
  el.setAttribute('role', 'group')
  onNode(el, 'keydown', (e) => playerKey(t, e))
  bar.setAttribute('role', 'group')
  takes.set(t.tkey, t)
  return t
}



// The takes of a set the glyph speaks for, each asked of the server once it is
// due. A set still being written is not asked about: its text is not final.
function glyphTakes(set) {
  const out = []
  for (const mode of setModes(set)) {
    let t = findTake(set, mode)
    if (!t && set.anchor !== null) t = newTake(set, mode)
    if (!t) continue
    if (t.text === set.text && lookupDue(t, LOOKUP_FRESH_MS)) queueLookup(t)
    out.push(t)
  }
  return out
}

function lookupDue(t, freshMs) {
  if (t.browser || authExpired() || t.looking || t.regenerating || !(t.phase === 'none' || t.phase === 'ready')) return false
  if (t.started && t.audio && !t.audio.ended) return false
  return Date.now() - t.checkedAt > freshMs
}



// Out of the draw: the request goes after it.
function queueLookup(t) {
  t.looking = true
  setTimeout(() => lookupTake(t), 0)
}



// **The server is the truth about what exists.** `POST /x/read-aloud/speech/lookup`
// takes the body a POST would and starts nothing; it answers ready with the
// file, preparing, or none. A Ready the server has forgotten — swept after its
// TTL, or lost to a restart — goes back to none here, before a tap could find
// it gone. An older server without the route says nothing, and the glyph says
// nothing either.
async function lookupTake(t) {
  if (authExpired()) { t.looking = false; return }
  const revision = t.revision ?? 0
  t.looking = true
  let res
  let body = null
  try {
    res = await fetch(`${SERVER}speech/lookup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(speechBody(t)) })
    body = await res.json().catch(() => null)
  } catch {
    t.looking = false
    return
  }
  t.looking = false
  if (!takeAlive(t) || t.regenerating || revision !== (t.revision ?? 0)) return
  t.checkedAt = Date.now()
  if (res.status !== 200 || !body || typeof body !== 'object') return
  if (typeof body.id === 'string') t.id = body.id
  if (body.status === 'ready') {
    if (t.phase === 'none' || t.phase === 'ready') settleReady(t, body, { fresh: false })
  } else if (body.status === 'preparing') {
    if (body.previous) { settleReady(t, body.previous, { fresh: false }); return }
    if (t.phase === 'none' || (t.phase === 'ready' && !t.started)) {
      Object.assign(t, { phase: 'making', url: null, duration: null })
      takeProgress(t, body)
      t.timer = setTimeout(() => pollSpeech(t), SPEECH_POLL_MS)
    }
  } else if (body.status === 'none') {
    if (t.phase === 'ready' && !(t.started && t.audio && !t.audio.ended)) forgetTake(t)
  }
  host.schedule()
}

function speechBody(t) {
  return { ...(t.provider ? { provider: t.provider } : {}), chat_id: t.chatId, agent: t.agent, mode: t.mode, title: t.title, text: t.text, ...t.request,
    ...(t.mode === 'verbatim' ? { describe_tables_and_diagrams: t.describeTablesAndDiagrams } : {}) }
}



// Files shares the take lifecycle, player, encoder and cache with chat speech.
// Its request identity also names the listening stop and this device's voice.
function documentTake({ text, title, file = null, minutes = 'full', mode = 'verbatim', sample = false }) {
  const voice = host.store.readAloud.voice
  const reference = sample ? 'voice-sample' : `${file.root}/${file.path}`
  const id = `document:${JSON.stringify([reference, minutes, voice])}`
  const key = takeKeyOf(id, mode, text)
  let t = takes.get(key)
  if (!t) {
    t = newTake({ text }, mode, { id, agent: 'files', name: sample ? voice : 'Files', title })
    t.file = file
    t.sample = sample
    t.request = { source: 'document', minutes, voice, style: DOCUMENT_STYLE }
  }
  return t
}

function fileSpeech(file = host.files.st.file) {
  const f = file
  if (!host.state.speechOn || !f || f.loading || f.error || f.view !== 'markdown' || f.mode !== 'preview') return null
  const words = documentWords(f.text, host.store.readAloud)
  if (!words) return null
  let latest = null
  for (const t of takes.values()) {
    if (t.open && t.file?.root === f.root && t.file?.path === f.path && (!latest || t.serial > latest.serial)) latest = t
  }
  let player = null
  if (latest) {
    rowsPlaced.add(latest)
    player = h('div', { class: 'fs-player', key: `fp:${latest.serial}` }, kept(drawTake(latest)))
  }
  return {
    glyph: h('button', { class: 'iconbtn fs-speak', type: 'button', title: 'Read aloud', 'aria-label': 'Read aloud', 'aria-haspopup': 'dialog', onclick: (event) => {
      const stops = documentStops(words).filter(s => host.state.provider !== 'browser' || s.mode === 'verbatim')
      const brief = stops.findIndex((s) => s.minutes === 3)
      host.openSheet({ kind: 'file-speech', file: { root: f.root, path: f.path }, title: fileNameOf(f.path), text: f.text, words, stops, at: brief < 0 ? stops.length - 1 : brief, returnFocus: event.currentTarget })
      const sheet = host.state.sheet
      sheet.dismiss = () => {
        if (sheet.closing) return
        sheet.closing = true; host.schedule()
        setTimeout(() => { if (host.state.sheet !== sheet) return; host.state.sheet = null; host.schedule(); sheet.returnFocus?.focus?.({ preventScroll: true }) }, globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 220)
      }
      lookupDocumentStop(sheet)
    } }, icon.speaker(18)),
    player,
  }
}

function takeForSheet(sheet) {
  return documentTake({ ...sheet, ...sheet.stops[sheet.at] })
}

function lookupDocumentStop(sheet) {
  const t = takeForSheet(sheet)
  if (lookupDue(t, 0)) queueLookup(t)
}

function fileSpeechSheet(sheet) {
  // Programmatic opening focus and pointer gestures stay quiet. Blur arms
  // the next Tab arrival; a key on the focused range reveals its halo too.
  const muteFocus = (event, muted) => {
    sheet.focusMuted = muted
    event.currentTarget.toggleAttribute('data-focus-muted', muted)
  }
  const stop = sheet.stops[sheet.at]
  const t = takeForSheet(sheet)
  const phase = takeState(t)
  const ready = ['ready', 'playing', 'paused', 'ended'].includes(phase)
  const kind = (s) => s.mode === 'brief' ? 'Document summary' : 'Word for word'
  const choice = (s, previous = false) => h('div', { class: `file-speech-value${previous ? ' previous' : ''}`, key: `${previous ? 'previous' : 'choice'}:${s.minutes}`, 'aria-hidden': previous ? 'true' : null },
    h('div', { class: 'display', text: s.label }), h('div', { class: 'file-speech-kind', text: kind(s) }))
  const action = phase === 'making' ? 'making' : ready ? 'ready' : 'prepare'
  return h('div', { class: `sheet file-speech${sheet.closing ? ' leaving' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'file-speech-title', 'aria-describedby': 'file-speech-name', onkeydown: trapFileSpeech },
    h('div', { class: 'sheet-top' }, h('div', { class: 'grip', 'aria-hidden': 'true' })),
    h('button', { class: 'iconbtn ghost file-speech-close', type: 'button', 'aria-label': 'Close', 'data-tooltip': 'Close', onclick: host.closeSheet }, icon.close(14)),
    h('div', { class: 'sheet-head' }, h('div', { class: 'display sheet-title', id: 'file-speech-title', text: 'Read aloud' }), h('div', { class: 'note', id: 'file-speech-name', text: sheet.title })),
    h('div', { class: 'file-speech-choice', 'aria-live': 'polite', 'aria-atomic': 'true' },
      sheet.previousAt !== undefined ? choice(sheet.stops[sheet.previousAt], true) : null,
      choice(stop)),
    t.browser ? null : h('div', { class: `file-speech-range${sheet.stops.length > 7 ? ' dense' : ''}`, style: { '--at': String(sheet.stops.length > 1 ? sheet.at / (sheet.stops.length - 1) : 1) } },
      h('div', { class: 'file-speech-rail', 'aria-hidden': 'true' }, h('div', { class: 'file-speech-fill' })),
      h('input', { class: 'file-speech-slider', id: 'listening-minutes', type: 'range', min: '0', max: String(sheet.stops.length - 1), step: '1', value: String(sheet.at),
      'aria-label': 'Listening minutes', 'aria-valuetext': `${stop.label} · ${kind(stop)}`, 'aria-disabled': sheet.stops.length === 1 ? 'true' : null,
      'data-focus-muted': sheet.focusMuted !== false,
      onkeydown: (e) => muteFocus(e, false),
      onpointerdown: (e) => muteFocus(e, true),
      onblur: (e) => muteFocus(e, false),
      oninput: (e) => {
        const at = Math.max(0, Math.min(sheet.stops.length - 1, Number(e.currentTarget.value)))
        if (sheet.at === at) return
        sheet.previousAt = sheet.at
        sheet.at = at
        lookupDocumentStop(sheet)
        host.schedule()
      },
      }),
      h('span', { class: 'file-speech-thumb', 'aria-hidden': 'true' }),
      h('div', { class: 'file-speech-stops', 'aria-hidden': 'true' }, ...sheet.stops.map((s, i) => h('span', { class: i === sheet.at ? 'on' : '', style: { left: `${sheet.stops.length > 1 ? i / (sheet.stops.length - 1) * 100 : 100}%` }, text: s.short }))),
    ),
    t.browser ? host.guide.link() : null,
    phase === 'failed' ? h('div', { class: 'note warn', role: 'alert', text: t.error }) : null,
    h('button', { class: 'primary file-speech-action', type: 'button', 'data-phase': action, 'aria-disabled': phase === 'making' ? 'true' : null,
      'aria-label': phase === 'making' ? 'Preparing audio' : ready ? (phase === 'playing' ? 'Pause' : 'Play') : phase === 'failed' ? 'Try again' : 'Prepare',
      onclick: () => {
        if (phase === 'making') return
        openRow(t)
        if (ready) { togglePlay(t); host.closeSheet() }
        else requestSpeech(t)
      } },
      h('span', { class: 'speech-action-state prepare', 'aria-hidden': 'true' }, icon.speaker(18), h('span', { text: phase === 'failed' ? 'Try again' : 'Prepare' })),
      h('span', { class: 'speech-action-state making', 'aria-hidden': 'true' }, wave(), h('span', { text: 'Preparing' })),
      h('span', { class: 'speech-action-state ready', 'aria-hidden': 'true' }, phase === 'playing' ? icon.pause(18) : icon.play(18), h('span', { text: phase === 'playing' ? 'Pause' : 'Play' }))),
    ready && !t.browser ? h('button', { class: 'speech-regenerate file-speech-regenerate', type: 'button',
      'aria-label': `Regenerate ${stop.label} audio`, 'aria-disabled': String(Boolean(t.regenerating)),
      onclick: () => regenerateSpeech(t) }, h('span', { text: t.regenerating ? 'Regenerating…' : 'Regenerate' })) : null,
    t.regenerating || t.regenerationMessage ? h('div', { class: 'speech-regeneration-note', role: 'status', text: regenerationLine(t) }) : null,
    h('span', { class: 'sr-only', role: 'status', text: phase === 'making' ? 'Preparing audio' : ready ? 'Audio ready' : '' }),
  )
}

function focusFileSpeech() {
  const sheet = host.state.sheet
  if (sheet?.kind !== 'file-speech' || sheet.focused) return
  const slider = host.root.querySelector?.('.file-speech-slider') ?? host.root.querySelector?.('.file-speech-action')
  if (!slider) return
  sheet.focused = true
  slider.focus({ preventScroll: true })
}

function trapFileSpeech(event) {
  if (event.key !== 'Tab') return
  const controls = [...(event.currentTarget.querySelectorAll?.('button, input') ?? [])]
  const first = controls[0]
  const last = controls.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}



// A take the server no longer has: none again, its row closed.
function forgetTake(t) {
  clearTimeout(t.timer)
  dropAudio(t)
  if (current === t) {
    current = null
    clearMediaSession()
  }
  Object.assign(t, { phase: 'none', url: null, duration: null, brief: null, started: false, open: false })
}



// The glyph's mark for a set: `making` while any of its takes is being made,
// `ready` when one exists, nothing when none does.
function setMark(list) {
  if (list.some((t) => t.phase === 'making')) return 'making'
  if (list.some((t) => t.phase === 'ready')) return 'ready'
  return null
}

const MARK_WORDS = { ready: 'Read aloud, ready to play', making: 'Read aloud, being made' }



// The one glyph a set has earned at this device's thresholds, or nothing.
function speechGlyph(set) {
  if (!host.state.speechOn || !set.context) return null
  if (!setModes(set).length) return null
  const key = setKey(set)
  const list = glyphTakes(set)
  const mark = setMark(list)
  const on = list.some((t) => t.open && (takeState(t) === 'playing' || takeState(t) === 'paused'))
  const open = host.state.speakMenu?.key === key
  return h(
    'button',
    {
      class: `speakbtn${on ? ' on' : ''}${open ? ' open' : ''}${mark ? ` ${mark}` : ''}`,
      key: 'speak',
      type: 'button',
      title: mark ? MARK_WORDS[mark] : 'Read aloud',
      'aria-label': mark ? MARK_WORDS[mark] : 'Read aloud',
      'aria-pressed': String(on),
      'aria-haspopup': 'menu',
      'aria-expanded': String(open),
      'data-take': mark ?? 'none',
      onclick: (e) => {
        if (open) host.state.speakMenu = null
        else {
          host.state.speakMenu = { key }
          // The menu is the moment before a tap: what it says is asked afresh.
          for (const t of list) if (t.text === set.text && lookupDue(t, 0)) queueLookup(t)
        }
        host.schedule()
      },
    },
    icon.speaker(15),
  )
}

const MENU_VALUES = { playing: 'Playing', paused: 'Paused', making: 'Making', failed: 'Retry' }



// What a row of the menu says for its mode: its word, the line for the take's
// state, and — where it has one — where the take is.
function speechRow(set, mode) {
  const t = findTake(set, mode)
  const st = takeState(t)
  const exists = st === 'ready' || st === 'playing' || st === 'paused' || st === 'ended'
  return {
    key: mode,
    title: speechWord(mode),
    sub: takeLine({ mode, words: set.words, phase: exists ? 'ready' : st, duration: t ? speechDuration(t) : null }),
    glyph: mode === 'brief' ? icon.brief(16) : icon.speaker(16),
    value: MENU_VALUES[st] ?? null,
    on: st === 'playing' || st === 'paused',
    role: 'menuitem',
    run: () => {
      host.state.speakMenu = null
      host.schedule()
      speak(set, mode)
    },
  }
}



// The menu: the composer's popover card and rows, anchored to the glyph, over
// a clear scrim that a tap outside lands on.
function speechMenu(set) {
  const rows = setModes(set).map((mode) => {
    const t = findTake(set, mode)
    const ready = t?.phase === 'ready'
    const row = speechRow(set, mode)
    if (ready) {
      row.glyph = icon.play(16)
      row.sub = row.sub.replace(/^Ready/, 'Ready to play')
    }
    const main = host.menuRow(row)
    main.setAttribute('aria-label', `${ready ? 'Play or pause' : 'Prepare'} ${speechWord(mode)} audio. ${row.sub}`)
    return h('div', { class: `speech-choice${ready ? ' available' : ''}`, key: mode, role: 'presentation' },
      h('div', { class: 'speech-choice-actions', role: 'presentation' }, main,
        ready && !t.browser ? h('button', { class: 'speech-regenerate', type: 'button', role: 'menuitem',
          'aria-label': `Regenerate ${speechWord(mode)} audio`, 'aria-disabled': String(Boolean(t.regenerating)),
          onclick: () => regenerateSpeech(t) }, h('span', { text: t.regenerating ? 'Regenerating…' : 'Regenerate' })) : null),
      t?.regenerating || t?.regenerationMessage ? h('div', { class: 'speech-regeneration-note', role: 'status', text: regenerationLine(t) }) : null)
  })
  return [
    h('button', {
      class: 'popscrim',
      key: 'speakscrim',
      type: 'button',
      tabindex: '-1',
      'aria-hidden': 'true',
      onclick: () => {
        host.state.speakMenu = null
        host.schedule()
      },
    }),
    menuSurface(h(
      'div',
      { class: 'popover speakmenu', key: 'speakmenu', role: 'menu', 'aria-label': 'Read aloud' },
      ...rows, host.state.provider === 'browser' ? host.guide.link() : null,
    ), { title: 'Read aloud', close: () => { host.state.speakMenu = null; host.schedule() } }),
  ]
}



// The turn line with the glyph at its right end, and under it a row for each
// take of the set this device has open — Listen, then Brief. `turn` is the line
// itself, or `null` for a set still being written, or a turn whose line says
// nothing. Threads can supply a trailing timestamp after the speech controls.
function turnRow(turn, set, trailing = null) {
  const glyph = speechGlyph(set)
  const key = setKey(set)
  // A row stays under its set even if its glyph has since been hidden — the
  // threshold raised in Settings mid-play — rather than playing from nowhere.
  const mine = set.context ? SPEECH_MODES.map((mode) => findTake(set, mode)).filter((t) => t?.open) : []
  if (!glyph && mine.length === 0 && !trailing) return turn ? [turn] : []
  const menu = glyph && host.state.speakMenu?.key === key ? speechMenu(set) : []
  const out = [h('div', { class: 'turnrow', key: `tr:${key}` }, turn, h('span', { class: 'turnrow-gap' }), h('span', { class: 'speakglyphs' }, glyph, ...menu), trailing)]
  // Keyed by the take: a row closed and another opened on the same set between
  // two draws would otherwise be matched to the old row and patched into it.
  for (const t of mine) {
    rowsPlaced.add(t)
    out.push(h('div', { class: 'line playerline', key: `pl:${t.serial}` }, kept(drawTake(t))))
  }
  return out
}



// A row of the menu chosen. A take that exists plays — **at once, inside the
// tap**, which is the one immediate play — or pauses if it is playing. A take
// being made opens its row and does nothing else. Anything else is made, and
// stops at ready. Nothing here touches another take but to pause the one
// playing when this one starts. Nothing here sends a message or wakes a chat.
function speak(set, mode) {
  if (!set.context) return
  let t = findTake(set, mode)
  const st = takeState(t)
  if (st === 'playing' || st === 'paused' || st === 'ended') return togglePlay(t)
  if (t && t.text !== set.text) t = null
  if (st === 'ready' && t) return startPlay(t)
  if (st === 'making' && t) {
    openRow(t)
    return
  }
  t ??= newTake(set, mode)
  const record = set.context
  if (typeof record?.title === 'string') t.title = record.title
  t.reposts = 0
  openRow(t)
  requestSpeech(t, { play: true })
}

function openRow(t) {
  t.dismissed = false
  if (!t.open) {
    t.open = true
    t.inView = true
    watchRow(t)
  }
  host.schedule()
}



// Pauses whatever is playing: dictation starting is the one caller. A voice
// in the room is a voice in the microphone, and a person dictating is not
// listening.
function pauseSpeech() {
  for (const t of takes.values()) if (isPlaying(t)) t.audio.pause()
}



// ------------------------------------------------------------ the docked bar

// The rows' places on the screen, from the browser. One observer for the page,
// watching every open row; a browser without one keeps a row as the surface
// wherever it is, and the bar for a chat that was left.
function watchRow(t) {
  const IO = globalThis.IntersectionObserver
  if (typeof IO !== 'function') return
  if (!rowWatch) {
    rowWatch = new IO(
      (entries) => {
        for (const entry of entries) {
          for (const t of takes.values()) {
            if (entry.target !== t.el || t.inView === entry.isIntersecting) continue
            t.inView = entry.isIntersecting
            host.schedule()
          }
        }
      },
      { rootMargin: `0px 0px -${ROW_HIDDEN_BELOW_PX}px 0px`, threshold: 0 },
    )
  }
  rowWatch.observe(t.el)
}



// Which take the bar is for, whether or not its row is on the screen: a take
// playing or paused owns it; else the most recent take made here, ready and not
// yet heard; else the most recent one being made; else the one that ended.
function barTake() {
  const live = current && takeAlive(current) && current.open ? current : null
  const st = takeState(live)
  if (st === 'playing' || st === 'paused') return live
  let offer = null
  let making = null
  for (const t of takes.values()) {
    if (!t.open || t.dismissed) continue
    if (t.phase === 'ready' && !t.started && (!offer || t.readyAt > offer.readyAt)) offer = t
    if (t.phase === 'making' && (!making || t.serial > making.serial)) making = t
  }
  return offer ?? making ?? (st === 'ended' ? live : null)
}



// The bar, where a screen puts it: under its header — while its take's row is
// not on the screen. Keyed by the take, as the row is, for the same reason.
function playerBar() {
  const t = barTake()
  if (!t || (rowsPlaced.has(t) && t.inView)) return null
  if (t.sample && host.state.sheet?.kind === 'settings' && host.state.sheet.page === 'plugins' && host.pluginSettingsUI?.st.selected?.id === 'read-aloud' && t.request.voice === host.store.readAloud.voice) return null
  drawBar(t)
  return h('div', { class: 'playerbar-slot', key: `pb:${t.serial}` }, kept(t.bar))
}



// Back to the row: the chat opened if it is not, and the row scrolled into view
// once it is drawn — at which point the bar goes, because the row is the
// surface again. The audio is the same one throughout; nothing restarts.
function returnToTake(t) {
  const beside = host.panels?.visible?.() ? host.panels.st.side : null
  if (t.document) {
    if (t.file && !(beside?.kind === 'file' && beside.root === t.file.root && beside.path === t.file.path)) host.goFiles(t.file.root, t.file.path, { isFile: true })
    return
  }
  if (t.threadId) { t.reveal = true; if (!(beside?.kind === 'thread' && beside.id === t.threadId)) host.threads.open(t.threadId); else host.schedule() }
}



// After a draw: a row asked for is scrolled to, once the chat has landed —
// before that, the landing would move the reader somewhere else. A chat whose
// window did not reach the set has no row to go to, and the bar stays.
function revealPlayer() {
  for (const t of takes.values()) if (t.reveal && [host.activeThread()?.thread.id, host.panels?.sideHost.activeThread()?.thread.id].includes(t.threadId) && t.el?.isConnected) {
    t.reveal = false; t.el.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }
}



// The bar's insides. A take that has been played: ▶/⏸, one line of words, the
// rate, ✕, and a hairline of progress along its foot that seeks where it is
// tapped. A take ready and not yet heard: ▶, "Ready · Listen · Ada · ‹title›"
// and ✕. One being made: a turning mark, "Making · Brief · Ada · ‹title›" and
// ✕. ✕ on those two lets the bar go and leaves the take on its row.
function drawBar(t) {
  const bar = t.bar
  const st = takeState(t)
  const kind = st === 'ready' ? 'ready' : st === 'making' ? 'making' : 'player'
  const audio = t.audio
  const playing = st === 'playing'
  const words = h(
    'button',
    { class: 'playerbar-text', key: 'text', type: 'button', title: 'Go to the reply', onclick: () => returnToTake(t) },
    h('span', { class: 'playerbar-who', text: barWho({ kind, mode: t.mode, agentName: t.agentName }) }),
    t.title ? h('span', { class: 'playerbar-sep', text: '·' }) : null,
    t.title ? h('span', { class: 'playerbar-title', text: t.title }) : null,
  )
  bar.className = `playerbar${kind === 'player' ? '' : ` ${kind}`}${playing ? ' playing' : ''}`
  bar.setAttribute('aria-label', `${barWho({ kind, mode: t.mode, agentName: t.agentName })}${t.title ? ` — ${t.title}` : ''}`)
  if (kind !== 'player') {
    const dismiss = () => {
      t.dismissed = true
      host.schedule()
    }
    morph(bar, [
      kind === 'ready'
        ? h('button', { class: 'playerbar-play', key: 'play', type: 'button', title: 'Play', 'aria-label': 'Play', onclick: () => startPlay(t) }, icon.play(14))
        : h('span', { class: 'playerbar-spin', key: 'spin', role: 'status', 'aria-label': 'Being made' }),
      words,
      h('button', { class: 'player-close playerbar-close', key: 'close', type: 'button', title: 'Hide', 'aria-label': 'Hide', onclick: dismiss }, icon.close(11)),
    ])
    return bar
  }
  const total = speechDuration(t)
  const now = audio?.currentTime ?? 0
  const ended = st === 'ended'
  const at = typeof total === 'number' && total > 0 ? Math.min(1, ended ? 1 : now / total) : 0
  morph(bar, [
    h(
      'button',
      {
        class: 'playerbar-play',
        key: 'play',
        type: 'button',
        title: playing ? 'Pause' : 'Play',
        'aria-label': playing ? 'Pause' : 'Play',
        onclick: () => togglePlay(t),
      },
      playing ? icon.pause(14) : icon.play(14),
    ),
    words,
    h('button', {
      class: 'player-rate playerbar-rate',
      key: 'rate',
      type: 'button',
      title: 'Playback speed',
      'aria-label': `Playback speed ${rateLabel(host.state.speech.rate)}`,
      text: rateLabel(host.state.speech.rate),
      onclick: cycleRate,
    }),
    h(
      'button',
      { class: 'player-close playerbar-close', key: 'close', type: 'button', title: 'Stop and close', 'aria-label': 'Stop and close', onclick: () => closeTake(t) },
      icon.close(11),
    ),
    t.browser ? null : h(
      'div',
      {
        class: 'playerbar-track',
        key: 'track',
        role: 'slider',
        'aria-label': 'Position',
        'aria-valuemin': '0',
        'aria-valuemax': String(Math.round(total ?? 0)),
        'aria-valuenow': String(Math.round(ended ? total ?? 0 : now)),
        'aria-valuetext': `${speechClock(ended ? total : now)} of ${speechClock(total)}`,
        style: { '--at': String(at) },
        onpointerdown: (e) => seekFromPointer(t, e),
      },
      h('div', { class: 'playerbar-fill' }),
    ),
  ])
  return bar
}



// Made: the take goes to making and is asked of the server. `play` is a tap's:
// a server that had it ready answers at once, and that tap is played — unless
// a dictation is recording, under which nothing starts. A take that is made
// after a wait is never played by this.
async function requestSpeech(t, { play = false } = {}) {
  if (t.browser) { t.phase = 'ready'; return startPlay(t) }
  t.revision = (t.revision ?? 0) + 1
  clearTimeout(t.timer)
  dropAudio(t)
  if (current === t) current = null
  Object.assign(t, { phase: 'making', stage: null, progress: null, error: '', url: null, duration: null, started: false })
  host.schedule()
  let res
  let body = null
  try {
    res = await fetch(`${SERVER}speech`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(speechBody(t)) })
    body = await res.json().catch(() => null)
  } catch {
    if (takeAlive(t)) failSpeech(t, 'The request for speech did not reach this app’s server.')
    return
  }
  if (takeAlive(t)) takeSpeech(t, res.status, body, { play: play && res.status === 200 })
}

function regenerationLine(t) {
  return t.regenerating ? 'Making new audio · current audio stays available' : t.regenerationMessage
}

// Keep the usable take and its Audio intact while a separate job is prepared.
// A successful replacement gets a new URL; an already started player keeps
// its position until closed. Nothing in this path calls play().
async function regenerateSpeech(t) {
  if (!takeAlive(t) || t.phase !== 'ready' || t.regenerating) return
  t.revision = (t.revision ?? 0) + 1
  t.regenerating = true
  t.regenerationMessage = ''
  host.schedule()
  const fail = (message) => {
    t.regenerating = false
    t.regenerationMessage = `Could not regenerate. ${message} Current audio is still available.`
    host.schedule()
  }
  const accept = (status, body) => {
    if (!takeAlive(t)) return
    if (status >= 200 && status < 300 && body?.status === 'ready') {
      t.regenerating = false
      t.regenerationMessage = t.audio && t.started ? 'New audio ready · close this player to use it' : 'New audio ready to play'
      settleReady(t, body, { fresh: false, preserveAudio: Boolean(t.audio && t.started) })
    } else if (status >= 200 && status < 300 && body?.status === 'preparing' && body.id) {
      t.timer = setTimeout(() => poll(body.id), SPEECH_POLL_MS)
    } else fail(body?.error || `The server answered ${status}.`)
  }
  const poll = async (id) => {
    if (!takeAlive(t) || !t.regenerating) return
    try {
      const res = await fetch(`${SERVER}speech/${encodeURIComponent(id)}`)
      accept(res.status, await res.json().catch(() => null))
    } catch {
      if (takeAlive(t)) t.timer = setTimeout(() => poll(id), SPEECH_POLL_MS)
    }
  }
  try {
    const res = await fetch(`${SERVER}speech`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...speechBody(t), force: true }) })
    accept(res.status, await res.json().catch(() => null))
  } catch { if (takeAlive(t)) fail('The request did not reach the server.') }
}

async function pollSpeech(t) {
  if (!takeAlive(t) || !t.id || t.phase !== 'making') return
  let res
  let body = null
  try {
    res = await fetch(`${SERVER}speech/${encodeURIComponent(t.id)}`)
    body = await res.json().catch(() => null)
  } catch {
    // A poll that did not arrive is asked again; the file is still being made.
    if (takeAlive(t)) t.timer = setTimeout(() => pollSpeech(t), SPEECH_POLL_MS)
    return
  }
  if (takeAlive(t) && t.phase === 'making') takeSpeech(t, res.status, body)
}

function takeProgress(t, body) {
  t.stage = typeof body.stage === 'string' ? body.stage : null
  t.progress = typeof body.progress === 'number' && Number.isFinite(body.progress) ? Math.min(1, Math.max(0, body.progress)) : null
}



// One answer from the server, posted or polled: the object, a refusal, or a
// file that is gone.
function takeSpeech(t, status, body, { play = false } = {}) {
  if ((status === 200 || status === 202) && body && typeof body === 'object') {
    if (typeof body.id === 'string') t.id = body.id
    if (body.status === 'ready') {
      settleReady(t, body, { fresh: true })
      if (play && !(host.recordingAny?.() ?? host.state.rec?.phase === 'recording')) startPlay(t)
      return
    }
    if (body.status === 'failed') return failSpeech(t, body.error || 'The speech could not be made.')
    if (body.status === 'preparing') {
      takeProgress(t, body)
      drawTake(t)
      if (t.bar.isConnected) drawBar(t)
      t.timer = setTimeout(() => pollSpeech(t), SPEECH_POLL_MS)
      return
    }
  }
  if (status === 404) return repostSpeech(t)
  if (status === 503) return failSpeech(t, unavailableSentence(body?.reason))
  failSpeech(t, body?.error || `The speech could not be made (${status}).`)
}

function unavailableSentence(reason) {
  if (reason === 'no key') return 'Speech is not set up on this server: it has no key for the voice service.'
  if (reason === 'no encoder') return 'Speech is not set up on this server: it has no audio encoder.'
  if (reason === 'no storage') return 'Speech is not set up on this server: it has nowhere to keep the audio.'
  return 'Speech is unavailable on this server right now.'
}



// A file the server no longer has — it expired — is made again without the
// person being asked. Twice, and then it is said. Made again, it stops at
// ready like any other.
function repostSpeech(t) {
  if (t.reposts >= SPEECH_REPOSTS) return failSpeech(t, 'The audio was gone from the server, and making it again did not hold.')
  t.reposts += 1
  requestSpeech(t)
}

function retrySpeech(t) {
  t.reposts = 0
  requestSpeech(t)
}

function failSpeech(t, sentence) {
  clearTimeout(t.timer)
  dropAudio(t)
  if (current === t) current = null
  t.phase = 'failed'
  t.error = sentence
  host.schedule()
}



// Ready: the file's facts, and no sound. `fresh` is a take that has just
// become ready — made here, or found finished by a poll — which is what the bar
// offers; a take a lookup found was ready already and is offered nowhere.
function settleReady(t, body, { fresh, preserveAudio = false }) {
  clearTimeout(t.timer)
  if (t.url !== body.url && !preserveAudio) dropAudio(t)
  Object.assign(t, {
    id: body.id,
    phase: 'ready',
    url: body.url,
    duration: typeof body.duration_s === 'number' && Number.isFinite(body.duration_s) ? body.duration_s : null,
    brief: typeof body.brief_text === 'string' && body.brief_text.trim() !== '' ? body.brief_text : null,
  })
  if (fresh) {
    t.readyAt = Date.now()
    t.started = false
    t.dismissed = false
  }
  t.checkedAt = Date.now()
  host.schedule()
}



// The take's own audio, made at its first play. Several takes may each hold
// one; only one plays, because `startPlay()` pauses the rest.
function ensureAudio(t) {
  if (t.audio) return t.audio
  const Audio = globalThis.Audio
  if (!t.browser && typeof Audio !== 'function') {
    failSpeech(t, 'This browser cannot play audio.')
    return null
  }
  const audio = t.browser ? new BrowserAudio(t) : new Audio()
  t.audio = audio
  audio.preload = 'auto'
  const redraw = () => {
    if (t.audio === audio) drawTake(t)
  }
  for (const type of ['play', 'playing', 'pause', 'ended', 'timeupdate', 'progress', 'durationchange', 'loadedmetadata', 'ratechange']) {
    audio.addEventListener(type, redraw)
  }
  audio.addEventListener('play', () => playbackState('playing'))
  audio.addEventListener('pause', () => playbackState('paused'))
  // The glyph, the menu and the bar change with these, and they are drawn
  // with the page rather than with the row.
  for (const type of ['play', 'pause', 'ended']) {
    audio.addEventListener(type, () => {
      if (t.audio === audio) host.schedule()
    })
  }
  audio.addEventListener('error', () => {
    if (t.audio === audio) { if (t.browser) failSpeech(t, 'This browser could not speak the text. Check its voice settings and try again.'); else audioFailed(t) }
  })
  audio.src = t.url
  applyRate(audio)
  return audio
}



// The rate is set again after the source: a browser may reset `playbackRate`
// on a load, and `defaultPlaybackRate` is the one it resets it to. The pitch is
// kept, said explicitly — a voice at 2× is a voice speaking fast, not a higher
// one.
function applyRate(audio) {
  const rate = host.state.speech.rate
  audio.preservesPitch = true
  audio.mozPreservesPitch = true
  audio.webkitPreservesPitch = true
  audio.defaultPlaybackRate = rate
  audio.playbackRate = rate
}



// The audio would not load. A `404` is the file expired between being made and
// being played, and is made again — to ready, not to playing; anything else is
// said.
async function audioFailed(t) {
  const url = t.url
  let status = 0
  try {
    status = (await fetch(url, { headers: { range: 'bytes=0-0' } })).status
  } catch {
    status = 0
  }
  if (!takeAlive(t) || t.url !== url) return
  if (status === 404) repostSpeech(t)
  else failSpeech(t, 'The audio would not play in this browser.')
}



// **The one place a take starts to play**, and every caller is a tap (or the
// lock screen's, or a tap's answer the server had ready). Whatever else is
// playing pauses and keeps its place. iOS refuses a `play()` that is not inside
// the tap that asked for it; a refusal is not a fault: the row shows ▶ and the
// next tap is inside a tap.
function startPlay(t) {
  if ((host.recordingAny?.() ?? host.state.rec?.phase === 'recording') || !takeAlive(t) || t.phase !== 'ready' || (!t.url && !t.browser)) return
  host.audioSessionType('playback')
  const audio = ensureAudio(t)
  if (!audio) return
  for (const other of takes.values()) if (other !== t && isPlaying(other)) other.audio.pause()
  t.started = true
  t.dismissed = true
  openRow(t)
  if (current !== t) {
    current = t
    mediaSession(t)
  }
  if (audio.ended) audio.currentTime = 0
  try {
    const out = audio.play()
    if (out && typeof out.catch === 'function') out.catch(() => drawTake(t))
  } catch {
    // The same refusal, from a browser that throws rather than rejects.
  }
  drawTake(t)
  host.schedule()
}

function togglePlay(t) {
  if (!t) return
  if (isPlaying(t)) t.audio.pause()
  else startPlay(t)
  drawTake(t)
}

function speechDuration(t) {
  const d = t.audio?.duration
  return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : t.duration
}

function seekTo(t, seconds) {
  const audio = t?.audio
  if (!audio || t.browser) return
  const total = speechDuration(t)
  const at = Math.max(0, typeof total === 'number' ? Math.min(total, seconds) : seconds)
  audio.currentTime = at
  drawTake(t)
}

function cycleRate() {
  const rate = nextRate(host.state.speech.rate)
  host.store.speech = { ...host.state.speech, rate }
  host.state.speech = host.store.speech
  for (const t of takes.values()) {
    if (t.audio) applyRate(t.audio)
    if (t.open) drawTake(t)
  }
}

function dropAudio(t) {
  const audio = t.audio
  if (!audio) return
  t.audio = null
  try {
    audio.pause()
    audio.release?.()
    audio.removeAttribute?.('src')
    audio.load?.()
  } catch {
    // An element that will not be stopped is one nothing refers to any more.
  }
}



// ✕ on a row, or on the bar of a take that has been played: the audio stopped
// and the row closed. The take itself is the server's and stays — ready on the
// glyph, at once on the next tap.
function closeTake(t) {
  if (!t) return
  t.open = false
  t.started = false
  rowWatch?.unobserve?.(t.el)
  dropAudio(t)
  if (current === t) {
    current = null
    clearMediaSession()
  }
  host.schedule()
}



// The lock screen and the headphones: play, pause and seek, with the chat's
// title, the kicker, and the mark. A browser without the API is a browser with
// the row and nothing else, which is not a fault.
function mediaSession(t) {
  const session = globalThis.navigator?.mediaSession
  if (!session) return
  try {
    if (typeof globalThis.MediaMetadata === 'function') {
      session.metadata = new globalThis.MediaMetadata({
        title: t.title || 'Chat',
        artist: speechKicker(t),
        artwork: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      })
    }
  } catch {
    // No metadata is a lock screen with a plainer card.
  }
  const now = () => t.audio?.currentTime ?? 0
  const actions = {
    play: () => startPlay(t),
    pause: () => t.audio?.pause(),
    seekbackward: (d) => seekTo(t, now() - (d?.seekOffset ?? SEEK_STEP_S * 2)),
    seekforward: (d) => seekTo(t, now() + (d?.seekOffset ?? SEEK_STEP_S * 2)),
    seekto: (d) => seekTo(t, d?.seekTime ?? now()),
    stop: () => closeTake(t),
  }
  for (const name of SPEECH_ACTIONS) {
    try {
      session.setActionHandler?.(name, (details) => {
        if (t === current) actions[name](details)
      })
    } catch {
      // An action this browser does not know is one its lock screen lacks.
    }
  }
}

function playbackState(value) {
  try {
    const session = globalThis.navigator?.mediaSession
    if (session) session.playbackState = value
  } catch {
    // Read-only somewhere is nothing to draw.
  }
}

function clearMediaSession() {
  const session = globalThis.navigator?.mediaSession
  if (!session) return
  try {
    session.metadata = null
    session.playbackState = 'none'
  } catch {
    // As above.
  }
  for (const name of SPEECH_ACTIONS) {
    try {
      session.setActionHandler?.(name, null)
    } catch {
      // As above.
    }
  }
}



// Space plays and pauses, ←/→ move five seconds — with the row, or anything in
// it but a button, focused.
function playerKey(t, e) {
  if (!takeAlive(t) || t.phase !== 'ready') return
  const onButton = e.target && e.target !== t.el && e.target.tagName === 'BUTTON'
  if ((e.key === ' ' || e.key === 'Spacebar') && !onButton) {
    e.preventDefault?.()
    togglePlay(t)
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault?.()
    seekTo(t, (t.audio?.currentTime ?? 0) + (e.key === 'ArrowLeft' ? -SEEK_STEP_S : SEEK_STEP_S))
  }
}



// Where on the track a pointer is, as a time. Read off the track the event
// landed on, which is the one on the page: the row's nodes are kept across
// redraws, so it is the same node the person is touching.
function seekFromPointer(t, e) {
  const track = e.currentTarget ?? e.target
  const rect = track?.getBoundingClientRect?.()
  const total = speechDuration(t)
  if (!rect || !(rect.width > 0) || typeof total !== 'number') return
  const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  seekTo(t, fraction * total)
}



// The row's insides, drawn into its one kept node. Returns the node. A ready
// take nobody has played yet is ▶ and `0:00 / 2:09`, and silent.
function drawTake(t) {
  if (!t) return null
  const el = t.el
  const audio = t.audio
  const st = takeState(t)
  const playing = st === 'playing'
  const phase = t.phase === 'making' ? 'preparing' : t.phase
  el.className = `player ${phase}${playing ? ' playing' : ''}${t.mode === 'brief' ? ' brief' : ''}`
  el.setAttribute('aria-label', `${speechKicker(t)}${t.title ? ` — ${t.title}` : ''}`)
  const close = h(
    'button',
    { class: 'player-close', key: 'close', type: 'button', title: 'Close the player', 'aria-label': 'Close the player', onclick: () => closeTake(t) },
    icon.close(11),
  )
  const top = h('div', { class: 'player-top', key: 'top' }, h('span', { class: 'kicker player-kicker', text: speechKicker(t) }), close)
  let row
  if (t.phase === 'making') {
    // Nought is not yet a position: until the first part is voiced the track
    // keeps the calm band, and the fill appears once there is something in it.
    const known = t.progress !== null && t.progress > 0
    row = h(
      'div',
      { class: 'player-row', key: 'row' },
      h('span', { class: 'player-stage', role: 'status', text: SPEECH_STAGES[t.stage] ?? (t.mode === 'brief' ? 'Writing the brief…' : 'Voicing…') }),
      h(
        'div',
        { class: `player-track waiting${known ? '' : ' unknown'}`, key: 'track', style: { '--at': String(known ? t.progress : 0) } },
        h('div', { class: 'player-fill' }),
      ),
    )
  } else if (t.phase === 'failed') {
    row = h(
      'div',
      { class: 'player-row', key: 'row' },
      h('span', { class: 'player-error', role: 'status', text: t.error }),
      h('button', { class: 'player-retry', key: 'retry', type: 'button', text: 'Retry', onclick: () => retrySpeech(t) }),
    )
  } else {
    const total = speechDuration(t)
    const now = audio?.currentTime ?? 0
    const ended = st === 'ended'
    const at = typeof total === 'number' && total > 0 ? Math.min(1, ended ? 1 : now / total) : 0
    let buffered = 0
    try {
      const ranges = audio?.buffered
      if (ranges?.length && typeof total === 'number' && total > 0) buffered = Math.min(1, ranges.end(ranges.length - 1) / total)
    } catch {
      buffered = 0
    }
    row = h(
      'div',
      { class: 'player-row', key: 'row' },
      h(
        'button',
        {
          class: 'player-play',
          key: 'play',
          type: 'button',
          title: playing ? 'Pause' : 'Play',
          'aria-label': playing ? 'Pause' : 'Play',
          onclick: () => togglePlay(t),
        },
        playing ? icon.pause(16) : icon.play(16),
      ),
      t.browser ? h('span', { class: 'player-time', text: 'Browser voice' }) : h(
        'div',
        {
          class: 'player-track',
          key: 'track',
          role: 'slider',
          'aria-label': 'Position',
          'aria-valuemin': '0',
          'aria-valuemax': String(Math.round(total ?? 0)),
          'aria-valuenow': String(Math.round(ended ? total ?? 0 : now)),
          'aria-valuetext': `${speechClock(ended ? total : now)} of ${speechClock(total)}`,
          style: { '--at': String(at), '--buf': String(Math.max(at, buffered)) },
          onpointerdown: (e) => {
            t.dragging = true
            e.currentTarget?.setPointerCapture?.(e.pointerId)
            seekFromPointer(t, e)
          },
          onpointermove: (e) => {
            if (t.dragging) seekFromPointer(t, e)
          },
          onpointerup: () => {
            t.dragging = false
          },
          onpointercancel: () => {
            t.dragging = false
          },
        },
        h('div', { class: 'player-buffered' }),
        h('div', { class: 'player-fill' }),
        h('div', { class: 'player-knob' }),
      ),

      t.browser ? null : h('span', { class: 'player-time', text: `${speechClock(ended ? total : now)} / ${speechClock(total)}` }),
      h('button', {
        class: 'player-rate',
        key: 'rate',
        type: 'button',
        title: 'Playback speed',
        'aria-label': `Playback speed ${rateLabel(host.state.speech.rate)}`,
        text: rateLabel(host.state.speech.rate),
        onclick: cycleRate,
      }),
    )
  }
  const box = h('div', { class: 'player-box', key: 'box' }, top, row)
  const brief =
    t.phase === 'ready' && t.brief
      ? h(
          'div',
          { class: 'player-brief', key: 'brief' },
          h(
            'button',
            {
              class: `player-briefbtn${t.briefOpen ? ' open' : ''}`,
              type: 'button',
              'aria-expanded': String(t.briefOpen),
              onclick: () => {
                t.briefOpen = !t.briefOpen
                drawTake(t)
              },
            },
            h('span', { text: t.briefOpen ? 'Hide the brief' : 'Show the brief' }),
            icon.chevronDown(10),
          ),
          t.briefOpen ? h('div', { class: 'say agent md player-brieftext' }, ...markdown(t.brief)) : null,
        )
      : null
  const regeneration = t.regenerating || t.regenerationMessage
    ? h('div', { class: 'speech-regeneration-note', role: 'status', text: regenerationLine(t) }) : null
  morph(el, [box, regeneration, brief].filter(Boolean))
  // The bar may be this take: whatever moved the row moves it too, and the bar
  // coming or going is a draw of the page.
  if (t.bar.isConnected) drawBar(t)
  return el
}

function settingsReadAloud({ back = true } = {}) {
  const voice = host.store.readAloud.voice
  const t = documentTake({ sample: true, text: VOICE_SAMPLE, title: 'Voice sample' })
  const phase = takeState(t)
  let player = null
  if (t.open) {
    rowsPlaced.add(t)
    player = h('div', { class: 'read-aloud-sample' }, kept(drawTake(t)))
  }
  return [
    host.guide?.settings(host.state.provider),
    back ? host.settingsBack('Settings', 'root') : null,
    back ? host.settingsHead('Read aloud', 'The reading voice for this device.') : h('p', { class: 'note', text: 'Reading preferences for this device. Agent voices are in each agent’s profile.' }),
    host.state.provider === 'browser' ? h('p', { class: 'note', text: 'Listen reads with your browser’s voice. Tables and diagrams are skipped. A server key enables Brief.' }) : h('div', { class: 'rows' }, h('div', { class: 'setrow' },
      h('div', { class: 'setrow-who' }, h('div', { class: 'setrow-title', id: 'read-aloud-describe-label', text: 'Describe tables and diagrams' }),
        h('div', { class: 'setrow-sub', id: 'read-aloud-describe-hint', text: 'Instead of skipping them, Full gives a sentence or two on what they show.' })),
      h('button', { type: 'button', class: 'schedule-switch', role: 'switch', 'aria-labelledby': 'read-aloud-describe-label', 'aria-describedby': 'read-aloud-describe-hint',
        'aria-checked': String(host.store.readAloud.describeTablesAndDiagrams !== false), onclick: () => {
          host.store.readAloud = { ...host.store.readAloud, describeTablesAndDiagrams: host.store.readAloud.describeTablesAndDiagrams === false }
          host.schedule()
        } }, h('span')))),
    host.state.provider === 'browser' ? null : h('div', { class: 'rows read-aloud-voice' },
      h('button', { class: 'setrow', id: 'files-voice', 'aria-label': 'Files voice', 'aria-haspopup': 'listbox', 'aria-expanded': String(Boolean(host.state.sheet?.voices)),
        onclick: () => { host.state.sheet.voices = !host.state.sheet.voices; host.schedule() } }, h('span', { class: 'setrow-title', text: 'Files voice' }), h('span', { class: 'setrow-value', text: host.state.provider === 'openai' ? openAIVoices[voice] : voice }), icon.chevronDown(16))),
    h('button', { class: 'pillbtn content-mark read-aloud-preview', type: 'button', disabled: !host.state.speechOn || phase === 'making', text: phase === 'making' ? 'Preparing sample…' : phase === 'ready' ? (isPlaying(t) ? 'Pause sample' : 'Play a sample') : 'Prepare a sample', onclick: () => {
      openRow(t)
      if (phase === 'ready') togglePlay(t)
      else requestSpeech(t, { play: true })
    } }),
    !host.state.speechOn ? h('div', { class: 'note', text: host.state.provider === 'browser' ? 'This browser has no speech synthesis. A server key enables Listen.' : 'Audio is unavailable on this server. Your voice choice is saved for when it is available.' }) : null,
    player,
  ].filter(Boolean)
}
return Object.defineProperties({}, {
    SPEECH_POLL_MS: { enumerable: true, get: () => SPEECH_POLL_MS },
    LOOKUP_FRESH_MS: { enumerable: true, get: () => LOOKUP_FRESH_MS },
    SPEECH_REPOSTS: { enumerable: true, get: () => SPEECH_REPOSTS },
    SEEK_STEP_S: { enumerable: true, get: () => SEEK_STEP_S },
    SPEECH_STAGES: { enumerable: true, get: () => SPEECH_STAGES },
    SPEECH_ACTIONS: { enumerable: true, get: () => SPEECH_ACTIONS },
    SPEECH_MODES: { enumerable: true, get: () => SPEECH_MODES },
    ROW_HIDDEN_BELOW_PX: { enumerable: true, get: () => ROW_HIDDEN_BELOW_PX },
    takes: { enumerable: true, get: () => takes },
    takeSerial: { enumerable: true, get: () => takeSerial, set: value => { takeSerial = value } },
    current: { enumerable: true, get: () => current, set: value => { current = value } },
    rowsPlaced: { enumerable: true, get: () => rowsPlaced },
    rowWatch: { enumerable: true, get: () => rowWatch, set: value => { rowWatch = value } },
    setKey: { enumerable: true, get: () => setKey },
    speechWord: { enumerable: true, get: () => speechWord },
    speechKicker: { enumerable: true, get: () => speechKicker },
    takeKeyOf: { enumerable: true, get: () => takeKeyOf },
    takeAlive: { enumerable: true, get: () => takeAlive },
    isPlaying: { enumerable: true, get: () => isPlaying },
    takeState: { enumerable: true, get: () => takeState },
    setModes: { enumerable: true, get: () => setModes },
    findTake: { enumerable: true, get: () => findTake },
    newTake: { enumerable: true, get: () => newTake },
    glyphTakes: { enumerable: true, get: () => glyphTakes },
    lookupDue: { enumerable: true, get: () => lookupDue },
    queueLookup: { enumerable: true, get: () => queueLookup },
    lookupTake: { enumerable: true, get: () => lookupTake },
    speechBody: { enumerable: true, get: () => speechBody },
    documentTake: { enumerable: true, get: () => documentTake },
    fileSpeech: { enumerable: true, get: () => fileSpeech },
    takeForSheet: { enumerable: true, get: () => takeForSheet },
    lookupDocumentStop: { enumerable: true, get: () => lookupDocumentStop },
    fileSpeechSheet: { enumerable: true, get: () => fileSpeechSheet },
    focusFileSpeech: { enumerable: true, get: () => focusFileSpeech },
    trapFileSpeech: { enumerable: true, get: () => trapFileSpeech },
    forgetTake: { enumerable: true, get: () => forgetTake },
    setMark: { enumerable: true, get: () => setMark },
    MARK_WORDS: { enumerable: true, get: () => MARK_WORDS },
    speechGlyph: { enumerable: true, get: () => speechGlyph },
    MENU_VALUES: { enumerable: true, get: () => MENU_VALUES },
    speechRow: { enumerable: true, get: () => speechRow },
    speechMenu: { enumerable: true, get: () => speechMenu },
    turnRow: { enumerable: true, get: () => turnRow },
    speak: { enumerable: true, get: () => speak },
    openRow: { enumerable: true, get: () => openRow },
    pauseSpeech: { enumerable: true, get: () => pauseSpeech },
    watchRow: { enumerable: true, get: () => watchRow },
    barTake: { enumerable: true, get: () => barTake },
    playerBar: { enumerable: true, get: () => playerBar },
    returnToTake: { enumerable: true, get: () => returnToTake },
    revealPlayer: { enumerable: true, get: () => revealPlayer },
    drawBar: { enumerable: true, get: () => drawBar },
    requestSpeech: { enumerable: true, get: () => requestSpeech },
    pollSpeech: { enumerable: true, get: () => pollSpeech },
    takeProgress: { enumerable: true, get: () => takeProgress },
    takeSpeech: { enumerable: true, get: () => takeSpeech },
    unavailableSentence: { enumerable: true, get: () => unavailableSentence },
    repostSpeech: { enumerable: true, get: () => repostSpeech },
    retrySpeech: { enumerable: true, get: () => retrySpeech },
    failSpeech: { enumerable: true, get: () => failSpeech },
    settleReady: { enumerable: true, get: () => settleReady },
    ensureAudio: { enumerable: true, get: () => ensureAudio },
    applyRate: { enumerable: true, get: () => applyRate },
    audioFailed: { enumerable: true, get: () => audioFailed },
    startPlay: { enumerable: true, get: () => startPlay },
    togglePlay: { enumerable: true, get: () => togglePlay },
    speechDuration: { enumerable: true, get: () => speechDuration },
    seekTo: { enumerable: true, get: () => seekTo },
    cycleRate: { enumerable: true, get: () => cycleRate },
    dropAudio: { enumerable: true, get: () => dropAudio },
    closeTake: { enumerable: true, get: () => closeTake },
    mediaSession: { enumerable: true, get: () => mediaSession },
    playbackState: { enumerable: true, get: () => playbackState },
    clearMediaSession: { enumerable: true, get: () => clearMediaSession },
    playerKey: { enumerable: true, get: () => playerKey },
    seekFromPointer: { enumerable: true, get: () => seekFromPointer },
    drawTake: { enumerable: true, get: () => drawTake },
    settingsReadAloud: { enumerable: true, get: () => settingsReadAloud }
})
}
