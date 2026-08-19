// a static server for local play, so `npm run serve` needs nothing installed and
// no python. the checker has its own copy of this on an ephemeral port.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, normalize, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? 'template')
const port = Number(process.argv[3] ?? 4310)
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (path.endsWith('/')) path += 'index.html'
  try {
    const file = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ''))
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(port, () => console.log(`http://localhost:${port}`))
