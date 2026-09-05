// does a content-only deploy reach a returning player? the real thing, in a
// browser: serve a scratch copy with tools/serve.mjs, load it so the service
// worker installs and caches the shell, change app.js only, "deploy" (run the
// same stamp the workflow runs), reload twice, and require the NEW app.js to be
// the one running.
//
//   npm run test:e2e
//   node tools/test-build-id-e2e.mjs --no-stamp   # the old ritual: deploy without a stamp
//
// needs playwright, which is not a dependency of the game. point PLAYWRIGHT_ROOT
// at any project that has it installed (a package.json next to a node_modules).
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { stamp } from './stamp-build.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const NO_STAMP = process.argv.includes('--no-stamp')

let chromium
try {
  const require = createRequire(join(process.env.PLAYWRIGHT_ROOT ?? ROOT, 'package.json'))
  ;({ chromium } = require('playwright-core'))
} catch {
  console.error('playwright-core not found. set PLAYWRIGHT_ROOT to a project that has playwright installed.')
  process.exit(2)
}

const copy = mkdtempSync(join(tmpdir(), 'shootit-e2e-'))
cpSync(ROOT, copy, { recursive: true, filter: p => !p.includes('/.git') && !p.includes('/node_modules') })
const deploy = id => (NO_STAMP ? 'no stamp' : `stamped ${stamp(id, copy).join(', ')}`)

console.log(`deploy 1: ${deploy('aaaaaaa')}`)
const server = spawn('node', ['tools/serve.mjs', '.', '0'], { cwd: copy, stdio: ['ignore', 'pipe', 'inherit'] })
const url = await new Promise(resolve => server.stdout.once('data', d => resolve(String(d).trim() + '/')))

const settle = async page => {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await page.waitForTimeout(600)
}

let failed = false
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(async () => (await caches.keys()).length > 0)
  await page.reload({ waitUntil: 'networkidle' })
  await settle(page)
  console.log(`returning player on build 1: title=${await page.title()} caches=${await page.evaluate(() => caches.keys())}`)

  const app = join(copy, 'app.js')
  writeFileSync(app, `document.title = 'CHANGED-APP-JS'\n` + readFileSync(app, 'utf8'))
  console.log(`deploy 2 (app.js changed): ${deploy('bbbbbbb')}`)

  for (let i = 1; i <= 2; i++) {
    await page.reload({ waitUntil: 'networkidle' })
    await settle(page)
    console.log(`reload ${i}: title=${await page.title()} caches=${await page.evaluate(() => caches.keys())}`)
  }
  const title = await page.title()
  failed = title !== 'CHANGED-APP-JS'
  console.log(failed ? `FAIL: after two reloads the old app.js still runs (title ${JSON.stringify(title)})` : 'ok: the new app.js reached the returning player')
} finally {
  await browser.close()
  server.kill()
  rmSync(copy, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
