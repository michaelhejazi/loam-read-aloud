import { openAIVoices } from './openai-voices.js'
import { PREBUILT_VOICES } from './document-speech.js'
import { voiceGender, voiceLabel } from './voices.js'
import { samples as bundledSamples } from './voice-samples.js'

// Plugin-owned, static audio only. Selection uses the profile controller's
// ordinary save callback, including its error, busy and stale-write guards.
export function createVoicePicker({ ui, redraw, guide, provider = () => 'google', pauseSpeech = () => {}, samples = bundledSamples, makeAudio = url => new Audio(url) }) {
  const { h, icon, menuSurface } = ui
  let opened = null, audio = null, playing = null, error = '', rendered = false, revision = 0
  function stop() {
    const previous = audio
    audio = null; playing = null
    if (previous) { previous.pause(); previous.removeAttribute('src'); previous.load() }
  }
  function close() { revision++; stop(); opened = null; error = ''; redraw() }
  async function play(voice) {
    if (provider() !== 'google') return
    const same = playing === voice
    stop(); error = ''
    if (same) { redraw(); return }
    const sample = samples[voice]
    if (!sample) return
    pauseSpeech()
    ui.audioSessionType?.('playback')
    const current = makeAudio(new URL(sample.file, import.meta.url).href)
    audio = current; playing = voice
    const failed = () => { if (audio === current) { stop(); error = `Couldn’t play ${voice}’s sample. Try again.`; redraw() } }
    current.addEventListener('ended', () => { if (audio === current) { stop(); redraw() } })
    current.addEventListener('error', failed)
    redraw()
    try { await current.play() } catch { failed() }
  }
  function render({ agent, plugin, busy, error: saveError, save, defaultView }) {
    rendered = true
    if (provider() === 'browser') return h('section', { class: 'profile-group', 'aria-label': 'Read aloud' }, h('h3', { class: 'kicker', text: 'Read aloud' }),
      h('p', { class: 'note', text: 'Read aloud uses this browser’s default voice.' }), guide?.link())
    const mapped = provider() === 'openai'
    if (opened && opened !== agent) close()
    const voice = plugin.values?.voice ?? plugin.fields.find(f => f.id === 'voice')?.default ?? 'Charon'
    const trigger = `read-aloud-voice-${agent}`
    const otherFields = plugin.fields.filter(f => f.id !== 'voice')
    return [h('section', { class: 'profile-group', 'aria-label': 'Read aloud' }, h('h3', { class: 'kicker', text: 'Read aloud' }),
      h('div', { class: 'rows' }, h('button', { id: trigger, class: 'setrow voice-picker-trigger', type: 'button', 'aria-label': 'Voice', 'aria-haspopup': 'dialog', 'aria-expanded': String(opened === agent), disabled: busy,
        onclick: () => { if (opened === agent) close(); else { revision++; opened = agent; error = ''; redraw() } } },
      h('span', { class: 'setrow-title', text: 'Voice' }), h('span', { class: 'setrow-value', text: mapped ? openAIVoices[voice] : voiceLabel(voice) }), icon.chevronDown(14)))),
      opened === agent ? menuSurface(h('div', { class: 'popover agent-voice-picker', key: `agent-voice:${agent}` },
        h('p', { class: 'note voice-picker-help', text: mapped ? 'Each profile voice maps to the AI-generated OpenAI voice shown beside it.' : Object.keys(samples).length ? 'Listen to a sample, then choose a voice.' : 'Choose a voice. Audio samples haven’t been recorded yet.' }),
        h('div', { class: 'voice-picker-list', role: 'group', 'aria-label': 'Voices' }, PREBUILT_VOICES.map(id => h('div', { class: 'voice-picker-row', key: id },
          h('button', { class: 'voice-picker-choice', type: 'button', 'aria-label': mapped ? `Choose ${id}, ${openAIVoices[id]}, ${voiceGender(id)}` : `Choose ${voiceLabel(id)}`, 'aria-pressed': String(voice === id), disabled: busy,
            onclick: async () => { const current = revision; stop(); error = ''; redraw(); if (await save({ voice: id }) && current === revision) close() } },
          h('span', { class: 'voice-picker-name', text: id }), h('span', { class: 'voice-picker-gender', text: mapped ? openAIVoices[id] + ' · ' + voiceGender(id) : voiceGender(id) }), h('span', { class: 'voice-picker-check', 'aria-hidden': 'true' }, voice === id ? icon.check(16) : null)),
          provider() !== 'google' ? null : h('button', { class: 'iconbtn ghost voice-picker-play', type: 'button', disabled: !samples[id], 'aria-label': `${playing === id ? 'Stop' : 'Play'} ${id} sample`, 'aria-pressed': String(playing === id), title: samples[id] ? `${Math.round(samples[id].duration_s)} second sample` : 'Sample not recorded yet', onclick: () => play(id) }, playing === id ? icon.pause(16) : icon.play(16))))),
        error || saveError ? h('p', { class: 'schedule-error voice-picker-help', role: 'alert', text: error || saveError }) : null),
      { title: 'Choose a voice', width: 380, anchor: `#${CSS.escape(trigger)}`, close }) : null,
      ...(otherFields.length ? [defaultView(otherFields)] : [])]
  }
  return { render, close, stop, beforeRender() { rendered = false }, afterRender() { if (!rendered && opened) close() } }
}
