// icon set for Sort It: a tube with three sorted balls, one wearing the face.
// zero dependencies (node zlib writes the png). adapted from the kidgames
// template's make-icons.mjs; the sizes and maskable safe-zone maths are kept.
//
//   node tools/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..')

const COLORS = {
  bg: [0x3e, 0x63, 0xdd, 0xff],
  tube: [0xff, 0xf6, 0xe5, 0xff],
  ink: [0x2a, 0x23, 0x31, 0xff],
  red: [0x3e, 0x63, 0xdd, 0xff],
  green: [0xff, 0xc5, 0x3d, 0xff],
  blue: [0xff, 0xf6, 0xe5, 0xff],
  star: [0xff, 0xc5, 0x3d, 0xff],
}

// a maskable icon can be cropped to a circle by the launcher, so everything
// that must survive lives inside the centre 80%.
const CONTENT = { normal: 0.72, maskable: 0.56 }
const SS = 4

function canvas(size) {
  return { size, data: new Uint8ClampedArray(size * size * 4) }
}

function blend(c, index, [r, g, b, a], coverage) {
  const alpha = (a / 255) * coverage
  if (alpha <= 0) return
  const i = index * 4
  c.data[i] = c.data[i] * (1 - alpha) + r * alpha
  c.data[i + 1] = c.data[i + 1] * (1 - alpha) + g * alpha
  c.data[i + 2] = c.data[i + 2] * (1 - alpha) + b * alpha
  c.data[i + 3] = c.data[i + 3] * (1 - alpha) + 255 * alpha
}

function fill(c, color, test) {
  for (let y = 0; y < c.size; y++) {
    for (let x = 0; x < c.size; x++) {
      if (test(x + 0.5, y + 0.5)) blend(c, y * c.size + x, color, 1)
    }
  }
}

const roundedRect = (x, y, w, h, r) => (px, py) => {
  if (px < x || py < y || px > x + w || py > y + h) return false
  const dx = Math.max(x + r - px, 0, px - (x + w - r))
  const dy = Math.max(y + r - py, 0, py - (y + h - r))
  return dx * dx + dy * dy <= r * r
}

const circle = (cx, cy, r) => (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r

const arc = (cx, cy, r, thickness, from, to) => (px, py) => {
  const d = Math.hypot(px - cx, py - cy)
  if (Math.abs(d - r) > thickness / 2) return false
  let a = Math.atan2(py - cy, px - cx)
  if (a < 0) a += Math.PI * 2
  return a >= from && a <= to
}

function downsample(big, size) {
  const out = canvas(size)
  const n = SS * SS
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * big.size + (x * SS + sx)) * 4
          r += big.data[i]; g += big.data[i + 1]; b += big.data[i + 2]; a += big.data[i + 3]
        }
      }
      const i = (y * size + x) * 4
      out.data[i] = r / n; out.data[i + 1] = g / n; out.data[i + 2] = b / n; out.data[i + 3] = a / n
    }
  }
  return out
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, body) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

function png(c) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(c.size, 0)
  ihdr.writeUInt32BE(c.size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc(c.size * (c.size * 4 + 1))
  for (let y = 0; y < c.size; y++) {
    const from = y * c.size * 4
    raw[y * (c.size * 4 + 1)] = 0
    Buffer.from(c.data.subarray(from, from + c.size * 4)).copy(raw, y * (c.size * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ------------------------------------------------------------- the artwork
// Shoot It's icon: one cream buddy with the amber cap, star overhead.
// one description, drawn as pixels and as svg, so the two never drift.

function starPoints(cx, cy, r) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 === 0 ? r : r * 0.45
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad])
  }
  return pts
}

// even-odd ray cast, good enough for a star
const polygon = pts => (px, py) => {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function parts(size, kind) {
  const content = size * CONTENT[kind]
  const cx = size / 2
  const cy = size / 2
  const edge = Math.max(2, size * 0.018)
  const buddy = { cx, cy: cy + content * 0.14, r: content * 0.30 }
  const star = { cx: cx + content * 0.22, cy: cy - content * 0.26, r: content * 0.17 }
  return { cx, cy, edge, buddy, star }
}

function draw(size, kind) {
  const big = canvas(size * SS)
  const s = size * SS
  const p = parts(s, kind)
  const e = p.edge
  const b = p.buddy

  if (kind === 'maskable') fill(big, COLORS.bg, () => true)
  else fill(big, COLORS.bg, roundedRect(s * 0.04, s * 0.04, s * 0.92, s * 0.92, s * 0.22))

  // star first, so the buddy overlaps it slightly
  const outer = starPoints(p.star.cx, p.star.cy, p.star.r + e * 1.8)
  fill(big, COLORS.ink, polygon(outer))
  fill(big, COLORS.star, polygon(starPoints(p.star.cx, p.star.cy, p.star.r)))

  // buddy: ink outline, cream body, amber cap
  fill(big, COLORS.ink, circle(b.cx, b.cy, b.r + e * 1.8))
  fill(big, COLORS.tube, circle(b.cx, b.cy, b.r))
  const capTest = (px, py) => py < b.cy - b.r * 0.42 && circle(b.cx, b.cy, b.r)(px, py)
  fill(big, COLORS.green, capTest)
  fill(big, COLORS.ink, (px, py) =>
    Math.abs(py - (b.cy - b.r * 0.42)) < e && circle(b.cx, b.cy, b.r)(px, py))

  // face
  const er = b.r * 0.11
  fill(big, COLORS.ink, circle(b.cx - b.r * 0.32, b.cy + b.r * 0.02, er))
  fill(big, COLORS.ink, circle(b.cx + b.r * 0.32, b.cy + b.r * 0.02, er))
  fill(big, COLORS.ink, arc(b.cx, b.cy + b.r * 0.12, b.r * 0.42, b.r * 0.14, 0.45, Math.PI - 0.45))

  return downsample(big, size)
}

function svg(size = 512) {
  const p = parts(size, 'normal')
  const hex = ([r, g, b]) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
  const e = p.edge
  const b = p.buddy
  const star = starPoints(p.star.cx, p.star.cy, p.star.r)
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const smile = { r: b.r * 0.42, y: b.cy + b.r * 0.12 }
  const from = { x: b.cx + smile.r * Math.cos(0.45), y: smile.y + smile.r * Math.sin(0.45) }
  const to = { x: b.cx + smile.r * Math.cos(Math.PI - 0.45), y: smile.y + smile.r * Math.sin(Math.PI - 0.45) }
  const capY = (b.cy - b.r * 0.42).toFixed(1)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect x="${size * 0.04}" y="${size * 0.04}" width="${size * 0.92}" height="${size * 0.92}" rx="${size * 0.22}" fill="${hex(COLORS.bg)}"/>
  <polygon points="${star}" fill="${hex(COLORS.star)}" stroke="${hex(COLORS.ink)}" stroke-width="${(e * 2.4).toFixed(1)}" stroke-linejoin="round"/>
  <circle cx="${b.cx}" cy="${b.cy.toFixed(1)}" r="${b.r.toFixed(1)}" fill="${hex(COLORS.tube)}" stroke="${hex(COLORS.ink)}" stroke-width="${(e * 2.4).toFixed(1)}"/>
  <clipPath id="cap"><circle cx="${b.cx}" cy="${b.cy.toFixed(1)}" r="${b.r.toFixed(1)}"/></clipPath>
  <rect x="${(b.cx - b.r).toFixed(1)}" y="${(b.cy - b.r).toFixed(1)}" width="${(b.r * 2).toFixed(1)}" height="${(b.r * 0.58).toFixed(1)}" fill="${hex(COLORS.green)}" clip-path="url(#cap)"/>
  <line x1="${(b.cx - b.r).toFixed(1)}" y1="${capY}" x2="${(b.cx + b.r).toFixed(1)}" y2="${capY}" stroke="${hex(COLORS.ink)}" stroke-width="${(e * 2).toFixed(1)}" clip-path="url(#cap)"/>
  <circle cx="${(b.cx - b.r * 0.32).toFixed(1)}" cy="${(b.cy + b.r * 0.02).toFixed(1)}" r="${(b.r * 0.11).toFixed(1)}" fill="${hex(COLORS.ink)}"/>
  <circle cx="${(b.cx + b.r * 0.32).toFixed(1)}" cy="${(b.cy + b.r * 0.02).toFixed(1)}" r="${(b.r * 0.11).toFixed(1)}" fill="${hex(COLORS.ink)}"/>
  <path d="M ${to.x.toFixed(1)} ${to.y.toFixed(1)} A ${smile.r.toFixed(1)} ${smile.r.toFixed(1)} 0 0 0 ${from.x.toFixed(1)} ${from.y.toFixed(1)}" stroke="${hex(COLORS.ink)}" stroke-width="${(b.r * 0.14).toFixed(1)}" stroke-linecap="round" fill="none"/>
</svg>
`
}

writeFileSync(join(OUT, 'icon.svg'), svg())
for (const size of [180, 192, 512]) writeFileSync(join(OUT, `icon-${size}.png`), png(draw(size, 'normal')))
writeFileSync(join(OUT, 'icon-maskable-512.png'), png(draw(512, 'maskable')))
console.log('wrote icon.svg, icon-180.png, icon-192.png, icon-512.png, icon-maskable-512.png')
