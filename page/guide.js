const labels = { google: 'Using Google', openai: 'Using OpenAI', browser: 'Using this browser' }

export function speechGuide(loam, plugin, benefit) {
  const { h, host, icon, menuSurface } = loam.ui
  let surface = null

  loam.places.app.overlay.add({ id: plugin + '.key-guide', render: () => {
    if (surface) surface.toggleAttribute('data-menu-centered', (globalThis.visualViewport?.width ?? globalThis.innerWidth) >= 700)
    return surface
  } })

  function close() {
    if (!surface) return
    const field = surface.querySelector('input')
    if (field) field.value = ''
    surface = null
    host.schedule()
  }

  function open() {
    if (surface) return
    const input = h('input', { class: 'field-input', type: 'password', required: true, autocomplete: 'off', spellcheck: false, placeholder: 'Paste your key' })
    const status = h('p', { class: 'note keys-check', role: 'status' })
    const save = h('button', { type: 'submit', class: 'pillbtn primary', text: 'Check and save' })
    const form = h('form', { class: 'keys-form speech-key-form', onsubmit: async event => {
      event.preventDefault()
      if (save.disabled) return
      const value = input.value.trim()
      if (!value) { input.focus(); return }
      input.value = ''
      save.disabled = true
      status.textContent = 'Checking with Google…'
      try {
        const out = await host.api('PUT', '/keys/google', { values: { GEMINI_API_KEY: value } })
        if (!out.checked?.ok) throw new Error(out.checked?.why || 'Google could not verify the key.')
        loam.events.emit('speech.keys.changed', {})
        if (surface !== current) return
        const done = h('button', { class: 'pillbtn primary', type: 'button', text: 'Done', onclick: close })
        form.replaceChildren(h('div', { class: 'speech-key-success', role: 'status' },
          h('span', { class: 'speech-key-check', 'aria-hidden': 'true' }, icon.check(22)),
          h('h3', { class: 'display', text: 'Google is connected' }),
          h('p', { class: 'note', text: 'Your shared key is saved in Connections. Both speech plugins can use it.' })), done)
        done.focus({ preventScroll: true })
      } catch (error) {
        status.textContent = error.body?.error || error.message
        save.disabled = false
      }
    } },
    h('p', { text: 'Sign in to Google AI Studio, choose Create API key, then copy your key here.' }),
    h('a', { class: 'pillbtn speech-studio', href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener noreferrer' },
      'Open Google AI Studio', h('span', { 'aria-hidden': 'true', text: '↗' })),
    h('p', { class: 'note' }, 'Eligible projects get a free quota without billing. ',
      h('a', { class: 'loginlink', href: 'https://aistudio.google.com/docs/terms#use-restrictions', target: '_blank', rel: 'noopener noreferrer', text: 'Check eligibility' })),
    h('p', { class: 'note', text: 'On the free tier, Google may use the audio and text you send to improve its products.' }),
    h('label', { class: 'keys-field' }, h('span', { class: 'keys-field-label', text: 'Gemini API key' }), input), status, save)
    const current = menuSurface(h('section', { key: plugin + '.key-guide', class: 'speech-key-guide', 'aria-modal': 'true' }, form),
      { title: 'Use a Gemini key', close, width: 424 })
    surface = current
    host.schedule()
  }

  const link = () => h('button', { class: 'quietlink speech-key-link', type: 'button', text: benefit, onclick: open })
  const settings = (provider, active = provider) => h('section', { class: 'rows speech-provider' },
    h('strong', { class: 'setrow-title', role: 'status', text: labels[active] ?? 'Checking speech provider…' }),
    provider === 'browser' ? link() : null)
  return { open, close, link, settings }
}
