// in-run feedback state: the floaty a gate pass throws up ("+13", "-6") and
// the flash a slime pack shows when a damage tick lands. pure data with no
// canvas in it, so node can test the spawn rules and game.js only draws.
import { applyOp } from './sim.js'

export const FLOAT_LIFE = 0.9    // seconds a floaty rises and fades
export const FLASH_LIFE = 0.12   // seconds a hit pack stays lit

export function floatLabel(gained) {
  return gained > 0 ? `+${gained}` : String(gained)
}

export function createFx() {
  const floats = []
  const flashes = new Map()   // pack -> seconds of flash left
  const hitsSeen = new Map()  // pack -> hits already flashed
  let gatesSeen = 0
  return {
    floats,
    // call right after every sim step with the crowd count that went in.
    // the label is the gate's own effect on that count, not the frame's net
    // change, so a melee bite in the same tick cannot muddle the number.
    afterStep(sim, countBefore) {
      if (sim.gatesTaken.length > gatesSeen) {
        gatesSeen = sim.gatesTaken.length
        const gate = sim.gates.filter(g => g.used)[gatesSeen - 1]
        const side = sim.gatesTaken[gatesSeen - 1]
        const gained = applyOp(countBefore, gate[side]) - countBefore
        floats.push({ text: floatLabel(gained), good: gained >= 0, t: 0 })
      }
      for (const p of sim.packs) {
        const seen = hitsSeen.get(p) ?? 0
        if (p.hits > seen) flashes.set(p, FLASH_LIFE)
        hitsSeen.set(p, p.hits)
      }
    },
    tick(dt) {
      for (const f of floats) f.t += dt
      for (let i = floats.length - 1; i >= 0; i--) if (floats[i].t >= FLOAT_LIFE) floats.splice(i, 1)
      for (const [p, left] of flashes) {
        if (left - dt <= 0) flashes.delete(p)
        else flashes.set(p, left - dt)
      }
    },
    flashing: p => flashes.has(p),
  }
}
