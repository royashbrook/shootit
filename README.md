# Shoot It

a cosy crowd-runner for kids. steer your crowd of buddies down the lane, run
through maths gates to grow it, and let the buddies shoot stars at slimes,
pop the big boss at the end. **no ads, no lives, no timers, nothing to buy,
no accounts, no cookies, nothing sold or shared.** works offline.

a [kidgames](https://github.com/royashbrook/kidgames) house game, sibling of
Sort It.

## play locally

```sh
npm run serve   # http://localhost:4311
```

## what's inside

- **600 campaign runs** across 30 themed worlds (7 palettes + slime forms
  rotating), plus a **daily run** that is the same for everyone.
- every run is laid out deterministically from its level number / date and
  **proven beatable by a greedy bot before it is shown**, `sim.js` is one
  fixed-timestep pure simulation shared verbatim between the browser and
  node, so `npm run verify` re-proves all 600 runs + 3 years of dailies in
  about a second.
- gates are real kid maths (×2, +14, −8, ÷2); losing costs nothing, instant
  retry, monsters pop into stars, nobody bleeds.
- all art is code-drawn canvas (`art.js`), all sound synthesised
  (`sounds.js`). zero external assets, zero requests to anyone.
- PWA per the house standard: offline shell (`sw.js`), update banner,
  install helper, share-a-run with no server.

## tools

```sh
npm run verify        # prove every run + 3 years of dailies beatable, twice
npm run icons         # regenerate icon.svg + pngs
node tools/tune.mjs   # balance workbench (where and why the bot dies)
npm test              # the build id stamp: sw cache name + about build id
npm run test:e2e      # a content-only deploy lands on the first tap of the update banner (needs PLAYWRIGHT_ROOT)
```

## deploys

pushing to main deploys. the workflow stamps the short commit sha into
`sw.js` (the cache name) and the about dialog (the build id) before upload,
so a content-only change reaches a returning player on the first tap of the
update banner (the tap waits for the new worker to take over, then reloads
once) with no hand bump. locally both read `dev`.

## license

MIT
