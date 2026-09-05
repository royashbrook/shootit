// the renderer and input layer. all rules live in sim.js — this file only
// advances the sim on a fixed-step accumulator, draws it, and turns fingers
// and arrow keys into `input.targetX`. nothing here may change balance.
import { DT, RULES, step, createSim } from './sim.js'
import { drawBuddy, drawSlime, drawStar, face } from './art.js'
import { sound } from './sounds.js'
import { createFx, FLOAT_LIFE } from './fx.js'

const LANE_W = 132              // world units of lane width the camera shows
const VIEW_H = 760              // world units of depth the camera shows
const CROWD_SCREEN = 0.74       // crowd sits at 74% of the way down the canvas

// the one verb, taught once per session: the "slide to steer" cue sits under
// the crowd until the first real slide (or arrow key), then stays gone
let taught = false

// firefox 101-111 has dvh but not roundRect; three lines beat a blank canvas
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const radius = Math.min(Array.isArray(r) ? r[0] : r, w / 2, h / 2)
    this.moveTo(x + radius, y)
    this.arcTo(x + w, y, x + w, y + h, radius)
    this.arcTo(x + w, y + h, x, y + h, radius)
    this.arcTo(x, y + h, x, y, radius)
    this.arcTo(x, y, x + w, y, radius)
    this.closePath()
  }
}

export function createGame({ canvas, countEl, onEnd }) {
  const g = canvas.getContext('2d')
  let sim = null
  let theme = null
  let running = false
  let paused = false
  let raf = 0
  let last = 0
  let acc = 0
  const input = { targetX: 0 }
  let keyDir = 0
  let bullets = []              // cosmetic
  let pops = []                 // cosmetic
  let fx = createFx()           // floaties + hit flashes, cosmetic
  let lastCounts = new Map()    // pack -> n, to spawn pops on kills
  let lastBossHp = 0
  let lastCrowd = 0
  let bulletTimer = 0
  let roared = false
  let ended = false

  // ---------------------------------------------------------------- sizing

  function fit() {
    // content box, not getBoundingClientRect: the stage has a border, and a
    // border-box-sized canvas overflows into the overflow:hidden clip
    const w = canvas.parentElement.clientWidth
    const h = canvas.parentElement.clientHeight
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.floor(w * dpr))
    canvas.height = Math.max(1, Math.floor(h * dpr))
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
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

  // the cue's state is mirrored onto the canvas element so the dom (and a
  // browser test) can tell whether the hint is up without reading pixels
  function learned() {
    taught = true
    delete canvas.dataset.cue
  }

  canvas.addEventListener('pointerdown', event => { canvas.setPointerCapture(event.pointerId); pointerX(event) })
  canvas.addEventListener('pointermove', event => { if (event.buttons) { pointerX(event); learned() } })
  addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') keyDir = -1
    else if (event.key === 'ArrowRight') keyDir = 1
    else return
    learned()
  })
  addEventListener('keyup', event => {
    if (event.key === 'ArrowLeft' && keyDir === -1) keyDir = 0
    if (event.key === 'ArrowRight' && keyDir === 1) keyDir = 0
  })

  // ------------------------------------------------------------------ loop

  function frame(now) {
    if (!running || paused) return
    raf = requestAnimationFrame(frame)
    const dtMs = Math.min(now - last, 50) // background tab must not fast-forward
    last = now
    acc += dtMs / 1000

    if (keyDir !== 0) {
      // scaled by real time so keyboard feel is refresh-rate independent
      input.targetX = Math.max(-RULES.laneHalf, Math.min(RULES.laneHalf, input.targetX + keyDir * (dtMs / 1000) * 205))
    }

    const gatesBefore = sim.gatesTaken.length
    let steps = 0
    while (acc >= DT) {
      acc -= DT
      if (sim.phase === 'run') {
        const countBefore = sim.count
        step(sim, input)
        fx.afterStep(sim, countBefore)
        steps++
      }
    }
    effects(gatesBefore, steps)
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

  // cosmetics advance by SIM steps, not by rendered frames: a 120Hz phone
  // must not double bullet speed, a struggling 30fps one must not halve it.
  function effects(gatesBefore, steps) {
    const dt = steps * (1 / 60)
    // gate feedback
    if (sim.gatesTaken.length > gatesBefore) {
      const gate = sim.gates.filter(x => x.used)[sim.gatesTaken.length - 1]
      const side = sim.gatesTaken[sim.gatesTaken.length - 1]
      const op = gate?.[side]?.op
      if (op === 'x' || op === '+') sound.gateGood()
      else sound.gateBad()
    }
    // kill pops (enemy side)
    for (const p of sim.packs) {
      const before = lastCounts.get(p) ?? p.n
      if (p.n < before) {
        for (let i = 0; i < Math.min(3, before - p.n); i++) {
          pops.push({ x: p.x + (i - 1) * 8, y: p.y, r: 6 + i * 2, t: 0, ours: false })
        }
        sound.pop()
      }
      lastCounts.set(p, p.n)
    }
    // crowd losses get their OWN feedback: danger must never be silent
    if (sim.count < lastCrowd) {
      pops.push({ x: sim.x, y: sim.y, r: 7, t: 0, ours: true })
      sound.ouch()
    }
    lastCrowd = sim.count
    if (sim.boss.hp < lastBossHp) pops.push({ x: sim.boss.x, y: sim.boss.y + 20, r: 7, t: 0, ours: false })
    lastBossHp = sim.boss.hp
    if (sim.boss.awake && !roared) { roared = true; sound.bossRoar() }

    // cosmetic bullets toward the current target
    bulletTimer -= dt
    const target = liveTarget()
    if (target && bulletTimer <= 0 && sim.phase === 'run') {
      bulletTimer = 0.09
      bullets.push({ x: sim.x + (Math.sin(sim.t * 13) * 14), y: sim.y + 10, tx: target.x, ty: target.y, p: 0 })
      if (bullets.length > 36) bullets.shift()
      sound.pew()
    }
    for (const b of bullets) b.p += dt * 6
    bullets = bullets.filter(b => b.p < 1)
    for (const p of pops) p.t += dt
    pops = pops.filter(p => p.t < 0.45)
    fx.tick(dt)
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
    // world units, not pixels: the visible depth below the crowd is a slice
    // of VIEW_H, and mixing in the pixel height only worked by coincidence
    const first = Math.floor((sim.y - VIEW_H * (1 - CROWD_SCREEN) - band) / band) * band
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

    // pops: gold for popped slimes, blue for lost buddies (the ouch reads)
    for (const p of pops) {
      const grow = 1 + p.t * 3
      drawStar(g, sx(p.x), sy(p.y), su(p.r) * grow, p.ours ? '#9DB8FF' : '#FFE9A8')
    }

    for (const f of fx.floats) drawFloat(f)
    if (!taught && sim.phase === 'run') drawCue()

    countEl.textContent = String(sim.count)
  }

  // the gate's value, rising off the crowd's badge and fading: the number IS
  // the lesson. it rides with the crowd (screen space), not the lane, or the
  // camera would carry it down and away in under a second
  function drawFloat(f) {
    const life = f.t / FLOAT_LIFE
    const size = Math.max(20, su(19))
    g.globalAlpha = 1 - life * life
    g.font = `800 ${size}px ui-rounded, system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineWidth = Math.max(3, size * 0.18)
    g.strokeStyle = '#2A2331'
    g.fillStyle = f.good ? '#8EDB7C' : '#FFB067'
    const x = sx(sim.x)
    const y = crowdTop() - su(14) - life * su(50)
    g.strokeText(f.text, x, y)
    g.fillText(f.text, x, y)
    g.globalAlpha = 1
  }

  // screen y of the top of the crowd's count badge
  function crowdTop() {
    const r = su(6.4)
    return sy(sim.y) - su(20) - Math.sqrt(Math.min(sim.count, 48)) * r - r * 1.7
  }

  // "slide to steer" under the crowd: two arrowheads and the words, swaying
  // sideways so it reads as a motion, not a label
  function drawCue() {
    canvas.dataset.cue = 'steer'
    const sway = Math.sin(sim.t * 4) * su(7)
    const x = sx(sim.x) + sway
    const y = sy(sim.y) + su(36)
    const size = Math.max(14, su(11))
    g.font = `800 ${size}px ui-rounded, system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const text = 'slide to steer'
    const tw = g.measureText(text).width
    const pad = size * 0.8
    const arrow = size * 0.7
    const w = tw + pad * 2 + arrow * 2 + size
    g.fillStyle = 'rgba(255, 246, 229, .92)'
    g.strokeStyle = '#2A2331'
    g.lineWidth = 2.5
    g.beginPath()
    g.roundRect(x - w / 2, y - size, w, size * 2, size)
    g.fill(); g.stroke()
    g.fillStyle = '#2A2331'
    g.fillText(text, x, y + 1)
    for (const dir of [-1, 1]) {
      const tip = x + dir * (w / 2 - pad * 0.6)
      g.beginPath()
      g.moveTo(tip, y)
      g.lineTo(tip - dir * arrow, y - arrow * 0.7)
      g.lineTo(tip - dir * arrow, y + arrow * 0.7)
      g.closePath()
      g.fill()
    }
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
      // house rule: FORM as well as colour. boost gates are tall arches
      // wearing a star; drag gates are low droopy slabs. a colourblind
      // pre-reader still sees which side is the happy one.
      const gh = boost ? h * 1.15 : h * 0.8
      g.fillStyle = boost ? 'rgba(105, 195, 115, .85)' : 'rgba(232, 158, 66, .85)'
      g.strokeStyle = '#2A2331'
      g.lineWidth = 3
      g.beginPath()
      g.roundRect(x0, y - gh, x1 - x0, gh, boost ? [su(20), su(20), 4, 4] : [4, 4, su(12), su(12)])
      g.fill()
      g.stroke()
      if (boost) drawStar(g, (x0 + x1) / 2, y - gh, su(7))
      g.fillStyle = '#2A2331'
      g.font = `800 ${Math.max(16, su(15))}px ui-rounded, system-ui, sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      const label = { x: '×', '+': '+', '-': '−', '/': '÷' }[op.op] + op.k
      g.fillText(label, (x0 + x1) / 2, y - gh / 2)
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
    const flash = fx.flashing(p)
    for (const [dx, dy] of packLayout(p.n, 7)) {
      drawSlime(g, sx(p.x) + su(dx), y + su(dy), r, theme, false, p.charging, flash)
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
    // a big crowd hugging a rail is squeezed inside the lane: the spiral is
    // wider than the room between the centre clamp and the rail
    const { left, right } = laneEdges()
    for (const [dx, dy] of spots) {
      const wob = Math.sin(sim.t * 9 + dx * 0.7 + dy)
      const x = Math.max(left + r, Math.min(right - r, cx + dx))
      drawBuddy(g, x, cy + dy + wob * 1.4, r, wob)
    }
    badge(cx, cy - su(20) - Math.sqrt(cap) * r, String(sim.count), '#D6E4FF')
  }

  function badge(x, y, text, tint) {
    const size = Math.max(14, su(12))
    g.font = `800 ${size}px ui-rounded, system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const pillH = size * 1.7 // pill scales with the font, or big screens spill
    const w = Math.max(pillH * 1.3, g.measureText(text).width + size)
    g.fillStyle = tint
    g.strokeStyle = '#2A2331'
    g.lineWidth = 2.5
    g.beginPath()
    g.roundRect(x - w / 2, y - pillH / 2, w, pillH, pillH / 2)
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
      fx = createFx()
      lastCounts = new Map()
      lastBossHp = sim.boss.hp
      bulletTimer = 0
      roared = false
      ended = false
      acc = 0
      fit()
      running = true
      paused = false
      last = performance.now()
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(frame)
    },
    stop() {
      running = false
      paused = false
      cancelAnimationFrame(raf)
    },
    // the clock is the frame loop: no frames, no accumulated time, so a pause
    // is simply not asking for the next frame. resume restarts the clock from
    // now, so the gap never reaches the accumulator.
    pause() {
      if (!running || paused) return
      paused = true
      cancelAnimationFrame(raf)
    },
    resume() {
      if (!running || !paused) return
      paused = false
      keyDir = 0
      last = performance.now()
      raf = requestAnimationFrame(frame)
    },
    isPaused: () => paused,
    fit,
    // resize while an end overlay is up: refit AND repaint the frozen frame
    refresh() {
      fit()
      if (sim) draw()
    },
    isRunning: () => running,
  }
}
