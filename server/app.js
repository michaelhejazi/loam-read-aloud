// Read aloud's routes, served by its own server at `/x/read-aloud/` (Loam's
// plugin gateway takes the prefix off, so these paths start at `/`):
//
//   GET  /status                   {speech: bool, reason}: can a take be made here
//   POST /speech                   make (or find) a take → 200 ready, 202 preparing
//   POST /speech/lookup            the same body, starting nothing
//   GET  /speech/<id>              a take's state
//   GET  /speech/<id>/audio.mp3    its audio, whole or one byte range (HEAD too)
//
// Until Read aloud 1.1.0 these were Loam's own (`/api/speech`, and `speech` on
// the app's health read); a plugin now carries its own server half.

import fs from 'node:fs'
import http from 'node:http'
import { sendJson, readRaw, safeJson, dec, sendFileRange } from './http.js'

const MAX_BODY = 64 * 1024

export function createReadAloudServer({ config, speech, log = { info() {}, warn() {}, error() {} }, agentVoice = async () => null }) {
  async function route(req, res) {
    const url = new URL(req.url, 'http://plugin.invalid')
    const rest = url.pathname.replace(/\/+$/, '') || '/'
    const method = req.method

    if (rest === '/up' && method === 'GET') return sendJson(res, 200, { ok: true })

    if (rest === '/status' && method === 'GET') {
      const spoken = await speech.status()
      return sendJson(res, 200, { speech: spoken.available, reason: spoken.reason ?? null })
    }

    // Whether a take exists, with the same body as the POST, starting nothing:
    // the page's glyph and menu say "ready" from this and not from a guess.
    if ((rest === '/speech' || rest === '/speech/lookup') && method === 'POST') {
      const raw = await readRaw(req, Math.max(config.speech.maxChars, config.speech.documentMaxChars) * 4 + MAX_BODY)
      if (raw === null) {
        return sendJson(res, 413, { error: `This is over the ${config.speech.maxChars.toLocaleString('en')} characters this app will read aloud at once.` })
      }
      const body = safeJson(raw.toString('utf8'))
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return sendJson(res, 400, { error: 'The request was not a JSON object, so there is nothing to read aloud.' })
      }
      // An agent's own voice, chosen on its profile, wins over the list and
      // over what the page sent; with none stored, the page's or the list's.
      if (body.source !== 'document' && typeof body.agent === 'string') {
        const voice = await agentVoice(body.agent).catch(() => null)
        if (typeof voice === 'string') body.voice = voice
      }
      const out = rest === '/speech' ? await speech.request(body) : await speech.peek(body)
      return sendJson(res, out.status, out.body)
    }
    const spoken = /^\/speech\/([^/]+)$/.exec(rest)
    if (spoken && method === 'GET') {
      const found = await speech.lookup(dec(spoken[1]))
      if (!found) return sendJson(res, 404, { error: 'There is no audio by that id here: it has expired, or the server restarted while it was being made.' })
      return sendJson(res, 200, found)
    }
    const audio = /^\/speech\/([^/]+)\/audio\.mp3$/.exec(rest)
    if (audio && (method === 'GET' || method === 'HEAD')) {
      const found = await speech.audio(dec(audio[1]))
      if (!found) return sendJson(res, 404, { error: 'This audio has expired. Ask for it again.' })
      return sendFileRange(req, res, found.file, found.size, 'audio/mpeg')
    }
    return sendJson(res, 404, { error: 'Read aloud has no such route.' })
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((err) => {
      log.error({ event: 'request', path: req.url, message: String(err?.message ?? err) })
      if (!res.headersSent) sendJson(res, 500, { error: 'Read aloud failed to answer this.' })
      else res.destroy()
    })
  })
  server.on('close', () => speech.stop())
  return { server }
}

// An agent's own voice, from its profile (`agent_settings` in PLUGIN.md),
// asked of Loam's broker as the page reads it: `{on, stored: {voice}}`. None,
// or no broker: null, and the list decides.
export function agentVoiceFrom({ brokerUrl, brokerTokenFile, pluginId = 'read-aloud', fetchImpl = fetch }) {
  return async (agent) => {
    if (!brokerUrl || !brokerTokenFile) return null
    const token = fs.readFileSync(brokerTokenFile, 'utf8').trim()
    const res = await fetchImpl(`${brokerUrl}/v1/plugins/${encodeURIComponent(pluginId)}/agents/${encodeURIComponent(agent)}`, {
      headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const settings = await res.json()
    return settings?.on && typeof settings.stored?.voice === 'string' ? settings.stored.voice : null
  }
}
