// the renderer and input layer. all rules live in sim.js — this file only
// advances the sim on a fixed-step accumulator, draws it, and turns fingers
// and arrow keys into `input.targetX`. nothing here may change balance.
import { DT, RULES, step, createSim } from './sim.js'
import { drawBuddy, drawSlime, drawStar, face } from './art.js'
import { sound } from './sounds.js'

const LANE_W = 132              // world units of lane width the camera shows
const VIEW_H = 760              // world units of depth the camera shows
const CROWD_SCREEN = 0.74       // crowd sits at 74% of the way down the canvas

export function createGame({ canvas, countEl, onEnd }) {
  const g = canvas.getContext('2d')
  let sim = null
  let theme = null
  let running = false
  let raf = 0
  let last = 0
  let acc = 0
  const input = { targetX: 0 }
  let keyDir = 0
  let bullets = []              // cosmetic
  let pops = []                 // cosmetic
  let lastCounts = new Map()    // pack -> n, to spawn pops on kills
  let lastBossHp = 0
  let bulletTimer = 0
  let roared = false
  let ended = false

  // ---------------------------------------------------------------- sizing

  function fit() {
    const rect = canvas.parentElement.getBoundingClientRect()
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.floor(rect.width * dpr))
    canvas.height = Math.max(1, Math.floor(rect.height * dpr))
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const cw = () => canvas.clientWidth
  const ch = () => canvas.clientHeight
  const sx = wx => cw() / 2 + (wx / LANE_W) * cw() * 0.92
  const sy = wy => ch() * CROWD_SCREEN - ((wy - sim.y) / VIEW_H) * ch()
  const su = u => (u / LANE_W) * cw() * 0.92 // world units -> pixels

  // ----------------------------------------------------------------- input

  function pointerX(event) {
    const rect = canvas.getBoundingClientRect()
    const frac = (event.clientX - rect.left) / rect.width // 0..1
    input.targetX = (frac - 0.5) * LANE_W
  }

  canvas.addEventListener('pointerdown', event => { canvas.setPointerCapture(event.pointerId); pointerX(event) })
  canvas.addEventListener('pointermove', event => { if (event.buttons) pointerX(event) })
  addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') keyDir = -1
    else if (event.key === 'ArrowRight') keyDir = 1
  })
  addEventListener('keyup', event => {
    if (event.key === 'ArrowLeft' && keyDir === -1) keyDir = 0
    if (event.key === 'ArrowRight' && keyDir === 1) keyDir = 0
  })

  // ------------------------------------------------------------------ loop

  function frame(now) {
    if (!running) return
    raf = requestAnimationFrame(frame)
    const dtMs = Math.min(now - last, 50) // background tab must not fast-forward
    last = now
    acc += dtMs / 1000

    if (keyDir !== 0) {
      input.targetX = Math.max(-RULES.laneHalf, Math.min(RULES.laneHalf, input.targetX + keyDir * 3.4))
    }

    const gatesBefore = sim.gatesTaken.length
    while (acc >= DT) {
      acc -= DT
      if (sim.phase === 'run') step(sim, input)
    }
    effects(gatesBefore)
    draw()

    if (sim.phase !== 'run' && !ended) {
      ended = true
      running = false
      cancelAnimationFrame(raf)
      if (sim.phase === 'won') sound.win()
      else sound.lost()
      onEnd(sim)
    }
  }

  // --------------------------------------------------------------- effects

  function effects(gatesBefore) {
    // gate feedback
    if (sim.gatesTaken.length > gatesBefore) {
      const gate = sim.gates.filter(x => x.used)[sim.gatesTaken.length - 1]
      const side = sim.gatesTaken[sim.gatesTaken.length - 1]
      const op = gate?.[side]?.op
      if (op === 'x' || op === '+') sound.gateGood()
      else sound.gateBad()
    }
    // kill pops
    for (const p of sim.packs) {
      const before = lastCounts.get(p) ?? p.n
      if (p.n < before) {
        for (let i = 0; i < Math.min(3, before - p.n); i++) {
          pops.push({ x: p.x + (i - 1) * 8, y: p.y, r: 6 + i * 2, t: 0 })
        }
        sound.pop()
      }
      lastCounts.set(p, p.n)
    }
    if (sim.boss.hp < lastBossHp) pops.push({ x: sim.boss.x, y: sim.boss.y + 20, r: 7, t: 0 })
    lastBossHp = sim.boss.hp
    if (sim.boss.awake && !roared) { roared = true; sound.bossRoar() }

    // cosmetic bullets toward the current target
    bulletTimer -= 1 / 60
    const target = liveTarget()
    if (target && bulletTimer <= 0 && sim.phase === 'run') {
      bulletTimer = 0.09
      bullets.push({ x: sim.x + (Math.sin(sim.t * 13) * 14), y: sim.y + 10, tx: target.x, ty: target.y, p: 0 })
      if (bullets.length > 36) bullets.shift()
      sound.pew()
    }
    for (const b of bullets) b.p += 0.1
    bullets = bullets.filter(b => b.p < 1)
    for (const p of pops) p.t += 1 / 60
    pops = pops.filter(p => p.t < 0.45)
  }

  function liveTarget() {
    let best = null
    let bestD = RULES.fireRange
    for (const p of sim.packs) {
      if (p.n <= 0) continue
      const d = p.y - sim.y
      if (d >= -10 && d < bestD) { best = p; bestD = d }
    }
    const bd = sim.boss.y - sim.y
    if (sim.boss.hp > 0 && bd >= -10 && bd < bestD) return sim.boss
    return best
  }

  // ------------------------------------------------------------------ draw

  function laneEdges() {
    return { left: sx(-LANE_W / 2 + 6), right: sx(LANE_W / 2 - 6) }
  }

  function draw() {
    const W = cw()
    const H = ch()
    g.fillStyle = theme.bg
    g.fillRect(0, 0, W, H)

    const { left, right } = laneEdges()

    // deco dots drift past in the background, seeded off world y so they
    // scroll consistently with travel
    g.fillStyle = theme.deco
    const band = 90
    const first = Math.floor((sim.y - H) / band) * band
    for (let wy = first; wy < sim.y + VIEW_H; wy += band) {
      const jitter = (Math.imul(wy, 2654435761) >>> 8) % 1000 / 1000
      const dx = jitter < 0.5 ? left * (0.3 + jitter) : right + (W - right) * (jitter - 0.5)
      g.beginPath()
      g.arc(dx, sy(wy), 5 + jitter * 6, 0, 7)
      g.fill()
    }

    // the lane
    g.fillStyle = theme.lane
    g.fillRect(left, 0, right - left, H)
    g.fillStyle = theme.rail
    g.fillRect(left - 7, 0, 7, H)
    g.fillRect(right, 0, 7, H)
    // scroll dashes
    g.fillStyle = theme.deco
    for (let wy = first; wy < sim.y + VIEW_H; wy += 130) {
      g.fillRect(W / 2 - 3, sy(wy), 6, su(26))
    }

    // gates ahead (and just behind, fading)
    for (const gate of sim.gates) drawGate(gate)

    // packs
    for (const p of sim.packs) {
      if (p.n <= 0) continue
      drawPack(p)
    }

    // boss
    if (sim.boss.hp > 0) drawBoss()

    // bullets
    for (const b of bullets) {
      const bx = b.x + (b.tx - b.x) * b.p
      const by = b.y + (b.ty - b.y) * b.p
      drawStar(g, sx(bx), sy(by), su(4.6))
    }

    // crowd
    drawCrowd()

    // pops
    for (const p of pops) {
      const grow = 1 + p.t * 3
      drawStar(g, sx(p.x), sy(p.y), su(p.r) * grow, '#FFE9A8')
    }

    countEl.textContent = String(sim.count)
  }

  function drawGate(gate) {
    const y = sy(gate.y)
    if (y < -80 || y > ch() + 80) return
    const { left, right } = laneEdges()
    const mid = (left + right) / 2
    const h = su(46)
    g.globalAlpha = gate.used ? 0.35 : 1
    for (const [side, x0, x1] of [['left', left, mid - 3], ['right', mid + 3, right]]) {
      const op = gate[side]
      const boost = op.op === 'x' || op.op === '+'
      g.fillStyle = boost ? 'rgba(120, 200, 120, .82)' : 'rgba(240, 180, 90, .82)'
      g.strokeStyle = '#2A2331'
      g.lineWidth = 3
      g.beginPath()
      g.roundRect(x0, y - h, x1 - x0, h, [14, 14, 4, 4])
      g.fill()
      g.stroke()
      g.fillStyle = '#2A2331'
      g.font = `800 ${Math.max(16, su(15))}px ui-rounded, system-ui, sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      const label = { x: '×', '+': '+', '-': '−', '/': '÷' }[op.op] + op.k
      g.fillText(label, (x0 + x1) / 2, y - h / 2)
    }
    g.globalAlpha = 1
  }

  function packLayout(n, r) {
    // tight cluster, deterministic golden-angle spiral, drawing cap keeps
    // cheap phones honest while the count label tells the truth
    const cap = Math.min(n, 24)
    const out = []
    for (let i = 0; i < cap; i++) {
      const a = i * 2.39996
      const rad = Math.sqrt(i) * r * 0.85
      out.push([Math.cos(a) * rad, Math.sin(a) * rad])
    }
    return out
  }

  function drawPack(p) {
    const y = sy(p.y)
    if (y < -140 || y > ch() + 140) return
    const r = su(7)
    for (const [dx, dy] of packLayout(p.n, 7)) {
      drawSlime(g, sx(p.x) + su(dx), y + su(dy), r, theme, false, p.charging)
    }
    badge(sx(p.x), y - su(16) - Math.sqrt(Math.min(p.n, 24)) * su(6), String(p.n), '#FFF6E5')
  }

  function drawBoss() {
    const b = sim.boss
    const y = sy(b.y)
    if (y < -220) return
    const r = su(26)
    drawSlime(g, sx(b.x), y, r, theme, true, b.awake)
    // hp bar
    const w = su(64)
    const frac = b.hp / b.hpMax
    g.fillStyle = '#FFF6E5'
    g.strokeStyle = '#2A2331'
    g.lineWidth = 2.5
    g.beginPath()
    g.roundRect(sx(b.x) - w / 2, y - r - su(20), w, su(9), su(4))
    g.fill(); g.stroke()
    g.fillStyle = frac > 0.5 ? '#46A758' : frac > 0.25 ? '#FFC53D' : '#E5484D'
    g.beginPath()
    g.roundRect(sx(b.x) - w / 2 + 2, y - r - su(20) + 2, Math.max(2, (w - 4) * frac), su(9) - 4, su(3))
    g.fill()
  }

  function drawCrowd() {
    const cx = sx(sim.x)
    const cy = sy(sim.y)
    const r = su(6.4)
    const cap = Math.min(sim.count, 48)
    const spots = []
    for (let i = 0; i < cap; i++) {
      const a = i * 2.39996
      const rad = Math.sqrt(i) * r * 0.95
      spots.push([Math.cos(a) * rad, Math.sin(a) * rad * 0.82])
    }
    // back-to-front so overlaps read right
    spots.sort((a, b) => a[1] - b[1])
    for (const [dx, dy] of spots) {
      const wob = Math.sin(sim.t * 9 + dx * 0.7 + dy)
      drawBuddy(g, cx + dx, cy + dy + wob * 1.4, r, wob)
    }
    badge(cx, cy - su(20) - Math.sqrt(cap) * r, String(sim.count), '#D6E4FF')
  }

  function badge(x, y, text, tint) {
    g.font = `800 ${Math.max(14, su(12))}px ui-rounded, system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const w = Math.max(30, g.measureText(text).width + 16)
    g.fillStyle = tint
    g.strokeStyle = '#2A2331'
    g.lineWidth = 2.5
    g.beginPath()
    g.roundRect(x - w / 2, y - 12, w, 24, 12)
    g.fill(); g.stroke()
    g.fillStyle = '#2A2331'
    g.fillText(text, x, y + 1)
  }

  // ------------------------------------------------------------ public api

  return {
    start(levelWrapper, worldTheme) {
      sim = createSim(levelWrapper.level)
      theme = worldTheme
      input.targetX = 0
      keyDir = 0
      bullets = []
      pops = []
      lastCounts = new Map()
      lastBossHp = sim.boss.hp
      bulletTimer = 0
      roared = false
      ended = false
      acc = 0
      fit()
      running = true
      last = performance.now()
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(frame)
    },
    stop() {
      running = false
      cancelAnimationFrame(raf)
    },
    fit,
    isRunning: () => running,
  }
}
