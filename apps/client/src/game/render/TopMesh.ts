import { AdditiveBlending, CircleGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, Texture } from 'three'
import { ringGeometry } from './partMesh'
import { bowlHeight } from './Stadium'

const TYPE_TINT: Record<string, number> = { attack: 0xff4a3a, defense: 0x3a8bff, stamina: 0x3ad88a, balance: 0xe8eef8 }

const VISUAL_SCALE = 1.55

export interface TopTextures { blade: Texture; disc: Texture; emblem: Texture }

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
  const { geometry, edge } = ringGeometry(map, depth, depth * 0.15)
  const m = new Mesh(geometry, [new MeshBasicMaterial({ map, alphaTest: 0.35 }), new MeshLambertMaterial({ color: edge.multiplyScalar(0.8) })])
  m.scale.setScalar(r)
  m.position.y = y
  return m
}

export class TopMesh {
  readonly group = new Group()
  private spinner = new Group()
  private blur: Mesh[] = []
  private glow: Mesh
  private angle = 0
  private precess = 0
  private faded = 1

  constructor(tex: TopTextures, physicsRadius: number, type: string) {
    const radius = physicsRadius * VISUAL_SCALE
    const tint = TYPE_TINT[type] ?? 0xffffff
    const body = new Mesh(
      new CylinderGeometry(radius * 0.9, radius * 0.7, 0.05, 32),
      new MeshLambertMaterial({ color: 0x2a2f45, emissive: tint, emissiveIntensity: 0.12 }),
    )
    body.position.y = 0.045
    const tip = new Mesh(new ConeGeometry(radius * 0.22, 0.05, 16), new MeshLambertMaterial({ color: 0x9aa3b8 }))
    tip.rotation.x = Math.PI
    tip.position.y = 0.02
    this.spinner.add(body, tip, solid(tex.disc, radius * 0.86, 0.064, 0.06), solid(tex.blade, radius, 0.073, 0.075), disc(radius * 0.36, tex.emblem, 0.074 + radius * 0.09))
    for (let i = 1; i <= 3; i++) {
      const b = disc(radius, tex.blade, 0.079 + i * 0.0005, { opacity: 0.22, additive: true })
      b.rotation.z = i * 0.35
      this.blur.push(b)
      this.spinner.add(b)
    }
    this.glow = disc(radius * 1.7, tex.emblem, 0.03, { opacity: 0, additive: true, color: tint })
    this.group.add(this.spinner, this.glow)
  }

  fade(target: number, dt: number): void {
    const f = this.faded + (target - this.faded) * Math.min(1, dt * 14)
    if (Math.abs(f - this.faded) < 0.002) return
    this.faded = f
    this.spinner.traverse(o => {
      const m = (o as Mesh).material as MeshBasicMaterial | undefined
      if (!m) return
      if (!m.transparent) { m.transparent = true; m.needsUpdate = true }
      m.userData.base ??= m.opacity
      m.opacity = (m.userData.base as number) * f
    })
  }

  update(x: number, y: number, spin: number, wobble: number, spirit: boolean, dt: number, visible: boolean): void {
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
    const gm = this.glow.material as MeshBasicMaterial
    gm.opacity += ((spirit ? 0.9 : 0) - gm.opacity) * Math.min(1, dt * 8)
    this.glow.rotation.z += dt * 3
  }
}
