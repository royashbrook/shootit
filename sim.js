// the simulation. one pure fixed-timestep update shared verbatim between the
// browser (game.js drives it with the kid's finger) and node
// (tools/verify-levels.mjs drives it with the greedy bot). that sharing IS
// the beatability guarantee, so the rules here are strict:
//
//   - no Math.random, no Date: all layout comes in via the level object
//   - only IEEE-exact operations (+ - * / min max floor abs, sqrt): no
//     sin/exp/pow whose last bit varies by engine. node proving a level
//     winnable must mean the phone agrees bit-for-bit.
//   - DT is fixed; the renderer accumulates real time into whole steps.

export const DT = 1 / 60

// tuning constants. balance-affecting values live HERE, in one block, because
// levels are verified against them: retune ⇒ rerun verify before shipping.
export const RULES = {
  laneHalf: 40,          // crowd centre clamp; the drawn lane is a bit wider
  runSpeed: 138,         // forward units/sec
  steerSpeed: 170,       // sideways units/sec toward the finger
  fireRange: 400,        // how far ahead the crowd shoots
  fireRate: 1.35,        // damage/sec per shooter (a slime has `hp` of it)
  maxShooters: 70,       // big crowds cap their firepower, not their charm
  chargeRange: 300,      // enemies wake up when the crowd is this close
  chargeSpeed: 200,      // enemy charge, faster than the crowd runs
  meleeRate: 26,         // mutual knockouts/sec when a pack reaches the crowd
  contactDist: 34,       // "reached the crowd" distance
  bossEatRate: 16,       // units/sec a boss chews while in contact
  bossChargeSpeed: 82,
  bossRange: 380,
  maxCount: 999,
}

// a level layout (from levels.js): { length, start, gates, packs, boss }
//   gates: [{ y, left: {op, k}, right: {op, k} }]  ops: 'x' '+' '-' '/'
//   packs: [{ y, x, n, hp, kind }]   hp: per slime, so a pack survives a hit
//   boss:  { y, hp, kind }

export function applyOp(count, { op, k }) {
  if (op === 'x') count = count * k
  else if (op === '+') count = count + k
  else if (op === '-') count = count - k
  else if (op === '/') count = Math.floor(count / k)
  // gates tease, they never kill: the floor is 1, the ceiling keeps the
  // renderer and the balance sane
  return Math.max(1, Math.min(RULES.maxCount, count))
}

export function createSim(level) {
  return {
    t: 0,
    phase: 'run',                  // 'run' | 'won' | 'lost'
    count: level.start,
    x: 0,
    y: 0,
    kills: 0,
    gatesTaken: [],                // side per gate, for the bot and the log
    gates: level.gates.map(g => ({ ...g, used: false })),
    // wound: damage soaked by the front slime so far; hits: damage ticks
    // landed, for the renderer's flash (a hit that kills nothing is still a hit)
    packs: level.packs.map(p => ({ ...p, y: p.y, n: p.n, hp: p.hp ?? 1, wound: 0, hits: 0, charging: false, dead: 0 })),
    boss: { ...level.boss, x: 0, awake: false, contact: false },
    level,
    // fractional accumulators so kill rates keep exact fixed-point behaviour
    fireAcc: 0,
    meleeAcc: 0,
    eatAcc: 0,
  }
}

function nearestTarget(s) {
  let best = null
  let bestDist = RULES.fireRange
  for (const p of s.packs) {
    if (p.n <= 0) continue
    const d = p.y - s.y
    if (d >= -10 && d < bestDist) { best = p; bestDist = d }
  }
  const bd = s.boss.y - s.y
  if (s.boss.hp > 0 && bd >= -10 && bd < bestDist) return s.boss
  return best
}

// one fixed step. input: { targetX } — where the finger (or the bot) wants
// the crowd. returns the same sim object, mutated.
export function step(s, input) {
  if (s.phase !== 'run') return s

  s.t += DT

  // ---- steer + run
  // NaN guard: a zero-width layout rect can produce NaN targetX once, and
  // NaN is sticky through +=. one poisoned input must not poison the run.
  const asked = input.targetX === input.targetX ? input.targetX : 0
  const want = Math.max(-RULES.laneHalf, Math.min(RULES.laneHalf, asked))
  const dx = want - s.x
  const maxMove = RULES.steerSpeed * DT
  s.x += Math.max(-maxMove, Math.min(maxMove, dx))
  s.y += RULES.runSpeed * DT

  // ---- gates: pass through the arch on your side
  for (const g of s.gates) {
    if (!g.used && s.y >= g.y) {
      g.used = true
      const side = s.x < 0 ? 'left' : 'right'
      s.count = applyOp(s.count, g[side])
      s.gatesTaken.push(side)
    }
  }

  // ---- shooting: the crowd pours fire into the nearest thing ahead
  const target = nearestTarget(s)
  if (target) {
    const shooters = Math.min(s.count, RULES.maxShooters)
    s.fireAcc += shooters * RULES.fireRate * DT
    const dmg = Math.floor(s.fireAcc)
    if (dmg > 0) {
      s.fireAcc -= dmg
      if (target === s.boss) {
        s.boss.hp = Math.max(0, s.boss.hp - dmg)
      } else {
        // damage pours into the front slime; whole hp's worth pops one
        const soaked = target.wound + dmg
        const killed = Math.min(target.n, Math.floor(soaked / target.hp))
        target.wound = soaked - killed * target.hp
        target.hits += 1
        target.n -= killed
        target.dead += killed
        s.kills += killed
      }
    }
  } else {
    s.fireAcc = 0
  }

  // ---- enemy packs: wake, charge, melee
  for (const p of s.packs) {
    if (p.n <= 0) continue
    if (!p.charging && p.y - s.y < RULES.chargeRange) p.charging = true
    if (p.charging) {
      p.y -= RULES.chargeSpeed * DT
      // drift toward the crowd's column so dodging isn't a win button
      const pdx = s.x - p.x
      const drift = Math.max(-40 * DT, Math.min(40 * DT, pdx))
      p.x += drift
    }
    if (p.y - s.y < RULES.contactDist) {
      s.meleeAcc += RULES.meleeRate * DT
      const traded = Math.min(Math.floor(s.meleeAcc), p.n, s.count)
      if (traded > 0) {
        s.meleeAcc -= traded
        p.n -= traded
        p.dead += traded
        s.count -= traded
        s.kills += traded
      }
    }
  }

  // ---- boss
  const b = s.boss
  if (b.hp > 0) {
    if (!b.awake && b.y - s.y < RULES.bossRange) b.awake = true
    if (b.awake) {
      b.y -= RULES.bossChargeSpeed * DT
      // the boss parks at contact range instead of passing through: a boss
      // behind the crowd would be untargetable-but-still-eating, an unwinnable
      // slow drain no kid should ever watch. parked, the fight always resolves.
      const floor = s.y + RULES.contactDist - 4
      if (b.y < floor) b.y = floor
      const bdx = s.x - b.x
      const bdrift = Math.max(-30 * DT, Math.min(30 * DT, bdx))
      b.x += bdrift
    }
    b.contact = b.y - s.y < RULES.contactDist + 14
    if (b.contact) {
      s.eatAcc += RULES.bossEatRate * DT
      const eaten = Math.floor(s.eatAcc)
      if (eaten > 0) {
        s.eatAcc -= eaten
        s.count -= Math.min(s.count, eaten)
      }
    }
  }

  // ---- outcomes. win is checked FIRST: if the boss dies and the last buddy
  // pops in the same tick, the kid who saw the boss die deserves the win.
  if (b.hp <= 0) {
    s.phase = 'won'
  } else if (s.count <= 0) {
    s.phase = 'lost'
  }
  return s
}

// the greedy bot: heads for the gate side that leaves the bigger crowd,
// otherwise runs the middle. this is the policy verify-levels proves wins,
// deliberately simple, because if THIS wins, a kid picking the obviously
// bigger number wins too.
export function botInput(s) {
  const next = s.gates.find(g => !g.used && g.y > s.y)
  if (next && next.y - s.y < 420) {
    const leftCount = applyOp(s.count, next.left)
    const rightCount = applyOp(s.count, next.right)
    return { targetX: leftCount >= rightCount ? -RULES.laneHalf * 0.5 : RULES.laneHalf * 0.5 }
  }
  return { targetX: 0 }
}

// the hands-off bot: a finger that never touches the screen. x stays 0, which
// the gate rule reads as the right-hand side every time. this is the policy
// the generator requires to LOSE from HANDS_OFF_LOSES_FROM on (levels.js):
// if THIS wins, the game is playing itself.
export function handsOffInput() {
  return { targetX: 0 }
}

// headless run to completion, for the verifier and for balance work.
export function runBot(level, input = botInput, maxSeconds = 120) {
  const s = createSim(level)
  const maxSteps = Math.floor(maxSeconds / DT)
  for (let i = 0; i < maxSteps && s.phase === 'run'; i++) {
    step(s, input(s))
  }
  return s
}
