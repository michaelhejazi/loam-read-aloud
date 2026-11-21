import { speakable } from './speakable.js'
import { documentSpeakable } from './document-speech.js'

// Keep utterances short for mobile engines. Each player owns a cursor, while
// the device has one speech queue. Resuming a displaced player repeats at most
// the current phrase.
let owner = null
export class BrowserAudio extends EventTarget {
  constructor(take, synth = globalThis.speechSynthesis) {
    super()
    this.synth = synth
    const text = take.request?.source === 'document' ? documentSpeakable(take.text) : speakable(take.text)
    this.phrases = []
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text)) {
      let phrase = ''
      for (const word of segment.trim().split(/\s+/u)) {
        if (phrase.length + word.length > 180 && phrase) { this.phrases.push(phrase); phrase = '' }
        phrase += (phrase ? ' ' : '') + word
      }
      if (phrase) this.phrases.push(phrase)
    }
    this.index = 0
    this.paused = true
    this.ended = false
    this.playbackRate = 1
    this.currentTime = 0
    this.utterance = null
  }
  emit(type) { this.dispatchEvent(new Event(type)) }
  play() {
    if (!this.paused) return
    if (!this.phrases.length) { this.emit('error'); return }
    if (this.ended) this.index = 0
    this.paused = false; this.ended = false
    if (owner === this && this.utterance) this.synth.resume()
    else {
      owner?.release()
      owner = this
      this.next()
    }
    this.emit('play')
  }
  next() {
    const phrase = this.phrases[this.index]
    const utterance = new SpeechSynthesisUtterance(phrase)
    this.utterance = utterance
    utterance.rate = this.playbackRate
    utterance.onend = () => {
      if (this.utterance !== utterance) return
      this.utterance = null
      this.index++
      if (this.index === this.phrases.length) {
        this.paused = true; this.ended = true; owner = null; this.emit('ended')
      } else if (!this.paused) this.next()
    }
    utterance.onerror = () => {
      if (this.utterance !== utterance) return
      this.release(); this.emit('error')
    }
    this.synth.speak(utterance)
  }
  pause() {
    if (this.paused) return
    this.paused = true
    if (owner === this) this.synth.pause()
    this.emit('pause')
  }
  release() {
    this.utterance = null; this.paused = true
    if (owner === this) { owner = null; this.synth.cancel(); this.synth.resume() }
  }
}
