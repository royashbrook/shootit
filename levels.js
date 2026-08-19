// the campaign: 600 levels laid out from their level number, plus the daily.
//
// EVERY constant here is load-bearing for determinism — level 217 must be the
// same run on every phone forever, and the daily is the same worldwide.
// change constants after release and you silently replace everyone's game.
// add levels at the end; do not touch the mixing maths. (same policy as the
// sibling game Sort It, and it worked there.)
import { rng } from './seed.js'
import { runBot, applyOp } from './sim.js'

export const LEVEL_COUNT = 600
export const WORLD_SIZE = 20
export const WORLD_COUNT = LEVEL_COUNT / WORLD_SIZE
export const START_COUNT = 5

// difficulty knobs per level. hand-shaped opening, then a slow ramp with a
// breather after each boss-heavy world-ender.
export function paramsFor(n) {
  const world = Math.floor((n - 1) / WORLD_SIZE)          // 0-based
  const inWorld = (n - 1) % WORLD_SIZE                    // 0..19
  const ramp = Math.min(1, world / 12 + inWorld / 60)     // 0..1 difficulty
  return {
    gates: Math.min(7, 2 + Math.floor(world / 2) + (inWorld >= 12 ? 1 : 0)),
    packs: Math.min(8, 1 + Math.floor(world / 3) + (inWorld >= 6 ? 1 : 0) + (inWorld >= 15 ? 1 : 0)),
    packScale: 0.22 + 0.26 * ramp,    // pack size as a fraction of expected crowd
    bossFactor: 2.2 + 2.2 * ramp,     // boss hp as a multiple of expected crowd
    traps: world >= 2,                // gates where BOTH sides cost you
    divisors: world >= 1,             // ÷ and − show up from world 2 on
    ender: inWorld === WORLD_SIZE - 1 // world-ender: buffer boss
  }
}

// stable integer mixing for (level, salt) -> seed. frozen forever, see header.
export function levelSeed(n, salt) {
  return (Math.imul(n, 2246822519) ^ Math.imul(salt + 1, 2654435761) ^ 0x85ebca6b) >>> 0
}

function pick(random, options) {
  return options[Math.floor(random() * options.length)]
}

// one gate pair. `expected` is the greedy bot's crowd walking in; the return
// carries the layout plus the bot's crowd walking out, which the rest of the
// generator balances against.
function makeGate(random, expected, params) {
  const boostOps = [
    { op: 'x', k: 2 },
    { op: 'x', k: 2 },
    { op: 'x', k: 3 },
    { op: '+', k: 5 + Math.floor(random() * 20) },
  ]
  const dragOps = [
    { op: '/', k: 2 },
    { op: '-', k: 4 + Math.floor(random() * 12) },
  ]
  let left
  let right
  if (params.traps && random() < 0.22) {
    // trap pair: both cost you, pick the LESS bad one (÷2 vs −k, real choice)
    left = pick(random, dragOps)
    right = pick(random, dragOps)
  } else {
    left = pick(random, boostOps)
    right = params.divisors && random() < 0.45 ? pick(random, dragOps) : pick(random, boostOps)
  }
  // shuffle sides so "good is always left" never becomes a habit
  if (random() < 0.5) [left, right] = [right, left]
  const out = Math.max(applyOp(expected, left), applyOp(expected, right))
  return { left, right, out }
}

// deal a full level layout from a seed. pure function of (seed, params).
// exported for tools/tune.mjs; the game itself only uses levelFor/seedLevel.
export function makeLevel(seed, params) {
  const random = rng(seed)
  const gates = []
  const packs = []
  let expected = START_COUNT
  let y = 420

  const segments = params.gates + params.packs
  const order = []
  for (let i = 0; i < params.gates; i++) order.push('gate')
  for (let i = 0; i < params.packs; i++) order.push('pack')
  // interleave deterministically: gate first, then alternate as evenly as the
  // counts allow (fisher-yates would cluster packs; kids read rhythm better)
  order.sort(() => 0) // keep stable; explicit interleave below
  const laid = []
  let g = 0
  let p = 0
  for (let i = 0; i < segments; i++) {
    const wantGate = (g / params.gates) <= (p / params.packs) && g < params.gates
    if (wantGate) { laid.push('gate'); g++ } else { laid.push('pack'); p++ }
  }

  for (const kind of laid) {
    if (kind === 'gate') {
      const gate = makeGate(random, expected, params)
      gates.push({ y, left: gate.left, right: gate.right })
      expected = gate.out
      y += 300 + Math.floor(random() * 140)
    } else {
      // a pack the bot's crowd can absorb even with lazy dodging. the hard
      // cap matters: firepower caps at maxShooters, so a pack that scales
      // with an unbounded crowd would out-eat any possible gun line.
      const n = Math.min(80, Math.max(3, Math.floor(expected * params.packScale + random() * 4)))
      const x = Math.floor((random() * 2 - 1) * 26)
      packs.push({ y, x, n, kind: Math.floor(random() * 3) })
      expected = Math.max(1, expected - Math.floor(n * 0.35)) // pessimistic melee estimate
      y += 260 + Math.floor(random() * 120)
    }
  }

  // same logic for the boss cap: ~95 dps absolute ceiling means hp must stay
  // inside what a healthy crowd can pour out before it gets chewed down.
  const bossHp = Math.max(18, Math.min(340, Math.floor(Math.min(expected, 200) * params.bossFactor)))
  const boss = { y: y + 320, hp: bossHp, hpMax: bossHp, kind: 0 }
  return { start: START_COUNT, gates, packs, boss, length: boss.y + 200 }
}

// walk salts until the bot proves the level. deterministic: every device
// walks the same salts and stops at the same layout. verify-levels.mjs
// asserts the walk terminates fast for every shipped level.
const MAX_SALT = 32

function findLevel(params, seedFor) {
  for (let salt = 0; salt < MAX_SALT; salt++) {
    const level = makeLevel(seedFor(salt), params)
    const result = runBot(level)
    if (result.phase === 'won' && result.count >= 2) return { level, salt, bot: result }
  }
  throw new Error('no beatable layout found') // verify proves unreachable
}

export function levelFor(n) {
  const params = paramsFor(n)
  const found = findLevel(params, salt => levelSeed(n, salt))
  return { kind: 'level', n, params, ...found }
}

// the daily (and any shared ?seed= board): mid-campaign difficulty.
export function seedLevel(seed) {
  const random = rng(seed)
  const n = 120 + Math.floor(random() * 160) // params borrowed from mid-game
  const params = paramsFor(n)
  const found = findLevel(params, salt => (Math.imul(seed, 40503) ^ Math.imul(salt + 1, 3266489917)) >>> 0)
  return { kind: 'seed', seed, params, ...found }
}
