import { TUNING, type BeastMove, type TopState } from '@spirit/core'
import { AdditiveBlending, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, type PlaneGeometry, type Quaternion } from 'three'
import { Pool } from '../Fx'
import type { Power, PowerTextures } from './PowerFx'
import { approach, floorAt, floorDecal, Ribbon, setDecal, tiled } from './shapes'

const RING_S = 1

export class AgnyxPower implements Power {
  readonly group = new Group()
  private readonly column: Mesh<CylinderGeometry, MeshBasicMaterial>
  private readonly feathers: Pool
  private readonly trail: Ribbon
  private readonly ring: Mesh<PlaneGeometry, MeshBasicMaterial>
  private on = false
  private dived = false
  private ringT = 0
  private rx = 0
  private ry = 0

  constructor(tex: PowerTextures, cap: number) {
    const geo = new CylinderGeometry(0.13, 0.09, 0.55, 16, 1, true)
    geo.translate(0, 0.275, 0)
    this.column = new Mesh(geo, new MeshBasicMaterial({ map: tiled(tex.fire), transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending, opacity: 0 }))
    this.column.visible = false
    this.feathers = new Pool(tex.feather, Math.max(8, cap >> 1), false)
    this.trail = new Ribbon(tex.fire, 20, 0.12)
    this.ring = floorDecal(tex.fireRing, true)
    this.group.add(this.column, this.feathers.mesh, this.trail.mesh, this.ring)
  }

  begin(_me?: TopState, _foe?: TopState): void {
    this.on = true
    this.dived = false
  }

  cue(move: BeastMove, x: number, y: number): void {
    if (move === 'dive') this.dived = true
    if (move === 'strike' && this.dived) { this.ringT = RING_S; this.rx = x; this.ry = y }
  }

  update(dt: number, e: number, me: TopState, _foe: TopState, still: boolean, camQ: Quaternion): void {
    const rising = this.on && e >= 0 && e < TUNING.tech.riseTicks && !this.dived
    const m = this.column.material
    m.opacity = approach(m.opacity, rising ? 0.95 : 0, dt, rising ? 10 : 14)
    this.column.visible = m.opacity > 0.01
    if (this.column.visible) {
      this.column.position.set(me.x, floorAt(me.x, me.y), -me.y)
      this.column.scale.y = 0.3 + 0.7 * Math.min(1, Math.max(0, e) / TUNING.tech.riseTicks)
      if (!still) { this.column.rotation.y += dt * 4; m.map!.offset.x -= dt * 0.8 }
    }
    if (rising && !still) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.2
      this.feathers.spawn(me.x + Math.cos(a) * r, floorAt(me.x, me.y) + 0.35 + Math.random() * 0.25, -me.y - Math.sin(a) * r, (Math.random() - 0.5) * 0.3, -0.2, (Math.random() - 0.5) * 0.3, 1, 0.07)
    }
    this.feathers.update(dt, camQ, 0.3)
    const pts = this.trail.points
    const trailing = this.on && this.dived && e >= 0
    if (trailing && this.trail.mesh.material.opacity < 0.01) for (const pt of pts) pt.set(me.x, floorAt(me.x, me.y) + 0.03, -me.y)
    if (trailing) {
      for (let i = pts.length - 1; i > 0; i--) pts[i]!.copy(pts[i - 1]!)
      pts[0]!.set(me.x, floorAt(me.x, me.y) + 0.03, -me.y)
    }
    this.trail.layout(true)
    if (!still) this.trail.scroll(-dt * 2.5)
    this.trail.fade(trailing ? 1 : 0, dt)
    if (this.ringT > 0) {
      this.ringT -= dt
      const k = Math.max(0, this.ringT / RING_S)
      setDecal(this.ring, this.rx, this.ry, 0.2 + 0.5 * (1 - k), k)
    } else this.ring.visible = false
  }

  end(): void {
    this.on = false
  }

  reset(): void {
    this.on = false
    this.dived = false
    this.ringT = 0
    this.column.material.opacity = 0
    this.column.visible = false
    this.ring.visible = false
    this.trail.mesh.material.opacity = 0
    this.trail.mesh.visible = false
    this.feathers.clear()
  }

  dispose(): void {
    this.column.geometry.dispose()
    this.column.material.map?.dispose()
    this.column.material.dispose()
    this.feathers.dispose()
    this.trail.dispose()
    this.ring.material.dispose()
  }
}
