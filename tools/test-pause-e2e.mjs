// does a pause really stop the clock? in a real browser: start level 1, tap
// PAUSE mid-run, wait, and require the canvas and the buddy count untouched
// (the canvas is redrawn from the sim every frame, so an identical bitmap
// means no sim step ran). resume and require them to move again. then hide
// the page (document.hidden mocked, visibilitychange dispatched) and require
// the same freeze with no tap at all. last, the bottom RETRY must open the
// sheet, not reset the run.
//
//   node tools/test-pause-e2e.mjs
//
// needs playwright, which is not a dependency of the game. point PLAYWRIGHT_ROOT
// at any project that has it installed (a package.json next to a node_modules).
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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

let failed = false
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failed = true
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true })
  const snap = () => page.evaluate(() => ({
    frame: document.getElementById('board').toDataURL(),
    count: document.getElementById('count').textContent,
  }))
  const same = (a, b) => a.frame === b.frame && a.count === b.count
  const sheet = () => page.locator('#paused').isVisible()
  // a missing button is a finding, not a 30s hang
  const tap = sel => page.locator(sel).click({ timeout: 2000 }).catch(() => check(false, `nothing to tap at ${sel}`))

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.locator('#play').click()
  await page.waitForTimeout(1500)

  // 1. the chip
  const chip = page.locator('#pause')
  check(await chip.count() === 1, 'a PAUSE chip is in the run hud')
  if (await chip.count() === 1) {
    const box = await chip.boundingBox()
    check(box.height >= 44 && box.width >= 44, `the chip is thumb-sized (${Math.round(box.width)}x${Math.round(box.height)})`)
    const retry = await page.locator('#retry').boundingBox()
    check(Math.abs(retry.x - (box.x + box.width)) > 44, 'PAUSE is not next to RETRY')
    await chip.click()
  }
  check(await sheet(), 'the pause sheet is up')
  await page.screenshot({ path: join(tmpdir(), 'shootit-pause-sheet.png') })
  const a = await snap()
  await page.waitForTimeout(3000)
  const b = await snap()
  check(same(a, b), `3s paused: canvas and count unchanged (count ${a.count} -> ${b.count})`)

  await tap('#resume')
  await page.waitForTimeout(700)
  const c = await snap()
  check(!(await sheet()), 'the sheet is gone after RESUME')
  check(!same(b, c), `the run moves again after RESUME (count ${b.count} -> ${c.count})`)

  // 2. a hidden tab
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { get: () => true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(100)
  const d = await snap()
  await page.waitForTimeout(2000)
  const e = await snap()
  check(same(d, e), `2s hidden: no sim time passed (count ${d.count} -> ${e.count})`)
  check(await sheet(), 'the sheet is up after the page was hidden')
  await page.evaluate(() => { delete document.hidden })

  // 3. the bottom RETRY is a sheet, not a reset
  await tap('#resume')
  await page.waitForTimeout(300)
  const before = await snap()
  await tap('#retry')
  await page.waitForTimeout(300)
  const after = await snap()
  check(await sheet() && after.count === before.count, `RETRY opened the sheet and kept the run (count ${before.count} -> ${after.count})`)
} finally {
  await browser.close()
  server.kill()
}
console.log(failed ? '\npause e2e: FAIL' : '\npause e2e: all checks passed')
process.exit(failed ? 1 : 0)
