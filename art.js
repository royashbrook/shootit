// all of Shoot It's art: 7 world themes, each a palette plus a slime-monster
// FORM. house rule: worlds differ by form as well as colour, so a colourblind
// kid still reads "new world, new creatures". everything is code-drawn on
// canvas — zero image assets, warm shapes, no gore: monsters pop into stars.

const INK = '#2A2331'

export const THEMES = [
  {
    key: 'meadow', title: 'Meadow Run',
    bg: '#DFF0D0', lane: '#F5EBD7', rail: '#B8D49A', deco: '#C9E2B2',
    enemy: '#E5484D', boss: '#C6363B', form: 'spiky',
  },
  {
    key: 'shore', title: 'Sandy Shore',
    bg: '#CDE8EF', lane: '#F6E7C8', rail: '#9ECBDA', deco: '#BFE0E9',
    enemy: '#F76B15', boss: '#D65A0D', form: 'crabby',
  },
  {
    key: 'cave', title: 'Crystal Cave',
    bg: '#D8D2E8', lane: '#EFE9DC', rail: '#B4A8D4', deco: '#C7BEE0',
    enemy: '#8E4EC6', boss: '#7A3BB2', form: 'shard',
  },
  {
    key: 'snow', title: 'Snowy Slide',
    bg: '#E2EDF5', lane: '#FBF6EC', rail: '#B9D2E4', deco: '#D0E2EF',
    enemy: '#00A2C7', boss: '#0187A6', form: 'square',
  },
  {
    key: 'ridge', title: 'Sunset Ridge',
    bg: '#F5DFC8', lane: '#F1E4D0', rail: '#DDB088', deco: '#EBCCA8',
    enemy: '#D64550', boss: '#B93641', form: 'tall',
  },
  {
    key: 'sky', title: 'Starry Sky',
    bg: '#CDD4EE', lane: '#EEEAF6', rail: '#A3ADDC', deco: '#BFC7E8',
    enemy: '#E93D82', boss: '#C92C6D', form: 'drippy',
  },
  {
    key: 'candy', title: 'Candy Lane',
    bg: '#F6DCE8', lane: '#FBF1E4', rail: '#E3AECB', deco: '#F0C8DC',
    enemy: '#AD7F58', boss: '#8F653F', form: 'swirl',
  },
]

export function themeForWorld(world) {
  return THEMES[world % THEMES.length]
}

// ------------------------------------------------------------------- faces

export function face(g, x, y, s, awake = true) {
  g.fillStyle = INK
  g.beginPath()
  g.arc(x - 4 * s, y - 1 * s, 1.5 * s, 0, 7)
  g.arc(x + 4 * s, y - 1 * s, 1.5 * s, 0, 7)
  g.fill()
  g.strokeStyle = INK
  g.lineWidth = 1.6 * s
  g.lineCap = 'round'
  g.beginPath()
  if (awake) g.arc(x, y + 2 * s, 3.2 * s, 0.3, Math.PI - 0.3)
  else { g.moveTo(x - 3 * s, y + 3.5 * s); g.lineTo(x + 3 * s, y + 3.5 * s) }
  g.stroke()
}

// ------------------------------------------------------------ player blobs

export function drawBuddy(g, x, y, r, wobble = 0) {
  g.fillStyle = '#3E63DD'
  g.strokeStyle = INK
  g.lineWidth = Math.max(1.2, r * 0.16)
  g.beginPath()
  g.ellipse(x, y, r, r * (1 + wobble * 0.08), 0, 0, 7)
  g.fill()
  g.stroke()
  // cap
  g.fillStyle = '#FFC53D'
  g.beginPath()
  g.arc(x, y - r * 0.55, r * 0.55, Math.PI, 0)
  g.fill()
  g.stroke()
  face(g, x, y + r * 0.1, r / 10)
}

// ------------------------------------------------------------ slime forms
// each form is one function drawing a monster of radius r centred (x, y).

const forms = {
  spiky(g, x, y, r) {
    const spikes = 8
    g.beginPath()
    for (let i = 0; i <= spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2
      const rad = i % 2 === 0 ? r * 1.25 : r * 0.9
      const px = x + Math.cos(a) * rad
      const py = y + Math.sin(a) * rad
      i === 0 ? g.moveTo(px, py) : g.lineTo(px, py)
    }
    g.closePath()
    g.fill()
    g.stroke()
  },
  crabby(g, x, y, r) {
    g.beginPath()
    g.ellipse(x, y, r * 1.15, r * 0.9, 0, 0, 7)
    g.fill(); g.stroke()
    for (const s of [-1, 1]) { // little claws
      g.beginPath()
      g.arc(x + s * r * 1.25, y - r * 0.5, r * 0.35, 0, 7)
      g.fill(); g.stroke()
    }
  },
  shard(g, x, y, r) {
    g.beginPath()
    g.moveTo(x, y - r * 1.35)
    g.lineTo(x + r, y - r * 0.1)
    g.lineTo(x + r * 0.6, y + r)
    g.lineTo(x - r * 0.6, y + r)
    g.lineTo(x - r, y - r * 0.1)
    g.closePath()
    g.fill(); g.stroke()
  },
  square(g, x, y, r) {
    const rr = r * 0.35
    g.beginPath()
    g.roundRect(x - r, y - r, r * 2, r * 2, rr)
    g.fill(); g.stroke()
  },
  tall(g, x, y, r) {
    g.beginPath()
    g.roundRect(x - r * 0.75, y - r * 1.4, r * 1.5, r * 2.4, r * 0.7)
    g.fill(); g.stroke()
  },
  drippy(g, x, y, r) {
    g.beginPath()
    g.arc(x, y - r * 0.2, r, Math.PI, 0)
    g.quadraticCurveTo(x + r, y + r * 0.9, x + r * 0.45, y + r * 0.75)
    g.quadraticCurveTo(x + r * 0.25, y + r * 1.2, x - r * 0.1, y + r * 0.75)
    g.quadraticCurveTo(x - r * 0.5, y + r * 1.05, x - r * 0.7, y + r * 0.6)
    g.quadraticCurveTo(x - r, y + r * 0.5, x - r, y - r * 0.2)
    g.closePath()
    g.fill(); g.stroke()
  },
  swirl(g, x, y, r) {
    g.beginPath()
    g.arc(x, y, r, 0, 7)
    g.fill(); g.stroke()
    g.beginPath()
    g.arc(x, y - r * 1.05, r * 0.4, Math.PI * 0.9, Math.PI * 2.1)
    g.fill(); g.stroke()
  },
}

export function drawSlime(g, x, y, r, theme, big = false, awake = true) {
  g.fillStyle = big ? theme.boss : theme.enemy
  g.strokeStyle = INK
  g.lineWidth = Math.max(1.2, r * 0.14)
  forms[theme.form](g, x, y, r)
  face(g, x, y + (big ? -r * 0.05 : 0), r / (big ? 11 : 9), awake)
}

// stars: bullets and death-pops share the shape
export function drawStar(g, x, y, r, color = '#FFC53D') {
  g.fillStyle = color
  g.strokeStyle = INK
  g.lineWidth = Math.max(1, r * 0.18)
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 === 0 ? r : r * 0.45
    const px = x + Math.cos(a) * rad
    const py = y + Math.sin(a) * rad
    i === 0 ? g.moveTo(px, py) : g.lineTo(px, py)
  }
  g.closePath()
  g.fill()
  g.stroke()
}
