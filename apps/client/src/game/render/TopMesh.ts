import { AdditiveBlending, CircleGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, Quaternion, Texture, Vector3 } from 'three'
import { cachedRing } from './partMesh'
import { bowlHeight } from './Stadium'

const TYPE_TINT: Record<string, number> = { attack: 0xff4a3a, defense: 0x3a8bff, stamina: 0x3ad88a, balance: 0xe8eef8 }

const VISUAL_SCALE = 1.55
const AURA_R = 1.3
const RING_IN_TEX = 0.64
const UP = new Vector3(0, 1, 0)
const nrm = new Vector3()
const qa = new Quaternion(), qs = new Quaternion()
const FLAT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)

export const auraShrink = (lift: number) => Math.max(0.2, 1 - lift * 2.7)

export interface TopTextures { blade: Texture; disc: Texture; emblem: Texture; aura?: Texture }

function disc(r: number, map: Texture, y: number, extra: { opacity?: number; additive?: boolean; color?: number } = {}): Mesh {
  const m = new Mesh(
    new CircleGeometry(r, 48),
    new MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      opacity: extra.opacity ?? 1,
      color: extra.color ?? 0xffffff,
      ...(extra.additive ? { blending: AdditiveBlending } : {}),
    }),
  )
  m.rotation.x = -Math.PI / 2
  m.position.y = y
  return m
}

function solid(map: Texture, r: number, y: number, depth: number): Mesh {
  const { geometry, edge } = cachedRing(map.uuid, map, depth, depth * 0.15)
  const m = new Mesh(geometry, [new MeshBasicMaterial({ map, alphaTest: 0.35 }), new MeshLambertMaterial({ color: edge.multiplyScalar(0.8) })])
  m.scale.setScalar(r)
  m.position.y = y
  return m
}

export class TopMesh {
  readonly group = new Group()
  private spinner = new Group()
  private blur: Mesh[] = []
  readonly glow: Mesh<PlaneGeometry, MeshBasicMaterial>
  private readonly auraSize: number
  private glowSpin = 0
  private angle = 0
  private precess = 0
  private faded = 1
  readonly radius: number

  constructor(tex: TopTextures, physicsRadius: number, type: string, auraColor?: string) {
    const radius = physicsRadius * VISUAL_SCALE
    this.radius = radius
    const tint = TYPE_TINT[type] ?? 0xffffff
    const body = new Mesh(
      new CylinderGeometry(radius * 0.9, radius * 0.7, 0.05, 32),
      new MeshLambertMaterial({ color: 0x2a2f45, emissive: tint, emissiveIntensity: 0.12 }),
    )
    body.position.y = 0.045
    const tip = new Mesh(new ConeGeometry(radius * 0.22, 0.05, 16), new MeshLambertMaterial({ color: 0x9aa3b8 }))
    tip.rotation.x = Math.PI
    tip.position.y = 0.02
    this.spinner.add(body, tip, solid(tex.disc, radius * 0.86, 0.064, 0.06), solid(tex.blade, radius, 0.073, 0.075), disc(radius * 0.3, tex.emblem, 0.074 + radius * 0.09))
    for (let i = 1; i <= 3; i++) {
      const b = disc(radius, tex.blade, 0.079 + i * 0.0005, { opacity: 0.22, additive: true })
      b.rotation.z = i * 0.35
      this.blur.push(b)
      this.spinner.add(b)
    }
    this.auraSize = (2 * radius * AURA_R) / RING_IN_TEX
    this.glow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: tex.aura ?? tex.emblem, transparent: true, depthWrite: false, opacity: 0, blending: AdditiveBlending, color: auraColor ?? tint, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }))
    this.glow.visible = false
    this.group.add(this.spinner)
  }

  dispose(): void {
    this.glow.geometry.dispose()
    this.glow.material.dispose()
    this.group.traverse(o => {
      const m = o as Mesh
      m.geometry?.dispose()
      for (const mat of (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as MeshBasicMaterial[]) mat.dispose()
    })
  }

  fade(target: number, dt: number): void {
    const f = this.faded + (target - this.faded) * Math.min(1, dt * 14)
    if (Math.abs(f - this.faded) < 0.002) return
    this.faded = f
    this.spinner.traverse(o => {
      const mat = (o as Mesh).material as MeshBasicMaterial | MeshBasicMaterial[] | undefined
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        if (!m.transparent) { m.transparent = true; m.needsUpdate = true }
        m.userData.base ??= m.opacity
        m.opacity = (m.userData.base as number) * f
      }
    })
  }

  update(x: number, y: number, spin: number, wobble: number, spirit: boolean, dt: number, visible: boolean, still = false): void {
    this.group.visible = visible
    const r = Math.hypot(x, y)
    this.group.position.set(x, bowlHeight(Math.min(r, 1)), -y)
    this.angle -= Math.min(Math.max(spin, 0), 1.1) * 38 * dt
    this.spinner.rotation.y = this.angle
    const blurAmt = Math.min(1, Math.max(spin, 0) * 1.3)
    for (const b of this.blur) (b.material as MeshBasicMaterial).opacity = 0.22 * blurAmt
    this.precess += dt * (4 + 10 * wobble)
    const lean = 0.06 * r + wobble * 0.32
    this.group.rotation.x = Math.cos(this.precess) * lean
    this.group.rotation.z = Math.sin(this.precess) * lean
    const gm = this.glow.material
    gm.opacity += ((spirit ? 0.6 : 0) - gm.opacity) * Math.min(1, dt * 8)
    this.glow.visible = visible && gm.opacity > 0.01
    if (this.glow.visible) this.layGlow(x, y, still ? 0 : dt)
  }

  raise(lift: number): void {
    this.group.position.y += lift
    this.glow.scale.setScalar(this.auraSize * auraShrink(lift))
  }

  private layGlow(x: number, y: number, dt: number): void {
    this.glowSpin += dt * 1.5
    const r = Math.min(1, Math.hypot(x, y)), e = 0.01
    const slope = (bowlHeight(Math.min(1, r + e)) - bowlHeight(Math.max(0, r - e))) / (2 * e)
    const ux = r > 1e-4 ? x / r : 0, uz = r > 1e-4 ? -y / r : 0
    nrm.set(-slope * ux, 1, -slope * uz).normalize()
    qa.setFromUnitVectors(UP, nrm)
    qs.setFromAxisAngle(UP, this.glowSpin)
    this.glow.quaternion.copy(qa).multiply(qs).multiply(FLAT)
    this.glow.position.set(x, bowlHeight(r) + 0.008, -y)
    this.glow.scale.setScalar(this.auraSize)
  }
}
