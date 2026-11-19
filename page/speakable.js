// Shared by the server and the Files listening estimate.
// Markdown as it is said aloud. An agent's reply is written for the eye —
// headings, lists, emphasis, links, code — and a speech model handed that
// reads the asterisks or stumbles over them. This turns it into plain prose
// with paragraph breaks and nothing that looks like markup, deterministically
// and without a model: the same reply is always the same words, which is what
// lets the server hash it and keep one file for it.
//
// What becomes what:
//
//   a heading            a sentence of its own
//   emphasis             the words, without the marks
//   struck-through text  nothing: it was taken back
//   a link, a wiki-link  its text (a wiki-link's alias, else its target)
//   a bare URL           "a link"
//   inline code          its text
//   a list               one sentence per item, a paragraph break after it
//   a blockquote         its text
//   a horizontal rule    a paragraph break, which is a pause
//   emoji                nothing
//   a code block         "A code block of twelve lines, skipped."
//   a table              "A table of four rows, skipped."
//
// Tables and diagram fences also carry source/context metadata for the server
// to describe asynchronously. Their deterministic text remains the fallback.
// Whether ordinary code is
// read aloud is a question its owner has not answered yet; `READ_CODE_BLOCKS`
// is the one place that answer goes.

export const READ_CODE_BLOCKS = false

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const DIAGRAM = /^(?:mermaid|plantuml|puml|dot|graphviz)$/i
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^ {0,3}([-*_])(\s*\1){2,}\s*$/
const SETEXT = /^ {0,3}(=+|-+)\s*$/
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
const QUOTE = /^ {0,3}>\s?(.*)$/
const TABLE_RULE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/
const LINK_DEFINITION = /^ {0,3}\[[^\]]+\]:\s*\S+/
const HTML_COMMENT = /<!--[\s\S]*?-->/g

// → plain prose, paragraphs separated by one blank line. Empty when there is
// nothing in the reply a voice could say.
export function speakable(markdown) {
  return speakableBlocks(markdown).map((block, i) => (i ? block.joinWith : '') + block.text).join('')
}

// Keep document seams beside the plain text. No markers reach the voice.
export function speakableBlocks(markdown) {
  const text = String(markdown ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(HTML_COMMENT, '')
  let heading = '', paragraph = ''
  return blocks(text.split('\n'))
    .map((block) => ({ ...block, text: block.text.trim() }))
    .filter((block) => block.text !== '')
    .map(block => {
      if (block.description) block.description = { ...block.description, heading, paragraph }
      else if (block.kind === 'heading') { heading = block.text; paragraph = '' }
      else if (block.kind === 'paragraph') paragraph = block.text
      return block
    })
}

// The block structure, read line by line, with plain text and joining seams.
function blocks(lines) {
  const out = []
  const add = (text, kind = 'paragraph', joinWith = '\n\n', description = null) =>
    out.push({ text, kind, joinWith, ...(description ? { description } : {}) })
  let paragraph = []
  let items = []

  const flushParagraph = () => {
    if (paragraph.length > 0) add(sentence(inline(paragraph.join(' ')), { close: false }))
    paragraph = []
  }
  const flushItems = () => {
    if (items.length > 0) {
      items.map((item) => sentence(inline(item.join(' ')), { close: true }))
        .filter((s) => s !== '').forEach((text, i) => add(text, 'list', i ? ' ' : '\n\n'))
    }
    items = []
  }
  const flush = () => {
    flushParagraph()
    flushItems()
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const fence = FENCE.exec(line)
    if (fence) {
      flush()
      const marker = fence[1]
      const language = line.slice(fence[0].length).trim().split(/\s+/)[0]
      const body = []
      i++
      while (i < lines.length && !new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`).test(lines[i])) {
        body.push(lines[i])
        i++
      }
      add(READ_CODE_BLOCKS ? body.join('\n') : `A code block of ${count(body.length, 'line')}, skipped.`,
        'code', '\n\n', DIAGRAM.test(language) ? { kind: 'diagram', language: language.toLowerCase(), content: body.join('\n') } : null)
      continue
    }

    if (line.trim() === '') {
      flush()
      continue
    }

    // A table: a row, then the rule under its header. The header is not a row
    // of data, so it is not counted.
    if (line.includes('|') && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      flush()
      const start = i
      let rows = 0
      i += 2
      while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) {
        rows++
        i++
      }
      i--
      add(`A table of ${count(rows, 'row')}, skipped.`, 'table', '\n\n', { kind: 'table', content: lines.slice(start, i + 1).join('\n') })
      continue
    }

    // A line of `===` or `---` under a paragraph line underlines it into a
    // heading; on its own it is a rule.
    if (paragraph.length > 0 && SETEXT.test(line)) {
      const heading = paragraph.join(' ')
      paragraph = []
      flush()
      add(sentence(inline(heading), { close: true }), 'heading')
      continue
    }

    if (RULE.test(line)) {
      flush()
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      add(sentence(inline(heading[2]), { close: true }), 'heading')
      continue
    }

    if (QUOTE.test(line)) {
      flush()
      const inner = []
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(QUOTE.exec(lines[i])[1])
        i++
      }
      i--
      out.push(...blocks(inner))
      continue
    }

    if (LINK_DEFINITION.test(line)) continue

    const item = ITEM.exec(line)
    if (item) {
      flushParagraph()
      items.push([item[3].replace(/^\[[ xX]\]\s+/, '')])
      continue
    }
    // An indented line under an item carries the item on.
    if (items.length > 0 && /^\s+\S/.test(line)) {
      items[items.length - 1].push(line.trim())
      continue
    }

    flushItems()
    paragraph.push(line.trim())
  }
  flush()
  return out
}

// One line's worth of inline markdown, as words. Code spans are taken out
// first and put back last, so the marks inside them — an underscore in a
// name, an asterisk in an expression — are not read as emphasis.
function inline(text) {
  const kept = []
  const keep = (s) => `\u0000${kept.push(s) - 1}\u0000`

  let s = text
    .replace(/(`+)\s?([^`]|[^`][\s\S]*?[^`])\s?\1(?!`)/g, (_, __, code) => keep(code))
    // Images: their alt text, which is what a screen reader says too.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => alt)
    // Wiki-links and embeds: the alias, else the target without its heading.
    .replace(/!?\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, target, alias) =>
      keep((alias ?? target.replace(/#\^?/g, ' ')).trim()),
    )
    .replace(/\[\^[^\]]+\]/g, '') // a footnote mark
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, (_, label) => label)
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, (_, label) => label)
    .replace(/<(https?:\/\/[^>\s]+)>/gi, () => keep('a link'))
    .replace(/<[a-z][\w-]*:[^>\s]+>/gi, () => keep('a link'))
    .replace(/\b(?:https?:\/\/|www\.)[^\s<>()]*[^\s<>().,;:!?'"’”]/gi, () => keep('a link'))
    // HTML: the tags go, the text between them stays.
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  // Struck-through words are words taken back, so they are not said.
  // Emphasis loses its marks; an underscore only marks emphasis at a word's
  // edge, so `snake_case` survives as written.
  s = s
    .replace(/~~(.+?)~~/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^\w])__(.+?)__(?!\w)/g, '$1$2')
    .replace(/\*(?!\s)(.+?)(?<!\s)\*/g, '$1')
    .replace(/(^|[^\w])_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '$1$2')
    .replace(/==(.+?)==/g, '$1') // a highlight
    // A backslash escape is the character itself.
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1')
    // Whatever marks are left are marks a voice would read.
    .replace(/[*`|]/g, ' ')

  s = dropEmoji(s)
  s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => dropEmoji(kept[Number(n)]))
  // A mark dropped before a full stop leaves a space in front of it.
  return s.replace(/\s+/g, ' ').replace(/ ([.,;:!?])/g, '$1').trim()
}

// Pictographs and everything that only exists to shape one: variation
// selectors, joiners, skin tones, flags' letters, the keycap.
function dropEmoji(s) {
  return s
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/[︎️‍⃣]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
}

// A heading or a list item said as a sentence: it closes with a full stop
// unless it already ends as a sentence does. A paragraph is left as written.
function sentence(text, { close }) {
  const t = text.trim()
  if (t === '' || !close) return t
  if (/[.!?…:]["'”’)\]]*$/.test(t)) return t
  return `${t.replace(/[,;]$/, '')}.`
}

function count(n, noun) {
  return `${numberWords(n)} ${noun}${n === 1 ? '' : 's'}`
}

const ONES = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

// A count as it is said: "twelve", "forty-two", "three hundred and one".
// Past a thousand it is the digits, which a voice reads well enough.
export function numberWords(n) {
  if (!Number.isInteger(n) || n < 0 || n >= 1000) return String(n)
  if (n < 20) return ONES[n]
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '')
  const rest = n % 100
  return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` and ${numberWords(rest)}` : ''}`
}
