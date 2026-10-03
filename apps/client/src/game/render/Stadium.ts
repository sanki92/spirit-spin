import { AdditiveBlending, BoxGeometry, BufferAttribute, DoubleSide, Group, LatheGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial, RepeatWrapping, RingGeometry, Texture, Vector2 } from 'three'

export const BOWL_DEPTH = 0.16
export const bowlHeight = (r: number) => BOWL_DEPTH * r * r
const POCKET_DEG = [90, 210, 330]
const POCKET_HALF = (18 * Math.PI) / 180
const WALL_IN = 1.0
const WALL_OUT = 1.13
const WALL_H = 0.14

export function buildStadium(bowl: Texture, floor: Texture | null, rim: Texture | null = null, accent = 0x3be6ff): Group {
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

  const pockets = POCKET_DEG.map(d => (d * Math.PI) / 180)
  const top = BOWL_DEPTH + WALL_H
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
    ? new MeshLambertMaterial({ map: lip, color: 0xffffff, emissive: accent, emissiveMap: lip, emissiveIntensity: 1.6, side: DoubleSide })
    : new MeshBasicMaterial({ color: accent, side: DoubleSide })
  const capMat = new MeshLambertMaterial({ color: 0x2a3350, emissive: accent, emissiveIntensity: 0.25 })
  const ring = (a: Vector2, b: Vector2, phi: number, len: number, mat: MeshLambertMaterial | MeshBasicMaterial) => new Mesh(new LatheGeometry([a, b], 40, phi, len), mat)
  for (let i = 0; i < pockets.length; i++) {
    const start = (pockets[i] as number) + POCKET_HALF
    const next = (pockets[(i + 1) % pockets.length] as number) + (i === pockets.length - 1 ? Math.PI * 2 : 0)
    const len = next - POCKET_HALF - start
    const phi = start + Math.PI / 2
    g.add(ring(new Vector2(WALL_IN, BOWL_DEPTH - 0.004), new Vector2(WALL_IN + 0.012, top), phi, len, wallMat))
    g.add(ring(new Vector2(WALL_IN + 0.012, top), new Vector2(WALL_OUT - 0.01, top + 0.012), phi, len, lipMat))
    g.add(ring(new Vector2(WALL_OUT - 0.01, top + 0.012), new Vector2(WALL_OUT, BOWL_DEPTH - 0.004), phi, len, wallMat))
    for (const a of [start, start + len]) {
      const cap = new Mesh(new BoxGeometry(WALL_OUT - WALL_IN + 0.02, WALL_H + 0.03, 0.035), capMat)
      const r = (WALL_IN + WALL_OUT) / 2
      cap.position.set(Math.cos(a) * r, BOWL_DEPTH + (WALL_H + 0.03) / 2, -Math.sin(a) * r)
      cap.rotation.y = a
      g.add(cap)
    }
  }
  const pocketMat = new MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.32, blending: AdditiveBlending, side: DoubleSide, depthWrite: false })
  for (const a of pockets) {
    const p = new Mesh(new RingGeometry(0.97, WALL_OUT + 0.04, 16, 1, a - POCKET_HALF, POCKET_HALF * 2), pocketMat)
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
  return g
}
