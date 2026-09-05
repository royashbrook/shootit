// wiring only: menu, screens, progress, share, install, update. the rules
// live in sim.js, the levels in levels.js, the drawing in game.js/art.js.
import { dailySeed } from './seed.js'
import { LEVEL_COUNT, WORLD_SIZE, WORLD_COUNT, levelFor, seedLevel } from './levels.js'
import { themeForWorld, THEMES } from './art.js'
import { createGame } from './game.js'
import { sound } from './sounds.js'
import { confetti } from './confetti.js'
import { wireInstall } from './install.js'
import { wireUpdate, registerWorker } from './update.js'

const $ = id => document.getElementById(id)
const menu = $('menu')
const levelsScreen = $('levels')
const gameScreen = $('game')
const howto = $('howto')

// ------------------------------------------------------------- progress

const KEY = 'shootit:progress'

// the store is user-writable: every shape is hostile until proven (lesson
// carried over from Sort It's review).
function loadProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const current = Number.isInteger(raw?.current)
      ? Math.min(Math.max(raw.current, 1), LEVEL_COUNT)
      : 1
    const done = {}
    if (raw?.done && typeof raw.done === 'object' && !Array.isArray(raw.done)) {
      for (const [key, value] of Object.entries(raw.done)) {
        const n = Number(key)
        if (Number.isInteger(n) && n >= 1 && n <= LEVEL_COUNT && Number.isFinite(value)) done[n] = value
      }
    }
    return { current, done }
  } catch {
    return { current: 1, done: {} } // a blocked store never stops a kid playing
  }
}

function saveProgress(progress) {
  try { localStorage.setItem(KEY, JSON.stringify(progress)) } catch { /* fine */ }
}

let progress = loadProgress()

addEventListener('storage', event => {
  if (event.key !== KEY) return
  const incoming = loadProgress()
  incoming.current = Math.max(incoming.current, progress.current)
  for (const [n, best] of Object.entries(progress.done)) {
    if (incoming.done[n] == null || best > incoming.done[n]) incoming.done[n] = best
  }
  progress = incoming
  if (!levelsScreen.hidden) renderWorld()
})

// ------------------------------------------------------------- screens

function show(screen) {
  for (const el of [menu, levelsScreen, gameScreen]) el.hidden = el !== screen
  $('won').hidden = true
  $('lost').hidden = true
  $('paused').hidden = true
  if (screen !== gameScreen) game.stop()
}

// --------------------------------------------------------------- game

let board = null   // the level wrapper being played, from levels.js
let theme = null

const game = createGame({
  canvas: $('board'),
  countEl: $('count'),
  onEnd: sim => {
    if (sim.phase === 'won') {
      let detail = `${sim.count} buddies made it!`
      if (board.kind === 'level') {
        const best = progress.done[board.n]
        if (best == null || sim.count > best) {
          progress.done[board.n] = sim.count
          if (best != null) detail = `${sim.count} buddies made it, your best yet!`
        } else {
          detail = `${sim.count} buddies made it. your best is ${best}.`
        }
        if (board.n === progress.current && progress.current < LEVEL_COUNT) progress.current += 1
        saveProgress(progress)
        $('next').hidden = board.n >= LEVEL_COUNT
      } else {
        $('next').hidden = true
      }
      $('won-detail').textContent = detail
      confetti(['#3E63DD', '#FFC53D', '#46A758', '#E93D82', '#00A2C7'])
      $('won').hidden = false
    } else {
      $('lost').hidden = false
    }
  },
})

function themeForBoard(b) {
  if (b.kind === 'level') return themeForWorld(Math.floor((b.n - 1) / WORLD_SIZE))
  return THEMES[b.seed % THEMES.length]
}

function play(b, label) {
  board = b
  theme = themeForBoard(b)
  $('board-label').textContent = label
  show(gameScreen)
  game.start(board, theme)
}

const startLevel = n => play(levelFor(n), `level ${n}`)
const startSeed = (seed, label) => play(seedLevel(seed), label)
const replay = () => {
  $('won').hidden = true
  $('lost').hidden = true
  $('paused').hidden = true
  board.kind === 'level' ? startLevel(board.n) : startSeed(board.seed, $('board-label').textContent)
}

// ------------------------------------------------------------------ pause

// non-destructive: the sim freezes under the sheet and the kid decides.
// the same sheet answers PAUSE, RETRY (no one-tap reset in the thumb zone),
// a hidden tab and a page going away, so a phone call costs nothing.
function pauseRun() {
  if (gameScreen.hidden || !game.isRunning() || game.isPaused()) return
  game.pause()
  $('paused').hidden = false
}

function resumeRun() {
  $('paused').hidden = true
  game.resume()
}

$('pause').addEventListener('click', pauseRun)
$('retry').addEventListener('click', pauseRun)
$('resume').addEventListener('click', resumeRun)
$('paused-retry').addEventListener('click', () => replay())
$('paused-menu').addEventListener('click', () => show(menu))
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun() })
addEventListener('pagehide', pauseRun)
addEventListener('keydown', event => {
  if (event.key !== 'Escape' || gameScreen.hidden) return
  game.isPaused() ? resumeRun() : pauseRun()
})

// ---------------------------------------------------------- level picker

let world = 0

function renderWorld() {
  const t = themeForWorld(world)
  $('world-title').textContent = `world ${world + 1} · ${t.title}`
  $('world-count').textContent = `${world + 1} / ${WORLD_COUNT}`
  $('world-prev').disabled = world === 0
  $('world-next').disabled = world === WORLD_COUNT - 1
  const grid = $('world-grid')
  grid.replaceChildren()
  for (let i = 0; i < WORLD_SIZE; i++) {
    const n = world * WORLD_SIZE + i + 1
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'lvl'
    const best = progress.done[n]
    if (best != null) el.classList.add('done')
    if (n === progress.current) el.classList.add('now')
    el.disabled = n > progress.current && best == null
    el.innerHTML = `<span>${n}</span>` +
      (best != null ? `<span class="sub">&#10003; ${best}</span>` : '')
    el.addEventListener('click', () => startLevel(n))
    grid.append(el)
  }
  const total = Object.keys(progress.done).length
  $('sorted-total').textContent = total ? `you've cleared ${total} of ${LEVEL_COUNT} runs` : 'clear a run to leave your mark!'
}

// --------------------------------------------------------------- share

const shareTimers = new Map()

async function share(button, subject) {
  const url = new URL(location.href)
  url.search = ''
  if (subject?.kind === 'level') url.searchParams.set('level', String(subject.n))
  else url.searchParams.set('seed', String(subject?.seed ?? dailySeed()))
  const payload = { title: 'Shoot It', text: 'play this exact Shoot It run with me', url: url.toString() }
  if (!button.dataset.label) button.dataset.label = button.textContent
  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
      await navigator.share(payload)
      return
    }
  } catch (error) {
    if (error?.name === 'AbortError') return // a closed share sheet is not an error
  }
  try {
    await navigator.clipboard.writeText(url.toString())
    button.textContent = 'LINK COPIED, SEND IT TO THEM'
  } catch {
    button.textContent = 'COULD NOT SHARE, SORRY'
  }
  clearTimeout(shareTimers.get(button))
  shareTimers.set(button, setTimeout(() => { button.textContent = button.dataset.label }, 2600))
}

// --------------------------------------------------------------- wiring

// warm the AudioContext inside the gesture that starts a run: every gameplay
// tone fires from the rAF loop, and ios keeps a loop-born context suspended
$('play').addEventListener('click', () => { sound.warm(); startLevel(progress.current) })
$('daily').addEventListener('click', () => { sound.warm(); startSeed(dailySeed(), "today's run") })
$('board').addEventListener('pointerdown', () => sound.warm())
$('levels-open').addEventListener('click', () => { world = Math.floor((progress.current - 1) / WORLD_SIZE); renderWorld(); show(levelsScreen) })
$('levels-back').addEventListener('click', () => show(menu))
$('world-prev').addEventListener('click', () => { world = Math.max(0, world - 1); renderWorld() })
$('world-next').addEventListener('click', () => { world = Math.min(WORLD_COUNT - 1, world + 1); renderWorld() })
$('back').addEventListener('click', () => show(menu))

const howtoContent = {
  h2: howto.querySelector('h2').textContent,
  ol: howto.querySelector('ol').innerHTML,
  small: howto.querySelector('.small').innerHTML,
}
$('howto-open').addEventListener('click', () => {
  howto.querySelector('h2').textContent = howtoContent.h2
  howto.querySelector('ol').innerHTML = howtoContent.ol
  howto.querySelector('.small').innerHTML = howtoContent.small
  howto.showModal()
})
$('howto-close').addEventListener('click', () => howto.close())

$('about-open').addEventListener('click', () => $('about').showModal())
$('about-close').addEventListener('click', () => $('about').close())

$('again').addEventListener('click', () => replay())
$('retry-big').addEventListener('click', () => replay())
$('lost-menu').addEventListener('click', () => show(menu))
$('next').addEventListener('click', () => startLevel(Math.min(board.n + 1, LEVEL_COUNT)))
$('friends').addEventListener('click', event => {
  share(event.currentTarget, menu.hidden ? board : { kind: 'seed', seed: dailySeed() })
})
$('share-win').addEventListener('click', event => share(event.currentTarget, board))

const soundChip = $('sound')
function paintSound(muted) {
  soundChip.classList.toggle('muted', muted)
  soundChip.setAttribute('aria-pressed', String(!muted))
}
paintSound(sound.muted)
soundChip.addEventListener('click', () => paintSound(sound.toggle()))

// refresh, not fit: after a run ends the frozen frame behind the end sheet
// still has to track rotations
addEventListener('resize', () => { if (!gameScreen.hidden) game.refresh() })

wireInstall($('install'), {
  showIosHint: () => {
    howto.querySelector('h2').textContent = 'Add to home screen'
    howto.querySelector('ol').innerHTML =
      '<li>Tap the <b>share</b> button at the bottom of Safari.</li>' +
      '<li>Scroll down and tap <b>Add to Home Screen</b>.</li>' +
      '<li>Tap <b>Add</b>. It opens like a real app, and works with no internet.</li>'
    howto.querySelector('.small').textContent = ''
    howto.showModal()
  },
})

wireUpdate($('update'), { allowed: () => gameScreen.hidden }) // never over a run
registerWorker()

// a shared link drops the player straight onto their friend's run
const params = new URLSearchParams(location.search)
const sharedLevel = Number.parseInt(params.get('level') ?? '', 10)
const sharedSeed = Number.parseInt(params.get('seed') ?? '', 10)
if (Number.isFinite(sharedLevel) && sharedLevel >= 1 && sharedLevel <= LEVEL_COUNT) {
  history.replaceState(null, '', location.pathname) // a reload is THEIR game again
  startLevel(sharedLevel)
} else if (Number.isFinite(sharedSeed) && sharedSeed > 0) {
  history.replaceState(null, '', location.pathname)
  startSeed(sharedSeed, sharedSeed === dailySeed() ? "today's run" : `run ${sharedSeed}`)
}
