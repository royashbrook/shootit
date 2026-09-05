// in-run feedback, headless: drive level 1 with the greedy bot through the
// real sim and check that fx.js throws a floaty with the gate's value on
// every gate pass and lights a pack for a beat when a damage tick lands.
//
//   node tools/test-feedback.mjs
import { levelFor } from '../levels.js'
import { createSim, step, botInput, applyOp } from '../sim.js'
import { createFx, floatLabel, FLOAT_LIFE, FLASH_LIFE } from '../fx.js'

let failed = 0
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failed++
}

check(floatLabel(13) === '+13' && floatLabel(-6) === '-6' && floatLabel(0) === '0', 'labels: +13, -6, 0')

const { level } = levelFor(1)
const sim = createSim(level)
const fx = createFx()
const seen = []          // [label, expected] per gate pass
let firstFlash = null    // the first pack lit, and the step it lit on
let lit = 0
for (let i = 0; i < 60 * 120 && sim.phase === 'run'; i++) {
  const before = sim.count
  const taken = sim.gatesTaken.length
  step(sim, botInput(sim))
  fx.afterStep(sim, before)
  if (sim.gatesTaken.length > taken) {
    const gate = sim.gates.filter(g => g.used)[taken]
    const expected = floatLabel(applyOp(before, gate[sim.gatesTaken[taken]]) - before)
    seen.push([fx.floats[fx.floats.length - 1]?.text, expected])
  }
  for (const p of sim.packs) {
    if (fx.flashing(p)) {
      lit++
      if (!firstFlash) firstFlash = { p, hits: p.hits, i }
    }
  }
  fx.tick(1 / 60)
}

check(sim.phase === 'won', `the bot won level 1 (${sim.phase})`)
check(seen.length === level.gates.length, `one floaty per gate pass (${seen.length} of ${level.gates.length})`)
check(seen.every(([got, want]) => got === want), `every floaty carries the gate's own value (${seen.map(s => s[0]).join(' ')})`)
check(firstFlash !== null && firstFlash.hits > 0, `a pack lit up on its first damage tick (step ${firstFlash?.i}, hits ${firstFlash?.hits})`)
check(lit > 0, `packs were lit for ${lit} steps in total`)

// lifetimes, on a scratch fx so the numbers are exact
const scratch = createFx()
const fake = { gatesTaken: ['left'], gates: [{ used: true, left: { op: '+', k: 13 } }], packs: [{ hits: 1 }] }
scratch.afterStep(fake, 5)
check(scratch.floats.length === 1 && scratch.floats[0].text === '+13' && scratch.floats[0].good, 'a +13 gate on 5 buddies floats "+13" as a good one')
check(scratch.flashing(fake.packs[0]), 'a pack with a new hit is flashing')
scratch.tick(FLASH_LIFE / 2)
check(scratch.flashing(fake.packs[0]), 'still flashing halfway through the flash')
scratch.tick(FLASH_LIFE)
check(!scratch.flashing(fake.packs[0]), 'flash is out after FLASH_LIFE')
check(scratch.floats.length === 1, 'the floaty outlives the flash')
scratch.tick(FLOAT_LIFE)
check(scratch.floats.length === 0, 'the floaty is gone after FLOAT_LIFE')
scratch.afterStep(fake, 5)
check(scratch.floats.length === 0 && !scratch.flashing(fake.packs[0]), 'the same gate and the same hit do not fire twice')

console.log(failed ? `\n${failed} check(s) failed` : '\nfeedback: all checks passed')
process.exit(failed ? 1 : 0)
