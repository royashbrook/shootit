// the update banner. an installed PWA will happily run a months-old shell forever,
// so the game has to notice for itself and offer the reload.
//
// the mechanism: fetch the shell through `?update-probe` and compare it to the one
// this session booted with. the service worker is written to pass that query
// through to the network (see sw.js), so the probe always sees the real deployment.
// comparing the served shell beats trusting a version constant, because the constant
// is only right if you remembered to bump it.

const PROBE = '?update-probe'
const EVERY = 5 * 60 * 1000
const PATIENCE = 5000

// resolves once a NEW worker has taken this page over. a plain reload after a
// deploy is still served by the old worker (scripts come cache first from the
// old cache), so a tap on the banner ran the stale app.js and only a second
// reload got the new one. the first controllerchange of a first visit is the
// initial claim, not a takeover, so it only arms the listener.
function takeover() {
  const sw = navigator.serviceWorker
  if (!sw) return Promise.resolve()
  return new Promise(resolve => {
    const arm = () => sw.addEventListener('controllerchange', resolve, { once: true })
    if (sw.controller) arm()
    else sw.addEventListener('controllerchange', arm, { once: true })
  })
}

// ask the browser for the new worker now; sw.js skips waiting and claims on
// activate, so the takeover follows on its own
async function fetchWorker() {
  if (!('serviceWorker' in navigator)) return false
  const registration = await navigator.serviceWorker.getRegistration().catch(() => null)
  if (!registration) return false
  await registration.update().catch(() => {})
  return true
}

// `allowed` gates WHEN the banner may appear (not whether we check): shown
// mid-run it would sit on top of the end-sheet buttons, and a mistap reloads
// the game away. staleness found while playing surfaces at the next safe moment.
export function wireUpdate(banner, { onStatus, allowed = () => true } = {}) {
  if (!banner) return { check: async () => 'unknown' }

  let baseline = null
  let stale = false

  const surface = () => { if (stale && allowed()) banner.hidden = false }
  setInterval(surface, 3000)

  const check = async () => {
    try {
      // seed the baseline from the shell we actually booted (the sw cache),
      // not the first successful probe. difference: boot offline on v1 while
      // v2 is deployed, come online — a probe-seeded baseline would adopt v2
      // silently and the banner would never fire for this session.
      if (baseline === null && 'caches' in window) {
        const cached = await caches.match('./index.html').catch(() => null)
        if (cached) baseline = await cached.text()
      }
      const response = await fetch(PROBE, { cache: 'no-store' })
      if (!response.ok) return 'unknown'
      const text = await response.text()
      if (baseline === null) {
        baseline = text
        return 'current'
      }
      if (text !== baseline) {
        // fetch the worker as soon as we know, so by the time of the tap the
        // takeover has usually already happened and the reload is instant
        if (!stale) void fetchWorker()
        stale = true
        surface()
        return 'stale'
      }
      return 'current'
    } catch {
      return 'offline' // nothing to say, and nothing broken
    }
  }

  const taken = takeover()
  banner.addEventListener('click', async () => {
    banner.disabled = true
    // no worker (registration failed) means a plain reload is all there is.
    // otherwise wait for the takeover, but never past PATIENCE: offline or an
    // unchanged worker must still leave the player with a reload, not a dead button.
    if (await fetchWorker()) await Promise.race([taken, new Promise(r => setTimeout(r, PATIENCE))])
    location.reload()
  }, { once: true })
  void check()
  setInterval(() => { void check().then(s => onStatus?.(s)) }, EVERY)
  // coming back to the tab is the moment a player is most likely to accept a reload
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void check().then(s => onStatus?.(s))
  })

  return { check }
}

export function registerWorker(path = 'sw.js') {
  if (!('serviceWorker' in navigator)) return
  // file:// has no worker scope, and a dev server on localhost is fine
  if (location.protocol === 'file:') return
  addEventListener('load', () => {
    navigator.serviceWorker.register(path).catch(() => {
      // an unregistered worker costs offline play, not the game. never block boot on it.
    })
  })
}
