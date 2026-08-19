# issues

local issue log (no remote yet). commits reference these numbers.

## #1 — build "Shoot It" to a releasable, locally-testable state

a kids' crowd-runner battle PWA per the kidgames house standard
(~/gh/kidgames/STANDARD.md). the genre: steer a crowd of buddies down a lane,
pick math gates (×2 / +20 / −12 / ÷2) to grow the crowd, the crowd auto-shoots
stars at slime monsters, beat the big boss at the end. scope:

- seed-deterministic levels: 600-level campaign + daily + share-a-seed
- a greedy bot plays every level headless in node and must WIN it before it
  ships — the "provably beatable" guarantee (sim.js runs identically in node
  and the browser: fixed timestep, no transcendental maths, no Math.random)
- all art code-drawn on canvas (original, warm, no gore — monsters pop into
  stars), all sound synthesised
- offline-first service worker, install helper, update banner
- losing costs nothing: instant retry, no lives, no ads, nothing to buy

status: open
