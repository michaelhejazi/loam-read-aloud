// The few HTTP helpers this server needs, with no library: a JSON answer, a
// body read whole up to a limit, and a file sent whole or as one byte range.
// Loam's plugin gateway hands each request over with `Connection: close`, so
// every answer here is the last on its connection.

import fs from 'node:fs'

export function sendJson(res, status, value, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers })
  res.end(JSON.stringify(value))
}

// With a `limit`, a body over it is read to its end and dropped, and the
// answer is `null`: the page gets a sentence rather than a connection cut.
export function readRaw(req, limit = Infinity) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size <= limit) chunks.push(chunk)
    })
    req.on('end', () => resolve(size > limit ? null : Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function dec(segment) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

// A file, whole or the one byte range asked for. A media element seeks with
// `Range`, so this is what lets a long reply be scrubbed without fetching it
// all first. Several ranges in one request are answered with the whole file,
// which the standard allows; an unsatisfiable one is a 416.
export function sendFileRange(req, res, file, size, type) {
  const headers = {
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600',
  }
  let start = 0
  let end = size - 1
  let status = 200
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? '').trim())
  if (range && (range[1] !== '' || range[2] !== '')) {
    if (range[1] === '') {
      start = Math.max(0, size - Number(range[2]))
    } else {
      start = Number(range[1])
      if (range[2] !== '') end = Math.min(end, Number(range[2]))
    }
    if (start > end || start >= size) {
      res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` })
      return res.end()
    }
    status = 206
    headers['content-range'] = `bytes ${start}-${end}/${size}`
  }
  headers['content-length'] = String(size === 0 ? 0 : end - start + 1)
  res.writeHead(status, headers)
  if (req.method === 'HEAD' || size === 0) return res.end()
  const stream = fs.createReadStream(file, { start, end })
  stream.on('error', () => res.destroy())
  stream.pipe(res)
}

// One JSON line per event on stdout, which Loam's unit sends to the journal.
// `level` is `debug`, `info` (the default) or `off`.
export function createLog({ level = 'info', write = (line) => process.stdout.write(line + '\n') } = {}) {
  const at = (name) => (fields) => {
    if (level === 'off' || (name === 'debug' && level !== 'debug')) return
    write(JSON.stringify({ at: new Date().toISOString(), level: name, ...fields }))
  }
  return { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') }
}

// A key from the file Loam writes for this plugin (`LOAM_PLUGIN_KEYS`):
// `NAME=value` lines, read fresh on every ask, so a key saved or changed in
// Settings › Connections › API keys is used at once with no restart.
export function keyFrom(file, name) {
  return async () => {
    if (!file) return ''
    let text
    try {
      text = await fs.promises.readFile(file, 'utf8')
    } catch {
      return ''
    }
    for (const line of text.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0 && !line.startsWith('#') && line.slice(0, eq).trim() === name) return line.slice(eq + 1).trim()
    }
    return ''
  }
}
