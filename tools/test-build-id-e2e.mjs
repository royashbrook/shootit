// does a content-only deploy reach a returning player on the FIRST tap of the
// update banner? the real thing, in a browser: serve a scratch copy with
// tools/serve.mjs, load it so the service worker installs and caches the shell,
// change app.js only, "deploy" (run the same stamp the workflow runs), let the
// banner notice, tap it once, and require the very next document to run the
// NEW app.js with only the new cache left.
//
//   npm run test:e2e
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
const deploy = id => `stamped ${stamp(id, copy).join(', ')}`

console.log(`deploy 1: ${deploy('aaaaaaa')}`)
const server = spawn('node', ['tools/serve.mjs', '.', '0'], { cwd: copy, stdio: ['ignore', 'pipe', 'inherit'] })
const url = await new Promise(resolve => server.stdout.once('data', d => resolve(String(d).trim() + '/')))

const settle = async page => {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await page.waitForTimeout(600)
}
const state = async page => `title=${await page.title()} caches=${await page.evaluate(() => caches.keys())}`

let failed = false
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(async () => (await caches.keys()).length > 0)
  await page.reload({ waitUntil: 'networkidle' })
  await settle(page)
  console.log(`returning player on build 1: ${await state(page)}`)

  const app = join(copy, 'app.js')
  writeFileSync(app, `document.title = 'CHANGED-APP-JS'\n` + readFileSync(app, 'utf8'))
  console.log(`deploy 2 (app.js changed): ${deploy('bbbbbbb')}`)

  // the banner checks on a return to the tab, so fake one rather than wait 5 minutes
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.locator('#update').waitFor({ state: 'visible', timeout: 5000 })
  console.log(`banner shown: ${await state(page)}`)

  let loads = 0
  page.on('load', () => { loads++ })
  const loaded = page.waitForEvent('load', { timeout: 10000 })
  await page.locator('#update').click()
  await loaded
  await settle(page)
  // the old cache goes on activate, which can trail the new document by a beat
  await page.waitForFunction(async () => (await caches.keys()).length === 1, null, { timeout: 3000 }).catch(() => {})
  const title = await page.title()
  const cacheKeys = await page.evaluate(() => caches.keys())
  console.log(`after one tap (${loads} load): ${await state(page)}`)

  failed = title !== 'CHANGED-APP-JS' || loads !== 1 || cacheKeys.join() !== 'shootit-bbbbbbb'
  console.log(failed
    ? `FAIL: one tap on the banner did not land the new app.js (title ${JSON.stringify(title)}, caches ${cacheKeys.join(',')}, ${loads} load)`
    : 'ok: the first tap on the banner ran the new app.js with only the new cache left')
} finally {
  await browser.close()
  server.kill()
  rmSync(copy, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
