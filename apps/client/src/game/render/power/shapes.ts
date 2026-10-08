import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicMaterial, NormalBlending, PlaneGeometry, RepeatWrapping, Sprite, SpriteMaterial, Vector3, type Texture } from 'three'
import { bowlHeight } from '../Stadium'

export const floorAt = (x: number, y: number) => bowlHeight(Math.min(1, Math.hypot(x, y)))

export const approach = (v: number, target: number, dt: number, rate: number) => v + (target - v) * Math.min(1, dt * rate)

const side = new Vector3(), dir = new Vector3(), nrm = new Vector3(), bin = new Vector3()
const UP = new Vector3(0, 1, 0), X = new Vector3(1, 0, 0)
const PLANE = new PlaneGeometry(1, 1)

export function tiled(tex: Texture): Texture {
  const t = tex.clone()
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  t.needsUpdate = true
  return t
}

function material(tex: Texture, additive: boolean): MeshBasicMaterial {
  return new MeshBasicMaterial({ map: tiled(tex), transparent: true, depthWrite: false, side: DoubleSide, blending: additive ? AdditiveBlending : NormalBlending, opacity: 0 })
}

export class Ribbon {
  readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>
  readonly points: Vector3[]
  private readonly pos: Float32Array

  constructor(tex: Texture, readonly count: number, readonly width: number, additive = true) {
    this.points = Array.from({ length: count }, () => new Vector3())
    this.pos = new Float32Array(count * 6)
    const uv = new Float32Array(count * 4)
    const idx: number[] = []
    for (let i = 0; i < count; i++) {
      const u = i / (count - 1)
      uv.set([u, 0, u, 1], i * 4)
      if (i < count - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3) }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage))
    g.setAttribute('uv', new BufferAttribute(uv, 2))
    g.setIndex(idx)
    this.mesh = new Mesh(g, material(tex, additive))
    this.mesh.frustumCulled = false
    this.mesh.visible = false
  }

  layout(flat: boolean): void {
    const n = this.count, p = this.points
    for (let i = 0; i < n; i++) {
      dir.subVectors(p[Math.min(n - 1, i + 1)]!, p[Math.max(0, i - 1)]!)
      if (flat) side.set(-dir.z, 0, dir.x)
      else side.copy(UP)
      const l = side.length()
      if (l > 1e-6) side.multiplyScalar(this.width / 2 / l)
      else side.set(0, 0, 0)
      const c = p[i]!, o = i * 6
      this.pos[o] = c.x - side.x; this.pos[o + 1] = c.y - side.y; this.pos[o + 2] = c.z - side.z
      this.pos[o + 3] = c.x + side.x; this.pos[o + 4] = c.y + side.y; this.pos[o + 5] = c.z + side.z
    }
    this.mesh.geometry.attributes.position!.needsUpdate = true
  }

  scroll(du: number): void {
    this.mesh.material.map!.offset.x += du
  }

  fade(target: number, dt: number, rate = 8): void {
    const m = this.mesh.material
    m.opacity = approach(m.opacity, target, dt, rate)
    this.mesh.visible = m.opacity > 0.01
  }
}

export class Tube {
  readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>
  readonly points: Vector3[]
  private readonly pos: Float32Array

  constructor(tex: Texture, readonly count: number, readonly radial: number, public radius: number, additive = false) {
    this.points = Array.from({ length: count }, () => new Vector3())
    const ring = radial + 1
    this.pos = new Float32Array(count * ring * 3)
    const uv = new Float32Array(count * ring * 2)
    const idx: number[] = []
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < ring; k++) {
        uv.set([i / (count - 1), k / radial], (i * ring + k) * 2)
        if (i < count - 1 && k < radial) {
          const a = i * ring + k, b = a + ring
          idx.push(a, b, a + 1, a + 1, b, b + 1)
        }
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage))
    g.setAttribute('uv', new BufferAttribute(uv, 2))
    g.setIndex(idx)
    this.mesh = new Mesh(g, material(tex, additive))
    this.mesh.frustumCulled = false
    this.mesh.visible = false
  }

  layout(): void {
    const n = this.count, p = this.points, ring = this.radial + 1
    for (let i = 0; i < n; i++) {
      dir.subVectors(p[Math.min(n - 1, i + 1)]!, p[Math.max(0, i - 1)]!)
      if (dir.lengthSq() < 1e-12) dir.copy(X)
      dir.normalize()
      nrm.crossVectors(dir, UP)
      if (nrm.lengthSq() < 1e-8) nrm.crossVectors(dir, X)
      nrm.normalize()
      bin.crossVectors(nrm, dir).normalize()
      const r = this.radius * (0.35 + 0.65 * Math.sin((Math.PI * i) / (n - 1)))
      const c = p[i]!
      for (let k = 0; k < ring; k++) {
        const a = (k / this.radial) * Math.PI * 2, cs = Math.cos(a) * r, sn = Math.sin(a) * r, o = (i * ring + k) * 3
        this.pos[o] = c.x + nrm.x * cs + bin.x * sn
        this.pos[o + 1] = c.y + nrm.y * cs + bin.y * sn
        this.pos[o + 2] = c.z + nrm.z * cs + bin.z * sn
      }
    }
    this.mesh.geometry.attributes.position!.needsUpdate = true
  }
}

export function floorDecal(tex: Texture, additive: boolean): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const m = new Mesh(PLANE, new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending, opacity: 0 }))
  m.rotation.x = -Math.PI / 2
  m.visible = false
  return m
}

export function setDecal(m: Mesh<PlaneGeometry, MeshBasicMaterial>, x: number, y: number, size: number, opacity: number): void {
  m.position.set(x, floorAt(x, y) + 0.006, -y)
  m.scale.setScalar(Math.max(size, 1e-4))
  m.material.opacity = opacity
  m.visible = opacity > 0.01 && size > 1e-3
}

export function sprite(tex: Texture, additive = true): Sprite {
  const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending, opacity: 0 }))
  s.center.set(0.5, 0)
  s.visible = false
  return s
}
