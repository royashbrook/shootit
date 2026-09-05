// the build id is the cache bust. this proves the pieces fit:
//   - stamp-build rewrites a fixture copy of the shell (the same code the deploy runs)
//   - the stamped sw.js really opens a cache named after the build id (run in a vm)
//   - the deploy workflow stamps AFTER the gates and BEFORE the upload
//
//   node tools/test-build-id.mjs
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import { stamp } from './stamp-build.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const ID = 'abc1234'
let failed = 0
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failed++
}

const dir = mkdtempSync(join(tmpdir(), 'shootit-stamp-'))
try {
  for (const file of ['sw.js', 'index.html']) cpSync(join(ROOT, file), join(dir, file))

  const before = readFileSync(join(dir, 'sw.js'), 'utf8')
  check(before.includes("'shootit-dev'"), 'the checked-in sw.js carries the dev cache name')
  check(readFileSync(join(dir, 'index.html'), 'utf8').includes('<span id="build">dev</span>'), 'the checked-in about dialog carries the dev build id')

  try {
    stamp(ID, dir)
  } catch (error) {
    check(false, `stamp: ${error.message}`)
  }
  const sw = readFileSync(join(dir, 'sw.js'), 'utf8')
  const html = readFileSync(join(dir, 'index.html'), 'utf8')
  check(sw.includes(`'shootit-${ID}'`) && !sw.includes("'shootit-dev'"), `stamp rewrote the sw cache name to shootit-${ID}`)
  check(html.includes(`<span id="build">${ID}</span>`), `stamp rewrote the about build id to ${ID}`)

  // run the stamped worker: the name it opens on install is the name that matters
  const opened = []
  const handlers = {}
  const context = {
    caches: {
      open: name => { opened.push(name); return Promise.resolve({ add: () => Promise.resolve() }) },
      keys: () => Promise.resolve([]),
      match: () => Promise.resolve(undefined),
    },
    URL,
    Promise,
    fetch: () => Promise.reject(new Error('offline')),
  }
  context.self = {
    addEventListener: (type, fn) => { handlers[type] = fn },
    skipWaiting: () => {},
    clients: { claim: () => Promise.resolve() },
    location: { origin: 'http://localhost' },
  }
  runInContext(sw, createContext(context))
  handlers.install?.({ waitUntil: () => {} })
  check(opened[0] === `shootit-${ID}`, `the stamped worker opens cache shootit-${ID} on install (got ${JSON.stringify(opened)})`)

  let bad = false
  try { stamp('not a sha', dir) } catch { bad = true }
  check(bad, 'a malformed build id is refused')
} finally {
  rmSync(dir, { recursive: true, force: true })
}

const workflow = readFileSync(join(ROOT, '.github/workflows/deploy-site.yml'), 'utf8')
const at = s => workflow.indexOf(s)
check(at('stamp-build.mjs') > 0, 'the deploy workflow stamps the build id')
check(at('stamp-build.mjs') > at('npm run verify') && at('stamp-build.mjs') > at('npm run lint'), 'the stamp runs after the verify and lint gates')
check(at('stamp-build.mjs') < at('wrangler deploy'), 'the stamp runs before the upload')
check(workflow.includes('rev-parse --short'), 'the stamped id is the short commit sha')

console.log(failed ? `\n${failed} check(s) failed` : '\nbuild id: all checks passed')
process.exit(failed ? 1 : 0)
