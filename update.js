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

export function wireUpdate(banner, { onStatus } = {}) {
  if (!banner) return { check: async () => 'unknown' }

  let baseline = null

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
        banner.hidden = false
        return 'stale'
      }
      return 'current'
    } catch {
      return 'offline' // nothing to say, and nothing broken
    }
  }

  banner.addEventListener('click', () => location.reload())
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
