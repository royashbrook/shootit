// offline shell with honest updates. copied close to verbatim from the
// kidgames template (via Sort It): every rule in here was paid for by a real
// bug in a shipped house game.
//
//   1. navigations go network FIRST, cached shell is the offline fallback.
//   2. the update probe passes straight through to the network.
//   3. only ok responses get cached, and the write is wrapped in waitUntil.
//
// bump CACHE when the shell list changes.
const CACHE = 'shootit-v1'
const SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './game.js',
  './sim.js',
  './levels.js',
  './art.js',
  './seed.js',
  './sounds.js',
  './confetti.js',
  './install.js',
  './update.js',
  './manifest.json',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
]

self.addEventListener('install', event => {
  // one bad url must not fail the whole install, so each is added on its own
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(SHELL.map(url => cache.add(url).catch(() => {})))),
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

function store(request, response) {
  const copy = response.clone()
  return caches.open(CACHE).then(cache => cache.put(request, copy))
}

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if (new URL(request.url).searchParams.has('update-probe')) return // rule 2

  if (request.mode === 'navigate') { // rule 1
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) event.waitUntil(store(request, response))
          return response
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match('./index.html'))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(hit => hit || fetch(request).then(response => {
      if (response.ok) event.waitUntil(store(request, response))
      return response
    })),
  )
})
