import { AdditiveBlending, BufferAttribute, CylinderGeometry, DoubleSide, Group, LatheGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial, RingGeometry, Texture, Vector2 } from 'three'

export const BOWL_DEPTH = 0.16
export const bowlHeight = (r: number) => BOWL_DEPTH * r * r
const POCKET_DEG = [90, 210, 330]
const POCKET_HALF = (18 * Math.PI) / 180

export function buildStadium(bowl: Texture, floor: Texture | null): Group {
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

  const wallMat = new MeshLambertMaterial({ color: 0x1b2340, emissive: 0x0a3a66, emissiveIntensity: 0.6 })
  const glowMat = new MeshBasicMaterial({ color: 0x46f0ff, transparent: true, opacity: 0.85, blending: AdditiveBlending, side: DoubleSide })
  const pocketMat = new MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.9, blending: AdditiveBlending, side: DoubleSide })
  const pockets = POCKET_DEG.map(d => (d * Math.PI) / 180)
  for (let i = 0; i < pockets.length; i++) {
    const start = (pockets[i] as number) + POCKET_HALF
    const next = (pockets[(i + 1) % pockets.length] as number) + (i === pockets.length - 1 ? Math.PI * 2 : 0)
    const len = next - POCKET_HALF - start
    const wall = new Mesh(new CylinderGeometry(1.06, 1.06, 0.12, 48, 1, true, start + Math.PI / 2, len), wallMat)
    wall.position.y = BOWL_DEPTH + 0.06
    g.add(wall)
    const rim = new Mesh(new RingGeometry(1.0, 1.06, 48, 1, start, len), glowMat)
    rim.rotation.x = -Math.PI / 2
    rim.position.y = BOWL_DEPTH + 0.121
    g.add(rim)
  }
  for (const a of pockets) {
    const p = new Mesh(new RingGeometry(1.0, 1.14, 16, 1, a - POCKET_HALF, POCKET_HALF * 2), pocketMat)
    p.rotation.x = -Math.PI / 2
    p.position.y = BOWL_DEPTH + 0.005
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
