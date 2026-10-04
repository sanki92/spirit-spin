import { ConeGeometry, DoubleSide, ExtrudeGeometry, Group, Mesh, MeshLambertMaterial, Shape, Vector2, Vector3, type Texture } from 'three'
import { cachedRing } from './partMesh'
import { bowlHeight } from './Stadium'

const SHARDS = 5
const GRAVITY = 7
const uvGen = {
  generateTopUV: (_g: ExtrudeGeometry, v: number[], a: number, b: number, c: number) => [a, b, c].map(i => new Vector2(v[i * 3]! * 0.5 + 0.5, v[i * 3 + 1]! * 0.5 + 0.5)),
  generateSideWallUV: (_g: ExtrudeGeometry, v: number[], a: number, b: number, c: number, d: number) => [a, b, c, d].map(i => new Vector2(v[i * 3]! * 0.5 + 0.5, v[i * 3 + 1]! * 0.5 + 0.5)),
}

function shardShape(a0: number, a1: number): Shape {
  const pts: Vector2[] = []
  const edge = (a: number, from: number, to: number) => {
    for (let k = 1; k < 4; k++) {
      const r = from + ((to - from) * k) / 4
      const j = a + (Math.random() - 0.5) * 0.22
      pts.push(new Vector2(Math.cos(j) * r, Math.sin(j) * r))
    }
  }
  for (let k = 0; k <= 8; k++) { const a = a0 + ((a1 - a0) * k) / 8; pts.push(new Vector2(Math.cos(a), Math.sin(a))) }
  edge(a1, 1, 0.3)
  for (let k = 8; k >= 0; k--) { const a = a0 + ((a1 - a0) * k) / 8; pts.push(new Vector2(Math.cos(a) * 0.3, Math.sin(a) * 0.3)) }
  edge(a0, 0.3, 1)
  return new Shape(pts)
}

interface Piece { mesh: Mesh; v: Vector3; w: Vector3; lift: number; lay: number; rest: boolean }

export class Shatter {
  readonly group = new Group()
  private pieces: Piece[] = []
  private mats: MeshLambertMaterial[] = []

  constructor(blade: Texture, disc: Texture, readonly radius: number) {
    const bladeMat = new MeshLambertMaterial({ map: blade, alphaTest: 0.35, side: DoubleSide })
    const cuts = [0]
    for (let i = 1; i < SHARDS; i++) cuts.push((i / SHARDS) * Math.PI * 2 + (Math.random() - 0.5) * 0.5)
    cuts.push(Math.PI * 2)
    for (let i = 0; i < SHARDS; i++) {
      const g = new ExtrudeGeometry(shardShape(cuts[i]!, cuts[i + 1]!), { depth: 0.075, bevelEnabled: false, curveSegments: 1, UVGenerator: uvGen })
      g.rotateX(-Math.PI / 2)
      const m = new Mesh(g, bladeMat)
      m.scale.setScalar(radius)
      this.add(m, 0.012)
    }
    const { geometry, edge } = cachedRing(disc.uuid, disc, 0.06, 0.009)
    const discMats = [new MeshLambertMaterial({ map: disc, alphaTest: 0.35 }), new MeshLambertMaterial({ color: edge.multiplyScalar(0.8) })]
    const d = new Mesh(geometry, discMats)
    d.scale.setScalar(radius * 0.86)
    this.add(d, 0.01)
    const tipMat = new MeshLambertMaterial({ color: 0x9aa3b8 })
    const tip = new Mesh(new ConeGeometry(radius * 0.22, radius * 0.45, 14), tipMat)
    this.add(tip, radius * 0.2, Math.PI / 2)
    this.mats.push(bladeMat, ...discMats, tipMat)
    this.group.visible = false
  }

  private add(mesh: Mesh, lift: number, lay = 0): void {
    this.pieces.push({ mesh, v: new Vector3(), w: new Vector3(), lift, lay, rest: false })
    this.group.add(mesh)
  }

  burst(x: number, y: number, power = 1): void {
    const base = bowlHeight(Math.min(1, Math.hypot(x, y))) + 0.07
    this.pieces.forEach((p, i) => {
      const shard = i < SHARDS
      const a = shard ? ((i + 0.5) / SHARDS) * Math.PI * 2 + (Math.random() - 0.5) * 0.4 : Math.random() * Math.PI * 2
      const sp = shard ? (0.9 + Math.random() * 0.9) * power : 0.25 + Math.random() * 0.3
      p.mesh.position.set(x, base, -y)
      p.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0)
      p.v.set(Math.cos(a) * sp, shard ? 1.3 + Math.random() * 1.1 : 0.9 + Math.random() * 0.5, -Math.sin(a) * sp)
      p.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 18)
      p.rest = false
    })
    this.group.visible = true
  }

  update(dt: number): void {
    if (!this.group.visible || dt <= 0) return
    for (const p of this.pieces) {
      if (p.rest) continue
      const m = p.mesh
      p.v.y -= GRAVITY * dt
      m.position.addScaledVector(p.v, dt)
      m.rotation.x += p.w.x * dt
      m.rotation.y += p.w.y * dt
      m.rotation.z += p.w.z * dt
      const r = Math.hypot(m.position.x, m.position.z)
      if (r > 0.97 && r < 1.2 && m.position.y < 0.32) {
        const nx = m.position.x / r, nz = m.position.z / r, vn = p.v.x * nx + p.v.z * nz
        if (vn > 0) { p.v.x -= 1.5 * vn * nx; p.v.z -= 1.5 * vn * nz }
        m.position.x = nx * 0.97
        m.position.z = nz * 0.97
      }
      const floor = bowlHeight(Math.min(1, Math.hypot(m.position.x, m.position.z))) + p.lift
      if (m.position.y < floor) {
        m.position.y = floor
        if (p.v.y < 0) p.v.y *= -0.3
        p.v.x *= 0.72
        p.v.z *= 0.72
        p.w.multiplyScalar(0.55)
        m.rotation.x *= 0.55
        m.rotation.z *= 0.55
        if (Math.abs(p.v.y) < 0.25 && Math.hypot(p.v.x, p.v.z) < 0.05) {
          p.rest = true
          m.rotation.x = 0
          m.rotation.z = p.lay
        }
      }
    }
  }

  clear(): void {
    this.group.visible = false
  }

  dispose(): void {
    for (const p of this.pieces) p.mesh.geometry.dispose()
    for (const m of this.mats) m.dispose()
  }
}
