import path from 'node:path'
import { keyFrom } from './http.js'
import { createSpeech } from './speech.js'
import { TEXT_MODEL, openAIText } from './openai-text.js'
import { SPEECH_MODEL, narrate } from './openai-speech.js'

export function speechProviders(config, options) {
  const googleKey = keyFrom(config.keysFile, 'GEMINI_API_KEY')
  const openaiKey = keyFrom(config.keysFile, 'OPENAI_API_KEY')
  const google = createSpeech(config, { ...options, getKey: googleKey })
  const openai = createSpeech({ ...config, speech: { ...config.speech, dir: path.join(config.speech.dir, 'openai'),
    briefModel: TEXT_MODEL, ttsModel: SPEECH_MODEL, ttsModelNamed: true } }, {
    ...options, getKey: openaiKey,
    writeText: async (body, signal) => openAIText({ key: await openaiKey(), instructions: body.system_instruction, input: body.input, signal }),
    synthesize: async request => narrate({ ...request, key: await openaiKey() }),
  })
  async function selected() {
    if (await googleKey()) return { provider: 'google', service: google }
    if (await openaiKey()) return { provider: 'openai', service: openai }
    return { provider: 'browser', service: null }
  }
  async function action(method, body) {
    const { provider, service } = await selected()
    if (body.provider && body.provider !== provider) return { status: 409, body: { error: 'Your speech provider changed. Open Listen again.' } }
    return service ? service[method](body) : { status: 503, body: { error: 'speech unavailable', reason: 'no key' } }
  }
  return {
    start: async () => (await selected()).service?.start(),
    chooseModel: async () => (await selected()).service?.chooseModel(),
    async status() {
      const { provider, service } = await selected()
      return { provider, ...(service ? await service.status() : { available: false, reason: 'no key' }) }
    },
    request: body => action('request', body), peek: body => action('peek', body),
    lookup: async id => await google.lookup(id) ?? openai.lookup(id),
    audio: async id => await google.audio(id) ?? openai.audio(id),
    stop: () => Promise.all([google.stop(), openai.stop()]),
  }
}
