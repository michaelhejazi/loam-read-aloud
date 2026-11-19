import { speechSettings } from './speech.js'
import { readAloudSettings } from './document-speech.js'
export function createPreferences(settings) {
  const speech = settings.device('loam-ui.speech', speechSettings), voice = settings.device('loam-ui.read-aloud', readAloudSettings)
  return { get speech() { return speech.value }, set speech(value) { speech.value = value },
    get readAloud() { return voice.value }, set readAloud(value) { voice.value = value } }
}
