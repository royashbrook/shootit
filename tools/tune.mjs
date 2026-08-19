// balance workbench: run the bot across every level and salt and say WHERE
// and WHY runs die, so tuning is aimed instead of guessed.
//   node tools/tune.mjs            # scan all 600, summarize failures
//   node tools/tune.mjs 133        # dissect one level, salt by salt
import { LEVEL_COUNT, paramsFor, makeLevel, levelSeed } from '../levels.js'
import { runBot } from '../sim.js'

function dissect(level, result) {
  const where = result.phase === 'won' ? 'won'
    : result.t >= 119 ? 'timeout'
    : result.boss.awake ? 'died-at-boss'
    : 'died-at-packs'
  return { where, count: result.count, bossHp: result.boss.hp, t: Math.round(result.t) }
}

const target = Number(process.argv[2])

if (target) {
  const params = paramsFor(target)
  console.log('params', params)
  for (let salt = 0; salt < 32; salt++) {
    const level = makeLevel(levelSeed(target, salt), params)
    const r = runBot(level)
    const d = dissect(level, r)
    console.log(`salt ${String(salt).padStart(2)}: ${d.where.padEnd(14)} count=${String(d.count).padStart(3)} bossHp=${String(d.bossHp).padStart(3)}/${level.boss.hpMax} t=${d.t}s packs=[${level.packs.map(p => p.n).join(',')}]`)
    if (r.phase === 'won') break
  }
} else {
  let pass0 = 0
  let passAny = 0
  const fails = []
  const whereCount = {}
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const params = paramsFor(n)
    let won = -1
    let firstWhere = null
    for (let salt = 0; salt < 32; salt++) {
      const level = makeLevel(levelSeed(n, salt), params)
      const r = runBot(level)
      if (salt === 0 && r.phase === 'won' && r.count >= 2) pass0++
      if (firstWhere === null) firstWhere = dissect(level, r).where
      if (r.phase === 'won' && r.count >= 2) { won = salt; break }
    }
    if (won >= 0) passAny++
    else { fails.push(n); whereCount[firstWhere] = (whereCount[firstWhere] ?? 0) + 1 }
  }
  console.log(`salt0 wins: ${pass0}/${LEVEL_COUNT}, any-salt wins: ${passAny}/${LEVEL_COUNT}`)
  console.log(`failing levels (${fails.length}): ${fails.slice(0, 30).join(' ')}${fails.length > 30 ? ' …' : ''}`)
  console.log('salt-0 failure modes across failing levels:', whereCount)
}
