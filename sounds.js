// all audio is synthesised right here: zero sound files keeps the shell tiny
// and offline-first, and a synth "pop" is friendlier than a compressed sample.
// the context is created lazily on the first user gesture, because autoplay
// policy would leave an eagerly-created one permanently suspended.

const KEY = 'shootit:muted'

let ctx = null
let muted = false
try {
  muted = localStorage.getItem(KEY) === '1'
} catch { /* a blocked store never blocks the game */ }

function ac() {
  if (typeof AudioContext === 'undefined') return null
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

// one enveloped oscillator note. everything below is phrased with this.
function tone({ freq, glide = freq, type = 'sine', at = 0, len = 0.12, vol = 0.16 }) {
  const audio = ac()
  if (!audio || muted) return
  const t0 = audio.currentTime + at
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(glide, 1), t0 + len)
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + len)
  osc.connect(gain).connect(audio.destination)
  osc.start(t0)
  osc.stop(t0 + len + 0.05)
}

export const sound = {
  // soft star-pew: quiet and very short because it fires constantly. the
  // rate limit lives here, not at call sites, so volleys can't stack noise.
  _lastPew: 0,
  pew() {
    const now = ctx ? ctx.currentTime : 0
    if (now - this._lastPew < 0.07) return
    this._lastPew = now
    tone({ freq: 880, glide: 520, type: 'triangle', len: 0.05, vol: 0.025 })
  },
  pop() { tone({ freq: 300, glide: 90, type: 'sine', len: 0.1, vol: 0.07 }) },
  // create/resume the context INSIDE a user gesture. every gameplay tone
  // fires from the rAF loop, and an AudioContext born outside a gesture can
  // stay suspended on ios — call this from the click that starts a run.
  warm() { ac() },
  gateGood() {
    tone({ freq: 523, glide: 660, type: 'triangle', len: 0.1, vol: 0.12 })
    tone({ freq: 784, type: 'triangle', at: 0.08, len: 0.12, vol: 0.1 })
  },
  gateBad() { tone({ freq: 220, glide: 150, type: 'square', len: 0.16, vol: 0.05 }) },
  _lastOuch: 0,
  ouch() { // rate-limited: melee decrements every few ticks, one ouch per beat
    const now = ctx ? ctx.currentTime : 0
    if (now - this._lastOuch < 0.18) return
    this._lastOuch = now
    tone({ freq: 160, glide: 120, type: 'square', len: 0.09, vol: 0.05 })
  },
  bossRoar() { tone({ freq: 110, glide: 70, type: 'square', len: 0.5, vol: 0.09 }) },
  lost() { // gentle "aww", never a punishment sting
    tone({ freq: 392, glide: 350, type: 'triangle', len: 0.2, vol: 0.12 })
    tone({ freq: 294, glide: 260, type: 'triangle', at: 0.18, len: 0.3, vol: 0.12 })
  },
  win() {
    const notes = [523, 659, 784, 1047]
    notes.forEach((freq, i) => tone({ freq, type: 'triangle', at: i * 0.12, len: 0.22, vol: 0.18 }))
    tone({ freq: 1319, type: 'triangle', at: 0.48, len: 0.4, vol: 0.16 })
  },
  get muted() { return muted },
  toggle() {
    muted = !muted
    try { localStorage.setItem(KEY, muted ? '1' : '0') } catch { /* fine */ }
    return muted
  },
}
