// proves every shipped level before anyone plays it:
//   - the greedy bot WINS all 600 campaign levels (and finishes with crowd
//     to spare) inside the same salt walk the phone performs
//   - the hands-off bot (never steers) LOSES every level from
//     HANDS_OFF_LOSES_FROM on: the game must not play itself
//   - the daily is beatable (and not hands-off-winnable) for years of dates ahead
//   - generation + simulation are deterministic: two full passes must agree
//     bit-for-bit on layout and final sim state, for both bots
//
// both bots are re-run HERE on the returned layouts, so this is a check on the
// generator's promise, not a restatement of it.
//
//   node tools/verify-levels.mjs            # levels + a decade of dailies
//   node tools/verify-levels.mjs --days=30  # quicker daily sweep
import { LEVEL_COUNT, HANDS_OFF_LOSES_FROM, levelFor, seedLevel } from '../levels.js'
import { runBot, handsOffInput } from '../sim.js'
import { dailySeed } from '../seed.js'

const daysArg = process.argv.find(a => a.startsWith('--days='))
const parsedDays = daysArg ? Number(daysArg.split('=')[1]) : NaN
// default sweeps a DECADE: review found real dates (2030-07-27, 2036-01-11)
// where a 32-salt walk exhausted, one year past the old 3-year horizon.
const DAYS = Number.isInteger(parsedDays) && parsedDays > 0 ? parsedDays : 10 * 365
if (daysArg && !(Number.isInteger(parsedDays) && parsedDays > 0)) {
  console.error(`bad --days value: ${daysArg}, a typo must not verify nothing`)
  process.exit(1)
}

// salt headroom: shipping content must never sit close to the MAX_SALT wall.
const CAMPAIGN_SALT_CEILING = 64
const DAILY_SALT_CEILING = 128

const started = Date.now()
let maxSalt = 0
let worst = null
let minFinal = Infinity
let closest = null
const greedyLost = []
const handsOffWon = []

const fingerprint = (level, bot, lazy) =>
  JSON.stringify([level.gates, level.packs, level.boss, bot.count, bot.t, lazy.phase, lazy.count, lazy.t])

function prove(level) {
  return { bot: runBot(level), lazy: runBot(level, handsOffInput) }
}

const fingerprints = []
for (let n = 1; n <= LEVEL_COUNT; n++) {
  const t0 = Date.now()
  const { level, salt } = levelFor(n)
  const { bot, lazy } = prove(level)
  const ms = Date.now() - t0
  fingerprints.push(fingerprint(level, bot, lazy))
  if (bot.phase !== 'won') greedyLost.push(n)
  if (lazy.phase !== 'lost') handsOffWon.push(n)
  if (salt > maxSalt) maxSalt = salt
  if (!worst || ms > worst.ms) worst = { n, ms }
  if (bot.count < minFinal) { minFinal = bot.count; closest = n }
}
console.log(`levels: ${LEVEL_COUNT - greedyLost.length}/${LEVEL_COUNT} greedy-beatable${greedyLost.length ? ` (LOST: ${greedyLost.join(' ')})` : ''}`)
console.log(`  max salt walked: ${maxSalt}, tightest win: ${minFinal} buddies left (level ${closest})`)
console.log(`  slowest generate+prove: level ${worst.n} at ${worst.ms}ms`)
const handsOffRange = handsOffWon.length ? `${handsOffWon[0]}..${handsOffWon[handsOffWon.length - 1]} (${handsOffWon.length} levels)` : 'none'
console.log(`  hands-off wins: ${handsOffRange}, must lose from level ${HANDS_OFF_LOSES_FROM} on`)
if (greedyLost.length) {
  console.error('the greedy bot must win every level')
  process.exit(1)
}
const handsOffTooFar = handsOffWon.filter(n => n >= HANDS_OFF_LOSES_FROM)
if (handsOffTooFar.length) {
  console.error(`the game plays itself: hands-off wins ${handsOffTooFar.slice(0, 20).join(' ')}${handsOffTooFar.length > 20 ? ' ...' : ''}`)
  process.exit(1)
}
if (maxSalt >= CAMPAIGN_SALT_CEILING) {
  console.error(`campaign salt ${maxSalt} is over the ${CAMPAIGN_SALT_CEILING} headroom ceiling`)
  process.exit(1)
}

for (let n = 1; n <= LEVEL_COUNT; n++) {
  const { level } = levelFor(n)
  const { bot, lazy } = prove(level)
  if (fingerprint(level, bot, lazy) !== fingerprints[n - 1]) {
    console.error(`NONDETERMINISTIC at level ${n}`)
    process.exit(1)
  }
}
console.log('  determinism: second pass identical (layout AND both sim outcomes)')

let dailyWorstMs = 0
let dailyMaxSalt = 0
let dailyMaxSaltDate = null
const start = new Date()
for (let d = 0; d < DAYS; d++) {
  const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d)
  const t0 = Date.now()
  const { level, salt } = seedLevel(dailySeed(date))
  const { bot, lazy } = prove(level)
  const ms = Date.now() - t0
  if (bot.phase !== 'won' || lazy.phase !== 'lost') {
    console.error(`daily ${date.toISOString().slice(0, 10)}: greedy ${bot.phase}, hands-off ${lazy.phase}`)
    process.exit(1)
  }
  if (ms > dailyWorstMs) dailyWorstMs = ms
  if (salt > dailyMaxSalt) { dailyMaxSalt = salt; dailyMaxSaltDate = date }
}
console.log(`dailies: ${DAYS} days from today beatable and not hands-off-winnable, slowest ${dailyWorstMs}ms`)
console.log(`  deepest daily salt: ${dailyMaxSalt}${dailyMaxSaltDate ? ` (${dailyMaxSaltDate.toISOString().slice(0, 10)})` : ''}`)
if (dailyMaxSalt >= DAILY_SALT_CEILING) {
  console.error(`daily salt ${dailyMaxSalt} is over the ${DAILY_SALT_CEILING} headroom ceiling`)
  process.exit(1)
}
console.log(`total: ${((Date.now() - started) / 1000).toFixed(1)}s`)
