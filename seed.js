// seed-determinism: one small PRNG buys the daily, replayable boards, and
// play-with-friends with no server at all. see STANDARD.md sections 5 and 6.

// mulberry32: 32-bit state, good enough for game content, four lines long.
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// the date IS the seed, so everyone in the world gets the same board today and
// nothing has to be stored or fetched to make that true.
export function dailySeed(date = new Date()) {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  return y * 10000 + m * 100 + d
}

// a shared link wins over the daily, so a friend's board opens as theirs.
export function currentSeed() {
  const asked = new URLSearchParams(location.search).get('seed')
  const parsed = Number.parseInt(asked ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : dailySeed()
}

export function isDaily(seed) {
  return seed === dailySeed()
}

export function seedUrl(seed) {
  const url = new URL(location.href)
  url.search = ''
  url.searchParams.set('seed', String(seed))
  return url.toString()
}

// fisher-yates, driven by the seeded rng so the same seed always deals the same board
export function shuffle(random, items) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// tier 1 "play with friends": share the url, no backend, no account, free forever.
// navigator.share is the good path; clipboard is the fallback that always exists.
export async function shareSeed(seed, title) {
  const url = seedUrl(seed)
  const payload = { title, text: `play this exact ${title} board with me`, url }
  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
      await navigator.share(payload)
      return 'shared'
    }
  } catch (error) {
    // a cancelled share sheet is a normal user action, not a failure to report
    if (error && error.name === 'AbortError') return 'cancelled'
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
