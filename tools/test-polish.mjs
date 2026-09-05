// the small things, pinned: the win sheet's par line, the first world's
// form, the hud text floor, the honest readme line, the about sentence.
//
//   node tools/test-polish.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { THEMES } from '../art.js'
import { levelFor } from '../levels.js'

const ROOT = new URL('..', import.meta.url).pathname
const read = f => readFileSync(join(ROOT, f), 'utf8')
let failed = 0
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failed++
}

// win sheet par line. imported late so a missing module reads as a FAIL line
let winDetail = null
try { ({ winDetail } = await import('../wintext.js')) } catch { /* reported below */ }
check(typeof winDetail === 'function', 'wintext.js exports winDetail')
if (winDetail) {
  const par = levelFor(1).bot.count
  check(par > 0, `level 1 ships with the bot's own result as par (${par})`)
  check(winDetail({ count: par, par, best: null }) === `${par} buddies made it! right on par ${par}.`, 'matching par says so')
  check(winDetail({ count: 40, par: 36, best: null }) === '40 buddies made it! you beat par 36!', 'beating par says so')
  check(winDetail({ count: 30, par: 36, best: null }) === '30 buddies made it! par is 36.', 'under par names the par')
  check(winDetail({ count: 40, par: 36, best: 38 }) === '40 buddies made it, your best yet! you beat par 36!', 'a new best keeps its line')
  check(winDetail({ count: 30, par: 36, best: 38 }) === '30 buddies made it. your best is 38. par is 36.', 'an old best keeps its line')
}

// world 1 reads as slimes
check(THEMES[0].form === 'drippy', `world 1 wears the drippy form (${THEMES[0].form})`)
check(new Set(THEMES.map(t => t.form)).size === THEMES.length, 'every world still has its own form')

// hud text floor
const css = read('app.css')
const chip = css.match(/\.chip \{[^}]*font-size: ([\d.]+)rem/)?.[1]
const small = css.match(/\.small \{[^}]*font-size: ([\d.]+)rem/)?.[1]
check(Number(chip) >= 0.9, `.chip text is at least .9rem (${chip})`)
check(Number(small) >= 0.9, `.small text is at least .9rem (${small})`)

// the readme says what is true about requests
const readme = read('README.md')
check(!readme.includes('zero requests to anyone'), 'readme no longer claims zero requests')
check(/beacon/.test(readme), 'readme names the beacon')

// about says what the game is
const html = read('index.html')
const about = html.slice(html.indexOf('<dialog id="about">'), html.indexOf('</dialog>', html.indexOf('<dialog id="about">')))
check(/Shoot It is a/.test(about), 'about opens with what the game is')

console.log(failed ? `\n${failed} check(s) failed` : '\npolish: all checks passed')
process.exit(failed ? 1 : 0)
