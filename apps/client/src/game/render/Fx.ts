import { AdditiveBlending, Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, Texture, Vector3, type Camera } from 'three'
import { bowlHeight } from './Stadium'

const PLANE = new PlaneGeometry(1, 1)
const FLAT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
const m4 = new Matrix4()
const pos = new Vector3()
const scl = new Vector3()
const col = new Color()
const spin = new Quaternion()
const AXIS_Y = new Vector3(0, 1, 0)
const tmpQ = new Quaternion()

export class Pool {
  readonly mesh: InstancedMesh
  private x: Float32Array
  private y: Float32Array
  private z: Float32Array
  private vx: Float32Array
  private vy: Float32Array
  private vz: Float32Array
  private life: Float32Array
  private max: Float32Array
  private size: Float32Array
  private grow: Float32Array
  private alive = 0

  constructor(tex: Texture, readonly cap: number, readonly flat: boolean) {
    this.mesh = new InstancedMesh(PLANE, new MeshBasicMaterial({ map: tex, blending: AdditiveBlending, transparent: true, depthWrite: false }), cap)
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    const f = () => new Float32Array(cap)
    this.x = f(); this.y = f(); this.z = f(); this.vx = f(); this.vy = f(); this.vz = f(); this.life = f(); this.max = f(); this.size = f(); this.grow = f()
    for (let i = 0; i < cap; i++) this.mesh.setColorAt(i, col.setRGB(0, 0, 0))
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow = 0): void {
    const i = this.alive < this.cap ? this.alive++ : Math.floor(Math.random() * this.cap)
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grow[i] = grow
  }

  clear(): void {
    this.alive = 0
    this.mesh.count = 0
  }

  update(dt: number, camQ: Quaternion, gravity: number): void {
    let n = this.alive
    for (let i = 0; i < n; i++) {
      this.life[i]! -= dt
      if (this.life[i]! <= 0) {
        n--
        this.copy(n, i)
        i--
        continue
      }
      this.vy[i]! -= gravity * dt
      this.x[i]! += this.vx[i]! * dt
      this.y[i] = Math.max(0.02, this.y[i]! + this.vy[i]! * dt)
      this.z[i]! += this.vz[i]! * dt
      const k = this.life[i]! / this.max[i]!
      const s = this.size[i]! + this.grow[i]! * (1 - k)
      pos.set(this.x[i]!, this.y[i]!, this.z[i]!)
      scl.set(s, s, s)
      if (this.flat) {
        spin.setFromAxisAngle(AXIS_Y, i * 1.3)
        tmpQ.copy(spin).multiply(FLAT)
        m4.compose(pos, tmpQ, scl)
      } else m4.compose(pos, camQ, scl)
      this.mesh.setMatrixAt(i, m4)
      this.mesh.setColorAt(i, col.setRGB(k, k, k))
    }
    this.alive = n
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  private copy(from: number, to: number): void {
    this.x[to] = this.x[from]!; this.y[to] = this.y[from]!; this.z[to] = this.z[from]!
    this.vx[to] = this.vx[from]!; this.vy[to] = this.vy[from]!; this.vz[to] = this.vz[from]!
    this.life[to] = this.life[from]!; this.max[to] = this.max[from]!; this.size[to] = this.size[from]!; this.grow[to] = this.grow[from]!
  }
}

export interface FxTextures { spark: Texture; shock: Texture; crack: Texture; hits: Record<string, Texture> }

export class Fx {
  readonly group = new Group()
  private sparks: Pool
  private hits: Record<string, Pool> = {}
  private rings: Pool
  private decals: Mesh[] = []
  private decalNext = 0
  private camQ = new Quaternion()

  constructor(tex: FxTextures, sparkCap: number) {
    this.sparks = new Pool(tex.spark, sparkCap, false)
    this.rings = new Pool(tex.shock, 8, true)
    this.group.add(this.sparks.mesh, this.rings.mesh)
    for (const [k, t] of Object.entries(tex.hits)) {
      this.hits[k] = new Pool(t, 12, false)
      this.group.add(this.hits[k].mesh)
    }
    for (let i = 0; i < 4; i++) {
      const d = new Mesh(new PlaneGeometry(0.55, 0.55), new MeshBasicMaterial({ map: tex.crack, transparent: true, depthWrite: false, opacity: 0.95 }))
      d.rotation.x = -Math.PI / 2
      d.visible = false
      this.decals.push(d)
      this.group.add(d)
    }
  }

  clash(x: number, y: number, energy: number, element: string | null): void {
    const h = bowlHeight(Math.min(1, Math.hypot(x, y))) + 0.08
    const n = Math.round(6 + Math.min(energy, 3) * 8)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 0.8 + Math.random() * 1.8 * Math.min(energy, 2.5)
      this.sparks.spawn(x, h, -y, Math.cos(a) * sp, 0.6 + Math.random() * 1.6, -Math.sin(a) * sp, 0.25 + Math.random() * 0.3, 0.05 + Math.random() * 0.06)
    }
    const hp = element ? this.hits[element] : undefined
    if (hp) hp.spawn(x, h + 0.05, -y, 0, 0.3, 0, 0.35, 0.35 + Math.min(energy, 3) * 0.12)
    if (energy > 1.4) this.rings.spawn(x, h - 0.05, -y, 0, 0, 0, 0.45, 0.2, 0.6 + energy * 0.25)
  }

  grind(x: number, y: number, nx: number, ny: number, amount: number): void {
    const h = bowlHeight(Math.min(1, Math.hypot(x, y))) + 0.06
    for (let i = 0; i < 3; i++) {
      const dir = Math.random() < 0.5 ? 1 : -1
      const sp = (0.9 + Math.random() * 1.4) * (0.6 + amount * 0.6)
      const tx = -ny * dir + nx * (Math.random() - 0.5) * 0.6, ty = nx * dir + ny * (Math.random() - 0.5) * 0.6
      this.sparks.spawn(x, h, -y, tx * sp, 0.3 + Math.random() * 0.9, -ty * sp, 0.16 + Math.random() * 0.18, 0.035 + Math.random() * 0.04)
    }
  }

  burst(x: number, y: number): void {
    const h = bowlHeight(Math.min(1, Math.hypot(x, y))) + 0.08
    this.sparks.spawn(x, h, -y, 0, 0.2, 0, 0.5, 0.9)
    this.rings.spawn(x, h - 0.05, -y, 0, 0, 0, 0.7, 0.2, 2.4)
  }

  crack(x: number, y: number): void {
    const d = this.decals[this.decalNext++ % this.decals.length]!
    d.position.set(x, bowlHeight(Math.min(1, Math.hypot(x, y))) + 0.004, -y)
    d.rotation.z = Math.random() * Math.PI
    d.visible = true
  }

  clearDecals(): void {
    for (const d of this.decals) d.visible = false
    this.sparks.clear()
    this.rings.clear()
    for (const p of Object.values(this.hits)) p.clear()
  }

  update(dt: number, camera: Camera): void {
    this.camQ.copy(camera.quaternion)
    this.sparks.update(dt, this.camQ, 6)
    this.rings.update(dt, this.camQ, 0)
    for (const p of Object.values(this.hits)) p.update(dt, this.camQ, 0)
  }
}
