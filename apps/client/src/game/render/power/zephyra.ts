import type { BeastMove, TopState } from '@spirit/core'
import { AdditiveBlending, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, type Quaternion } from 'three'
import { Pool } from '../Fx'
import type { Power, PowerTextures } from './PowerFx'
import { approach, floorAt, Ribbon, tiled } from './shapes'

const FLING_S = 0.4

export class ZephyraPower implements Power {
  readonly group = new Group()
  private readonly cone: Mesh<CylinderGeometry, MeshBasicMaterial>
  private readonly debris: Pool
  private readonly spiral: Ribbon
  private vortex = false
  private flungT = -1

  constructor(tex: PowerTextures, cap: number) {
    const geo = new CylinderGeometry(0.34, 0.05, 0.85, 20, 1, true)
    geo.translate(0, 0.425, 0)
    const map = tiled(tex.wind)
    map.repeat.set(2, 1)
    this.cone = new Mesh(geo, new MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending, opacity: 0 }))
    this.cone.visible = false
    this.debris = new Pool(tex.debris, cap, false)
    this.spiral = new Ribbon(tex.wind, 24, 0.07)
    this.group.add(this.cone, this.debris.mesh, this.spiral.mesh)
  }

  begin(_me?: TopState, _foe?: TopState): void {
    this.vortex = false
    this.flungT = -1
  }

  cue(move: BeastMove, x: number, y: number): void {
    if (move === 'vortex') { this.vortex = true; this.flungT = -1 }
    if (move !== 'fling' || !this.vortex) return
    this.vortex = false
    this.flungT = 0
    const h = floorAt(x, y) + 0.1
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2
      this.debris.spawn(x, h, -y, Math.cos(a) * 1.8, 0.4, Math.sin(a) * 1.8, 0.4, 0.05)
    }
  }

  update(dt: number, _e: number, me: TopState, foe: TopState, still: boolean, camQ: Quaternion): void {
    if (this.flungT >= 0) this.flungT += dt
    const k = this.vortex ? 1 : this.flungT >= 0 ? Math.max(0, 1 - this.flungT / FLING_S) : 0
    const m = this.cone.material
    m.opacity = this.flungT >= 0 ? 0.85 * k : approach(m.opacity, 0.85 * k, dt, 8)
    this.cone.visible = m.opacity > 0.01
    if (this.cone.visible) {
      this.cone.position.set(me.x, floorAt(me.x, me.y), -me.y)
      if (!still) { this.cone.rotation.y += dt * 7; m.map!.offset.x -= dt * 1.2 }
    }
    if (this.vortex && !still) for (let n = 0; n < 2; n++) {
      const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.2
      const x = me.x + Math.cos(a) * r, y = me.y + Math.sin(a) * r
      this.debris.spawn(x, floorAt(x, y) + 0.05 + Math.random() * 0.3, -y, -Math.sin(a) * 1.6 - Math.cos(a) * 0.4, 0.6, -Math.cos(a) * 1.6 + Math.sin(a) * 0.4, 0.45, 0.05)
    }
    this.debris.update(dt, camQ, 0.5)
    if (this.vortex) {
      const dx = foe.x - me.x, dy = foe.y - me.y, r0 = Math.hypot(dx, dy), a0 = Math.atan2(dy, dx)
      const pts = this.spiral.points, n = pts.length
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), r = r0 * (1 - u), ang = a0 + u * Math.PI * 1.2
        const x = me.x + Math.cos(ang) * r, y = me.y + Math.sin(ang) * r
        pts[i]!.set(x, floorAt(x, y) + 0.02, -y)
      }
      this.spiral.layout(true)
      if (!still) this.spiral.scroll(-dt * 2)
    }
    this.spiral.fade(this.vortex ? 1 : 0, dt, 10)
  }

  end(): void {
    this.vortex = false
  }

  reset(): void {
    this.vortex = false
    this.flungT = -1
    this.cone.material.opacity = 0
    this.cone.visible = false
    this.spiral.mesh.material.opacity = 0
    this.spiral.mesh.visible = false
    this.debris.clear()
  }

  dispose(): void {
    this.cone.geometry.dispose()
    this.cone.material.map?.dispose()
    this.cone.material.dispose()
    this.spiral.dispose()
    this.debris.dispose()
  }
}
