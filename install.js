// the shared install helper. every house game gets this exact behaviour:
// hidden until the app is genuinely installable, never a nag, never modal on load.
//
// chrome/edge/android fire `beforeinstallprompt`, which we stash and replay on tap.
// ios never fires it, so ios gets an instructional sheet instead (there is no api
// to trigger the ios add-to-home-screen flow, and pretending otherwise is how you
// end up shipping a button that does nothing).

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // ipados 13+ reports as a mac, the touch points are what give it away
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  navigator.standalone === true

export function wireInstall(button, { showIosHint }) {
  if (!button) return
  if (isInstalled()) return // already on the home screen, the button would be a lie

  let deferred = null

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault() // stop the mini-infobar, we own the moment
    deferred = event
    button.hidden = false
  })

  if (isIos()) button.hidden = false

  button.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      if (outcome === 'accepted') button.hidden = true
      return
    }
    showIosHint()
  })

  window.addEventListener('appinstalled', () => {
    deferred = null
    button.hidden = true
  })
}
