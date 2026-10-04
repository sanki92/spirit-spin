import { POCKET_COS, POCKETS } from '@spirit/core'
import { AdditiveBlending, BufferAttribute, Color, CylinderGeometry, DoubleSide, Group, LatheGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial, RepeatWrapping, RingGeometry, Texture, Vector2 } from 'three'

export const BOWL_DEPTH = 0.16
export const bowlHeight = (r: number) => BOWL_DEPTH * r * r
const POCKET_ANGLES = POCKETS.map(([x, y]) => Math.atan2(y, x))
const POCKET_HALF = Math.acos(POCKET_COS)
const WALL_IN = 1.0
const WALL_OUT = 1.13
const WALL_H = 0.14
const TOP = BOWL_DEPTH + WALL_H
const SEGS = 48

export interface StadiumTop { x: number; y: number; out: boolean }
export interface StadiumView { group: Group; update(dt: number, tops: readonly StadiumTop[] | null): void; hitWall(x: number, y: number, energy?: number): void }

const angDiff = (a: number, b: number) => {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export function buildStadium(bowl: Texture, floor: Texture | null, rim: Texture | null = null, accent = 0x3be6ff): StadiumView {
  const g = new Group()
  const pts: Vector2[] = []
  for (let i = 0; i <= 24; i++) {
    const r = i / 24
    pts.push(new Vector2(r, bowlHeight(r)))
  }
  const geo = new LatheGeometry(pts, 96)
  const pos = geo.getAttribute('position') as BufferAttribute
  const uv = geo.getAttribute('uv') as BufferAttribute
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / 2, 0.5 - pos.getZ(i) / 2)
  uv.needsUpdate = true
  g.add(new Mesh(geo, new MeshLambertMaterial({ map: bowl, side: DoubleSide })))

  const tint = new Color(accent)
  const map = (t: Texture | null, rx: number, ry = 1, oy = 0) => {
    if (!t) return null
    const c = t.clone()
    c.wrapS = RepeatWrapping
    c.repeat.set(rx, ry)
    c.offset.set(0, oy)
    c.needsUpdate = true
    return c
  }
  const face = map(rim, 5), lip = map(rim, 5, 0.06, 0.86)
  const wallMat = face
    ? new MeshLambertMaterial({ map: face, color: 0xc4cee2, emissive: accent, emissiveMap: face, emissiveIntensity: 0.5, side: DoubleSide })
    : new MeshLambertMaterial({ color: 0x1b2340, emissive: 0x0a3a66, emissiveIntensity: 0.6, side: DoubleSide })
  const lipMat = lip
    ? new MeshLambertMaterial({ map: lip, color: 0xffffff, emissive: accent, emissiveMap: lip, emissiveIntensity: 0.55, side: DoubleSide })
    : new MeshBasicMaterial({ color: accent, side: DoubleSide })
  const glowMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
  const pylonMat = new MeshLambertMaterial({ color: 0x3a4566, emissive: accent, emissiveIntensity: 0.18 })
  const beaconMat = new MeshBasicMaterial({ color: accent })

  const glows: { attr: BufferAttribute; angles: Float32Array }[] = []
  const ring = (a: Vector2, b: Vector2, phi: number, len: number, mat: MeshLambertMaterial | MeshBasicMaterial) => new Mesh(new LatheGeometry([a, b], SEGS, phi, len), mat)
  for (let i = 0; i < POCKET_ANGLES.length; i++) {
    const start = (POCKET_ANGLES[i] as number) + POCKET_HALF
    let next = (POCKET_ANGLES[(i + 1) % POCKET_ANGLES.length] as number) - POCKET_HALF
    while (next <= start) next += Math.PI * 2
    const len = next - start
    const phi = start + Math.PI / 2
    g.add(ring(new Vector2(WALL_IN, BOWL_DEPTH - 0.004), new Vector2(WALL_IN + 0.012, TOP), phi, len, wallMat))
    g.add(ring(new Vector2(WALL_IN + 0.012, TOP), new Vector2(WALL_OUT - 0.01, TOP + 0.012), phi, len, lipMat))
    g.add(ring(new Vector2(WALL_OUT - 0.01, TOP + 0.012), new Vector2(WALL_OUT, BOWL_DEPTH - 0.004), phi, len, wallMat))
    const band = new LatheGeometry([new Vector2(WALL_IN + 0.006, TOP + 0.004), new Vector2(WALL_IN + 0.034, TOP + 0.008)], SEGS, phi, len)
    const n = band.getAttribute('position').count
    const angles = new Float32Array(n)
    for (let v = 0; v < n; v++) angles[v] = start + (Math.floor(v / 2) / SEGS) * len
    const attr = new BufferAttribute(new Float32Array(n * 3), 3)
    band.setAttribute('color', attr)
    glows.push({ attr, angles })
    g.add(new Mesh(band, glowMat))
    for (const a of [start, start + len]) {
      const r = (WALL_IN + WALL_OUT) / 2
      const pylon = new Mesh(new CylinderGeometry(0.036, 0.046, WALL_H + 0.05, 12), pylonMat)
      pylon.position.set(Math.cos(a) * r, BOWL_DEPTH + (WALL_H + 0.05) / 2, -Math.sin(a) * r)
      const beacon = new Mesh(new CylinderGeometry(0.03, 0.036, 0.018, 12), beaconMat)
      beacon.position.set(pylon.position.x, BOWL_DEPTH + WALL_H + 0.06, pylon.position.z)
      g.add(pylon, beacon)
    }
  }

  const pocketMats: MeshBasicMaterial[] = []
  for (const a of POCKET_ANGLES) {
    const pg = new RingGeometry(0.9, WALL_OUT + 0.06, 12, 4, a - POCKET_HALF, POCKET_HALF * 2)
    const pp = pg.getAttribute('position') as BufferAttribute
    const col = new Float32Array(pp.count * 3)
    for (let v = 0; v < pp.count; v++) {
      const r = Math.hypot(pp.getX(v), pp.getY(v))
      const k = r < WALL_IN ? (r - 0.9) / (WALL_IN - 0.9) : 1 - (r - WALL_IN) / (WALL_OUT + 0.06 - WALL_IN)
      col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = Math.max(0, Math.min(1, k)) ** 1.5
    }
    pg.setAttribute('color', new BufferAttribute(col, 3))
    const m = new MeshBasicMaterial({ color: 0xff3b2f, vertexColors: true, transparent: true, blending: AdditiveBlending, side: DoubleSide, depthWrite: false })
    pocketMats.push(m)
    const p = new Mesh(pg, m)
    p.rotation.x = -Math.PI / 2
    p.position.y = BOWL_DEPTH + 0.004
    g.add(p)
  }
  if (floor) {
    const f = new Mesh(new RingGeometry(1.05, 3.6, 96, 1), new MeshLambertMaterial({ map: floor }))
    f.rotation.x = -Math.PI / 2
    f.position.y = BOWL_DEPTH - 0.002
    g.add(f)
  }

  const flashes: { a: number; t: number; e: number }[] = []
  const wasOut = [false, false]
  let clock = 0
  const hitWall = (x: number, y: number, energy = 1) => {
    flashes.push({ a: Math.atan2(y, x), t: 0, e: energy })
    if (flashes.length > 8) flashes.shift()
  }
  const update = (dt: number, tops: readonly StadiumTop[] | null) => {
    const still = document.documentElement.classList.contains('reduce-motion')
    clock += dt
    for (const f of flashes) f.t += dt
    while (flashes.length && flashes[0]!.t > 1) flashes.shift()
    tops?.forEach((t, i) => {
      if (t.out && !wasOut[i]) hitWall(t.x, t.y, 2.4)
      wasOut[i] = t.out
    })
    if (!tops) wasOut.fill(false)
    const head = clock * (still ? 0.4 : 1.5)
    for (const { attr, angles } of glows) {
      const c = attr.array as Float32Array
      for (let v = 0; v < angles.length; v++) {
        const a = angles[v]!
        let k = 0.12, w = 0
        for (let p = 0; p < 2; p++) { const d = angDiff(a, head + p * Math.PI) / 0.16; k += 1.1 * Math.exp(-d * d) }
        for (const f of flashes) { const d = angDiff(a, f.a) / 0.24; const h = f.e * Math.exp(-d * d) * Math.exp(-f.t * 5); k += h * 1.4; w += h }
        const white = Math.min(1, w * 0.6)
        c[v * 3] = k * (tint.r + (1 - tint.r) * white)
        c[v * 3 + 1] = k * (tint.g + (1 - tint.g) * white)
        c[v * 3 + 2] = k * (tint.b + (1 - tint.b) * white)
      }
      attr.needsUpdate = true
    }
    POCKET_ANGLES.forEach((a, i) => {
      const mx = Math.cos(a), my = Math.sin(a)
      let danger = 0
      for (const t of tops ?? []) if (!t.out) danger = Math.max(danger, 1 - Math.hypot(t.x - mx, t.y - my) / 0.55)
      danger = Math.max(0, danger)
      let flash = 0
      for (const f of flashes) if (Math.abs(angDiff(f.a, a)) < POCKET_HALF * 1.4) flash += f.e * Math.exp(-f.t * 4)
      const pulse = danger > 0.3 && !still ? 0.75 + 0.25 * Math.sin(clock * 14) : 1
      const k = 0.3 + 1.2 * danger * pulse + 0.6 * flash
      pocketMats[i]!.color.setRGB(1 * k, 0.23 * k, 0.18 * k)
    })
  }
  update(0, null)
  return { group: g, update, hitWall }
}
