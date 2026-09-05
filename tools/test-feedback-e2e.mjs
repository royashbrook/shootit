// does a run teach the verb? in a real browser: start level 1, require the
// "slide to steer" cue under the crowd before any touch, slide once, require
// it gone. two screenshots land next to the log for a human to look at.
//
//   node tools/test-feedback-e2e.mjs
//
// needs playwright, which is not a dependency of the game. point PLAYWRIGHT_ROOT
// at any project that has it installed (a package.json next to a node_modules).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const ROOT = new URL('..', import.meta.url).pathname

let chromium
try {
  const require = createRequire(join(process.env.PLAYWRIGHT_ROOT ?? ROOT, 'package.json'))
  ;({ chromium } = require('playwright-core'))
} catch {
  console.error('playwright-core not found. set PLAYWRIGHT_ROOT to a project that has playwright installed.')
  process.exit(2)
}

const server = spawn('node', ['tools/serve.mjs', '.', '0'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] })
const url = await new Promise(resolve => server.stdout.once('data', d => resolve(String(d).trim() + '/')))
const shots = mkdtempSync(join(tmpdir(), 'shootit-cue-'))

let failed = false
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failed = true
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.locator('#play').click()
  await page.waitForTimeout(400)
  const cue = () => page.locator('#board').getAttribute('data-cue')

  check((await cue()) === 'steer', `the steer cue is up before the first touch (data-cue=${JSON.stringify(await cue())})`)
  await page.screenshot({ path: join(shots, 'before-slide.png') })

  const box = await page.locator('#board').boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height * 0.8
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 60, y, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  check((await cue()) === null, `the cue is gone after one slide (data-cue=${JSON.stringify(await cue())})`)
  await page.screenshot({ path: join(shots, 'after-slide.png') })

  // gone for the session: a fresh run must not bring it back. the bottom
  // RETRY opens the pause sheet; the sheet's RETRY is the reset.
  await page.locator('#retry').click()
  await page.locator('#paused-retry').click({ timeout: 2000 })
  await page.waitForTimeout(400)
  check((await cue()) === null, 'a retry in the same session does not show the cue again')
  console.log(`shots: ${shots}`)
} finally {
  await browser.close()
  server.kill()
}
console.log(failed ? '\nfeedback e2e: FAIL' : '\nfeedback e2e: all checks passed')
process.exit(failed ? 1 : 0)
