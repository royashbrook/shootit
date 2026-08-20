# issues

local issue log (no remote yet). commits reference these numbers.

## #1: build "Shoot It" to a releasable, locally-testable state

a kids' crowd-runner battle PWA per the kidgames house standard
(~/gh/kidgames/STANDARD.md). the genre: steer a crowd of buddies down a lane,
pick math gates (×2 / +20 / −12 / ÷2) to grow the crowd, the crowd auto-shoots
stars at slime monsters, beat the big boss at the end. scope:

- seed-deterministic levels: 600-level campaign + daily + share-a-seed
- a greedy bot plays every level headless in node and must WIN it before it
  ships, the "provably beatable" guarantee (sim.js runs identically in node
  and the browser: fixed timestep, no transcendental maths, no Math.random)
- all art code-drawn on canvas (original, warm, no gore, monsters pop into
  stars), all sound synthesised
- offline-first service worker, install helper, update banner
- losing costs nothing: instant retry, no lives, no ads, nothing to buy

status: open, releasable local state reached 2026-08-19; remaining: deploy + real-device install checks

### adversarial review 2026-08-19 (4 reviewers, all findings triaged)

fixed:
- salt-exhaustion outage: a 32-salt walk deterministically THREW on real
  future dates (first: daily 2030-07-27) and ~0.07% of shared seeds. MAX_SALT
  now 256 (failure odds ~10^-47), verify sweeps a decade of dailies and
  asserts salt headroom ceilings, and a typo'd --days flag fails instead of
  verifying nothing
- boss pass-through: a boss could slide behind the crowd, become permanently
  untargetable, and drain the run for a helpless minute. bosses now park at
  contact range so every fight resolves; side effect: layout acceptance
  improved (max campaign salt 27 -> 2)
- boss-dies-same-tick-as-last-buddy now counts as the win (kid saw it die)
- one NaN pointer event could permanently poison the sim (sticky NaN x);
  guarded in step()
- AudioContext now warmed inside the PLAY/canvas gesture (ios would
  otherwise keep a rAF-born context suspended = silent game)
- frame-rate-dependent cosmetics: bullets/pops now advance by sim steps, so
  120Hz phones don't double bullet speed; keyboard steer scaled by real time
- colourblind gate cue: boost gates are tall star-topped arches, drag gates
  low droopy slabs, form, not just green/amber
- crowd losses were silent (all feedback was positive-coded); melee/boss
  chew now plays a rate-limited ouch + blue star pops
- update banner suppressed while a run or end-sheet is up (a mistap reloaded
  the game away); surfaces on the menu instead
- canvas sized to the stage's content box (was border box: ~5px clipped and
  a 2.6px center bias); resize while an end overlay is up now refits AND
  repaints; roundRect polyfill for firefox 101-111
- badge pill scales with its font (spilled on tablet widths)
- trap gates can no longer deal two identical sides ("−9 vs −9" is not a
  choice); how-to now mentions ÷/− and trap gates; shared-link URLs cleared
  with replaceState so a reload returns to the kid's own game; sw origin
  check exact-match instead of startsWith; dead code removed

deferred (viewed, judged acceptable):
- content-only deploys are invisible until CACHE is bumped in sw.js,
  template semantics, the deploy protocol IS "bump CACHE" (documented there)
- NEXT from a shared link can walk past the unlock wall, same deliberate
  policy as Sort It (shares open everything; wins mark levels replayable)
- dailySeed uses device-local date (house pattern; "same board today" is
  per-local-date, matching the template and Sort It)
- second share tap while the native sheet is open flashes a wrong label 2.6s
- melee/contact is y-only; pack x-drift is cosmetic by design
