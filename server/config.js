// Every knob Read aloud's server has, from its environment. Loam starts the
// server with its own variables (`LOAM_PLUGIN_*`, `PORT`); the `SPEECH_*` and
// `GEMINI_API_URL` names are for a test or a box that wants to point one
// somewhere else, and every one has its default here and nowhere else.

import path from 'node:path'

export function readConfig(env = process.env) {
  const ttsModelSet = (env.SPEECH_TTS_MODEL ?? '').trim()
  const base = (env.LOAM_PLUGIN_BASE ?? '').trim() || '/x/read-aloud/'
  const privateDir = (env.LOAM_PLUGIN_PRIVATE ?? '').trim()
  return {
    port: Number.parseInt(env.PORT ?? env.LOAM_PLUGIN_PORT ?? '0', 10) || 0,
    // Tests point synthesis at a loopback provider with this.
    geminiUrl: (env.GEMINI_API_URL ?? 'https://generativelanguage.googleapis.com').trim().replace(/\/+$/, ''),
    logLevel: (env.LOG_LEVEL ?? '').trim().toLowerCase() || 'info',
    brokerUrl: (env.LOAM_BROKER_URL ?? '').trim().replace(/\/+$/, ''),
    brokerTokenFile: (env.LOAM_BROKER_TOKEN_FILE ?? '').trim(),
    keysFile: (env.LOAM_PLUGIN_KEYS ?? '').trim() || (privateDir ? path.join(privateDir, 'keys.env') : ''),
    settingsFile: (env.LOAM_PLUGIN_SETTINGS_DIR ?? '').trim() ? path.join(env.LOAM_PLUGIN_SETTINGS_DIR.trim(), 'values.json') : '',
    pluginId: (env.LOAM_PLUGIN_ID ?? '').trim() || 'read-aloud',
    speech: {
      ttsModel: ttsModelSet || 'gemini-3.8-flash-tts',
      // Whether the TTS model was named, or is the default: a tracking alias
      // found in the models list is used only when it was not named.
      ttsModelNamed: ttsModelSet !== '',
      briefModel: (env.SPEECH_BRIEF_MODEL ?? '').trim() || 'gemini-flash-latest',
      // The audio is a cache: machine-local, never in a backup.
      dir: (env.SPEECH_DIR ?? '').trim() || (privateDir ? path.join(privateDir, 'speech') : path.resolve('speech')),
      // Where the page fetches a take's MP3: this server's own address.
      audioBase: `${base.replace(/\/*$/, '/')}speech/`,
      ttlHours: positive(env.SPEECH_TTL_HOURS, 48),
      maxChars: positiveInt(env.SPEECH_MAX_CHARS, 60_000),
      documentMaxChars: positiveInt(env.SPEECH_DOCUMENT_MAX_CHARS, 250_000),
      chunkChars: positiveInt(env.SPEECH_CHUNK_CHARS, 1_000),
      concurrency: positiveInt(env.SPEECH_CONCURRENCY, 4),
      briefMaxWords: positiveInt(env.SPEECH_BRIEF_MAX_WORDS, 300),
      ffmpeg: (env.SPEECH_FFMPEG ?? '').trim() || 'ffmpeg',
      // Which voice each agent speaks in, `agent=Voice:character;…`. On an
      // install it is the plugin's `voices` setting (`voicesNow`, main.js);
      // this is the value before any setting is read, and a test's.
      voices: (env.SPEECH_VOICES ?? '').trim(),
      paces: (env.SPEECH_PACES ?? '').trim() || 'Aoede=147',
    },
  }
}

// A number setting that is not a positive number is its default: a typo in
// the environment makes the server behave as documented, not as zero.
function positive(value, fallback) {
  const n = Number(String(value ?? '').trim())
  return String(value ?? '').trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback
}

function positiveInt(value, fallback) {
  return Math.max(1, Math.floor(positive(value, fallback)))
}
