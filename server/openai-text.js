export const TEXT_MODEL = 'gpt-6-luna'

export async function openAIText({ key, instructions, input, signal, fetchImpl = fetch }) {
  let response
  try {
    response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: TEXT_MODEL, instructions, input, store: false, reasoning: { effort: 'none' } }), signal,
    })
  } catch { throw new Error('OpenAI could not be reached for the text request.') }
  if (!response.ok) throw new Error(`OpenAI refused the text request (HTTP ${response.status}).`)
  const answer = await response.json()
  if (answer.status !== 'completed') throw new Error('OpenAI did not finish the text request.')
  return (answer.output ?? []).flatMap(item => item.content ?? [])
    .filter(part => part.type === 'output_text').map(part => part.text).join('').trim()
}
