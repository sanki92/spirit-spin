import { BufferGeometry, Color, ExtrudeGeometry, LatheGeometry, Path, Shape, Vector2, type Texture } from 'three'

const SAMPLES = 256

function pixels(t: Texture): { data: Uint8ClampedArray; w: number; h: number } {
  const img = t.image as CanvasImageSource & { width: number; height: number }
  const w = SAMPLES, h = Math.max(8, Math.round((SAMPLES * img.height) / img.width))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  return { data: ctx.getImageData(0, 0, w, h).data, w, h }
}

const DIRS = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]] as const

function trace(solid: (x: number, y: number) => boolean, sx: number, sy: number, bx: number, by: number): [number, number][] {
  const out: [number, number][] = [[sx, sy]]
  let px = sx, py = sy, bi = DIRS.findIndex(([dx, dy]) => px + dx === bx && py + dy === by)
  if (bi < 0) return out
  for (let guard = 0; guard < 40000; guard++) {
    let found = -1
    for (let k = 1; k <= 8; k++) {
      const i = (bi + k) % 8
      if (solid(px + DIRS[i]![0], py + DIRS[i]![1])) { found = i; break }
    }
    if (found < 0) return out
    const prev = (found + 7) % 8
    const nbx = px + DIRS[prev]![0], nby = py + DIRS[prev]![1]
    px += DIRS[found]![0]
    py += DIRS[found]![1]
    bi = DIRS.findIndex(([dx, dy]) => px + dx === nbx && py + dy === nby)
    if (px === sx && py === sy) break
    out.push([px, py])
  }
  return out
}

function simplify(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = pts[a]!, [bx, by] = pts[b]!
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1
    let best = -1, bd = 0
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i]![0] - ax) * dy - (pts[i]![1] - ay) * dx) / len
      if (d > bd) { bd = d; best = i }
    }
    if (best >= 0 && bd > eps) { keep[best] = 1; stack.push([a, best], [best, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

const uvGen = {
  generateTopUV: (_g: ExtrudeGeometry, v: number[], a: number, b: number, c: number) =>
    [a, b, c].map(i => new Vector2(v[i * 3]! * 0.5 + 0.5, v[i * 3 + 1]! * 0.5 + 0.5)),
  generateSideWallUV: (_g: ExtrudeGeometry, v: number[], a: number, b: number, c: number, d: number) =>
    [a, b, c, d].map(i => new Vector2(v[i * 3]! * 0.5 + 0.5, v[i * 3 + 1]! * 0.5 + 0.5)),
}

export function ringGeometry(t: Texture, depth: number, bevel: number): { geometry: BufferGeometry; edge: Color } {
  const { data, w, h } = pixels(t)
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2), half = Math.min(w, h) / 2
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3]! > 110
  const to = (p: [number, number]) => new Vector2((p[0] + 0.5 - w / 2) / half, -(p[1] + 0.5 - h / 2) / half)
  let outerRaw: [number, number][] = []
  for (let ox = 0; ox < cx && outerRaw.length < 120; ox++) if (solid(ox, cy) && !solid(ox - 1, cy)) outerRaw = trace(solid, ox, cy, ox - 1, cy)
  const outer = simplify(outerRaw, 1.1)
  const shape = outer.length >= 3 ? new Shape(outer.map(to)) : new Shape().absarc(0, 0, 0.95, 0, Math.PI * 2, false)
  const reach = (pts: [number, number][]) => Math.max(...pts.map(([x, y]) => Math.hypot(x - cx, y - cy)))
  if (!solid(cx, cy)) {
    let ix = cx
    while (ix > 0 && !solid(ix, cy)) ix--
    if (ix > 0 && cx - ix > 2) {
      const inner = simplify(trace(solid, ix, cy, ix + 1, cy), 1.1)
      if (inner.length > 8 && outer.length >= 3 && reach(inner) < reach(outer) * 0.85) shape.holes.push(new Path(inner.map(to)))
    }
  }
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.5, bevelSegments: 1, curveSegments: 1, UVGenerator: uvGen })
  g.rotateX(-Math.PI / 2)
  let r = 0, gg = 0, b = 0, n = 0
  for (const [x, y] of outerRaw) {
    for (let k = 0; k < 3; k++) {
      const px = Math.round(x + (cx - x) * 0.02 * k), py = Math.round(y + (cy - y) * 0.02 * k), i = (py * w + px) * 4
      if (data[i + 3]! > 200) { r += data[i]!; gg += data[i + 1]!; b += data[i + 2]!; n++ }
    }
  }
  const edge = n ? new Color(r / n / 255, gg / n / 255, b / n / 255).convertSRGBToLinear() : new Color(0.5, 0.5, 0.55)
  return { geometry: g, edge }
}

export function tipGeometry(t: Texture, height: number): { geometry: BufferGeometry; radius: number } {
  const { data, w, h } = pixels(t)
  const rows: { y: number; r: number; c: number }[] = []
  for (let y = 0; y < h; y += 2) {
    let l = -1, rr = -1
    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]! > 110) { if (l < 0) l = x; rr = x }
    if (l >= 0) rows.push({ y, r: (rr - l) / 2, c: (l + rr + 1) / 2 })
  }
  const top = rows[0]?.y ?? 0, bottom = rows[rows.length - 1]?.y ?? h, span = Math.max(1, bottom - top)
  const k = height / span
  const pts = [new Vector2(0, 0)]
  const centers = [rows[rows.length - 1]?.c ?? w / 2]
  for (let i = rows.length - 1; i >= 0; i--) {
    pts.push(new Vector2(Math.max(0.002, rows[i]!.r * k * 0.97), (bottom - rows[i]!.y) * k))
    centers.push(rows[i]!.c)
  }
  pts.push(new Vector2(0, height))
  centers.push(rows[0]?.c ?? w / 2)
  const geometry = new LatheGeometry(pts, 48)
  const pos = geometry.attributes.position!, uv = geometry.attributes.uv!
  for (let i = 0; i < pos.count; i++) {
    const j = i % pts.length, vy = pos.getY(i)
    uv.setXY(i, (centers[j]! + pos.getX(i) / k) / w, 1 - (bottom - vy / k) / h)
  }
  uv.needsUpdate = true
  geometry.translate(0, -height, 0)
  return { geometry, radius: Math.max(...rows.map(r => r.r)) * k }
}

const ringCache = new Map<string, { geometry: BufferGeometry; edge: Color }>()
const tipCache = new Map<string, { geometry: BufferGeometry; radius: number }>()

export function cachedRing(key: string, t: Texture, depth: number, bevel: number): { geometry: BufferGeometry; edge: Color } {
  const k = `${key}|${depth}|${bevel}`
  let hit = ringCache.get(k)
  if (!hit) { hit = ringGeometry(t, depth, bevel); ringCache.set(k, hit) }
  return { geometry: hit.geometry.clone(), edge: hit.edge.clone() }
}

export function cachedTip(key: string, t: Texture, height: number): { geometry: BufferGeometry; radius: number } {
  const k = `${key}|${height}`
  let hit = tipCache.get(k)
  if (!hit) { hit = tipGeometry(t, height); tipCache.set(k, hit) }
  return { geometry: hit.geometry.clone(), radius: hit.radius }
}
