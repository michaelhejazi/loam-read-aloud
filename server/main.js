// Read aloud's server, started by Loam when the plugin is on
// (docs/plugins.md, "Server plugins"): it listens on 127.0.0.1:$PORT and is
// reached by the page at `/x/read-aloud/`. Its key is the Google key Loam
// resolves for it (`LOAM_PLUGIN_KEYS`, from Settings › Connections › API
// keys); the browser never holds it. Each agent's voice is the one chosen
// on its profile (asked of Loam), else the plugin's `voices` setting.

import fs from 'node:fs'
import { readConfig } from './config.js'
import { speechProviders } from './providers.js'
import { createReadAloudServer, agentVoiceFrom } from './app.js'
import { createLog } from './http.js'

const config = readConfig()
const log = createLog({ level: config.logLevel })

// The `voices` setting, read when it changed (its file's mtime), so a change
// in Settings is used by the next take with no restart.
let seen = { mtime: -1, voices: config.speech.voices }
function voicesNow() {
  if (!config.settingsFile) return seen.voices
  let mtime = 0
  try { mtime = fs.statSync(config.settingsFile).mtimeMs } catch { mtime = 0 }
  if (mtime !== seen.mtime) {
    let voices = config.speech.voices
    try {
      const values = JSON.parse(fs.readFileSync(config.settingsFile, 'utf8'))
      if (typeof values?.voices === 'string') voices = values.voices.trim()
    } catch { /* no settings yet: the default */ }
    seen = { mtime, voices }
  }
  return seen.voices
}
config.speech.voicesNow = voicesNow

const agentVoice = agentVoiceFrom(config)

const speech = speechProviders(config, { log })
const { server } = createReadAloudServer({ config, speech, log, agentVoice })
Promise.all([speech.start(), speech.chooseModel()])
  .catch((err) => log.error({ event: 'speech-config', message: String(err?.message ?? err) }))
server.listen(config.port, '127.0.0.1', () => log.info({ event: 'listening', port: server.address().port }))
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)))
