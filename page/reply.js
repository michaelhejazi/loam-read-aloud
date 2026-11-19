import { wordCount } from './speech.js'
export function threadSpeechSet(thread, message, name, persona = {}, parts = message.segments?.length ? [...message.segments, ...(message.text ? [{ text: message.text }] : [])] : [{ text: message.text ?? '' }]) {
  if (message.streaming || message.kind === 'system') return null
  const text = parts.filter((part) => part.text !== undefined).map((part) => part.text.trim()).filter(Boolean).join('\n\n')
  if (!text) return null
  // Message IDs are thread-local; the author is explicit even when two agents
  // say exactly the same words. Replay and history prepending keep this ID.
  const id = `thread:${JSON.stringify([thread.id, message.author, message.id])}`
  const request = {}
  if (persona.voice != null) request.voice = persona.voice
  if (persona.style != null) request.style = persona.style
  return { key: id, text, words: wordCount(text), anchor: 0,
    context: { id, threadId: thread.id, agent: message.author, name, title: thread.title, request } }
}
