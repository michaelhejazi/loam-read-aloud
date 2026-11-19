import { mount } from './engine.js'
import * as speech from './speech.js'
import * as documentSpeech from './document-speech.js'
import { createPreferences } from './settings.js'
import { threadSpeechSet } from './reply.js'
import { createVoicePicker } from './voice-picker.js'
export function activate(loam) {
  loam.ui.styles.add('page/style.css')
  const store = createPreferences(loam.settings)
  const local = { speech: store.speech, speechOn: false, speakMenu: null }
  Object.defineProperty(local, 'rec', { get: () => ['draft', 'editor', 'file'].map(target => loam.ui.host.fieldActivity(target)).find(state => state?.phase === 'recording') })
  const context = loam.ui.extension({ state: local, store, helpers: { ...speech, ...documentSpeech, speechClock: speech.clock } })
  const host = context.host, service = context.attach(mount(host))
  let disposed = false
  // Whether a take can be made here is this plugin's own server's answer
  // (`/x/read-aloud/status`): false without a Google key, the encoder or
  // somewhere to keep the audio, and then nothing is drawn. It is asked again
  // whenever the app reads its health, and when the page comes back.
  const refreshHealth = () => Promise.resolve().then(() => (host.fetch ?? fetch)('/x/read-aloud/status', { headers: { accept: 'application/json' } }))
    .then(res => res.ok ? res.json() : null).catch(() => null)
    .then(status => { if (!disposed) { local.speechOn = status?.speech === true; host.schedule() } })
  refreshHealth()
  loam.events.on('plugin.secrets.changed', ({ id }) => { if (id === 'read-aloud') refreshHealth() })
  loam.events.on('health.changed', refreshHealth)
  loam.events.on('page.visible', refreshHealth)
  const voicePicker = createVoicePicker({ ui: loam.ui, redraw: () => host.schedule(), pauseSpeech: () => service.pauseSpeech() })
  loam.places.agent.profile.add({ id: 'read-aloud.voice', render: context => voicePicker.render(context) })
  loam.places.message.footer.action.add({ id: 'read-aloud.footer', slot: 'row', order: 100, render: context => {
    const set = !context.mine && threadSpeechSet(context.thread, context.message, context.agentName, context.agent, loam.data.messages.parts(context.message))
    return set ? service.turnRow(context.leading, set, context.trailing) : context.view
  } })
  loam.places.files.viewer.add({ id: 'read-aloud.file', slot: 'action', render: context => service.fileSpeech(context.file) })
  loam.places.settings.section.add({ id: 'read-aloud', group: 'plugin', title: 'Reading preferences', render: () => service.settingsReadAloud({ back: false }) })
  loam.places.app.overlay.add({ id: 'read-aloud.player', slot: 'player', render: () => service.playerBar() })
  loam.places.app.overlay.add({ id: 'read-aloud.sheets', slot: 'sheet', render: ({ sheet }) => {
    if (sheet.kind === 'file-speech') {
      const body = service.fileSpeechSheet(sheet), close = host.closeSheet
      const surface = loam.ui.menuSurface(body, { title: 'Read aloud', close, width: 480, heading: false })
      const node = host.state.wide ? loam.ui.h('div', { class: 'dialog file-speech', onclick: e => { if (e.target === e.currentTarget) close() } }, surface) : surface
      node.__key = 'sheet:file-speech'
      return [loam.ui.h('button', { class: `scrim file-speech-scrim${sheet.closing ? ' leaving' : ''}`, key: 'scrim', 'aria-label': 'Close', tabindex: '-1', onclick: close }), node]
    }
    if (sheet.kind !== 'settings' || !sheet.voices) return null
    return loam.ui.menuSurface(loam.ui.h('div', { class: 'popover voice-menu', role: 'listbox' }, ...documentSpeech.PREBUILT_VOICES.map(voice => loam.ui.h('button', { class: 'setrow', role: 'option', 'aria-selected': String(voice === store.readAloud.voice), text: voice, onclick: () => {
      const sample = service.documentTake({ sample: true, text: documentSpeech.VOICE_SAMPLE, title: 'Voice sample' })
      if (service.isPlaying(sample)) sample.audio.pause()
      store.readAloud = { ...store.readAloud, voice }; sheet.voices = false; host.schedule()
    } }))), { title: 'Files voice', anchor: '#files-voice', close: () => { sheet.voices = false; host.schedule() } })
  } })
  loam.events.on('rendering', () => { service.rowsPlaced.clear(); voicePicker.beforeRender() })
  loam.events.on('rendered', () => { service.focusFileSpeech(); service.revealPlayer(); voicePicker.afterRender() })
  loam.events.on('audio.capture', () => { service.pauseSpeech(); voicePicker.close() })
  loam.events.on('key.escape', event => { if (!event.defaultPrevented && local.speakMenu) { local.speakMenu = null; host.schedule(); event.preventDefault() } })
  const cleanup = () => {
    voicePicker.close()
    disposed = true
    for (const take of service.takes.values()) { clearTimeout(take.timer); service.closeTake(take) }
    service.takes.clear(); service.rowsPlaced.clear(); service.rowWatch?.disconnect()
    if (host.state.sheet?.kind === 'file-speech') { host.state.sheet = null; host.schedule() }
    if (host.state.sheet) host.state.sheet.voices = false
    local.speakMenu = null
  }
  loam.events.on('page.leaving', cleanup)
  return cleanup
}
