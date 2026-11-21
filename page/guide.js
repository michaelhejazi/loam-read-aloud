const labels = { google: 'Using Google', openai: 'Using OpenAI', browser: 'Using this browser' }

export function speechGuide(loam, plugin, benefit) {
  const { h, host } = loam.ui
  let dialog
  loam.places.app.overlay.add({ id: plugin + '.key-guide', render: () => dialog ?? null })
  loam.events.on('rendered', () => { if (dialog?.isConnected && !dialog.open) dialog.showModal() })
  function close() { dialog?.close() }
  function open() {
    if (dialog) return
    const key = h('input', { type: 'password', required: true, autocomplete: 'off', spellcheck: false, placeholder: 'Paste your Gemini API key', 'aria-label': 'Gemini API key' })
    const status = h('p', { class: 'note', role: 'status' })
    const save = h('button', { type: 'submit', class: 'primary', text: 'Check and save' })
    const form = h('form', { onsubmit: async event => {
      event.preventDefault()
      if (save.disabled) return
      const value = key.value.trim()
      if (!value) { key.focus(); return }
      key.value = ''; save.disabled = true; status.textContent = 'Checking with Google…'
      try {
        const out = await host.api('PUT', '/keys/google', { values: { GEMINI_API_KEY: value } })
        if (!out.checked?.ok) throw new Error(out.checked?.why || 'Google could not verify the key.')
        loam.events.emit('speech.keys.changed', {})
        key.hidden = save.hidden = true
        status.textContent = 'Google accepted your key. It’s saved in Connections.'
      } catch (error) { status.textContent = error.body?.error || error.message }
      finally { save.disabled = false }
    } }, h('h2', { text: 'Use a Gemini key' }),
      h('p', { text: 'Open Google AI Studio, sign in and choose Create API key. Copy it here.' }),
      h('a', { class: 'pillbtn content-mark', href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener noreferrer', text: 'Open Google AI Studio ↗' }),
      h('p', { class: 'note' }, 'Eligible projects get a free quota without billing. ', h('a', { href: 'https://aistudio.google.com/docs/terms#use-restrictions', target: '_blank', rel: 'noopener noreferrer', text: 'Eligibility ↗' })),
      h('p', { class: 'note', text: 'On the free tier, Google may use the audio and text you send to improve its products.' }),
      key, save, status, h('button', { type: 'button', class: 'pillbtn', text: 'Close', onclick: close }))
    dialog = h('dialog', { key: plugin + '.key-guide', class: 'speech-key-guide', 'aria-label': 'Use a Gemini key' }, form)
    const current = dialog
    current.addEventListener('close', () => { key.value = ''; current.remove(); if (dialog === current) dialog = null; host.schedule() }, { once: true })
    host.schedule()
  }
  const link = () => h('button', { class: 'speech-key-link', type: 'button', text: benefit, onclick: open })
  const settings = provider => h('section', { class: 'rows speech-provider' },
    h('strong', { role: 'status', text: labels[provider] ?? 'Checking speech provider…' }), link())
  return { open, close, link, settings }
}
