import type { BeastMove, TopState } from '@spirit/core'
import { Group, type Mesh, type MeshBasicMaterial, type PlaneGeometry, type Quaternion } from 'three'
import { Pool } from '../Fx'
import type { Power, PowerTextures } from './PowerFx'
import { approach, floorAt, floorDecal, setDecal, Tube } from './shapes'

const SEG = 40, RAD = 0.035, TURNS = 1.5, FLING_S = 0.3, LIFT = 0.3

export class NagaraPower implements Power {
  readonly group = new Group()
  private readonly tube: Tube
  private readonly whirl: Mesh<PlaneGeometry, MeshBasicMaterial>
  private readonly splash: Pool
  private on = false
  private flung = -1
  private k = 0

  constructor(tex: PowerTextures, cap: number) {
    this.tube = new Tube(tex.water, SEG, 8, RAD)
    this.whirl = floorDecal(tex.whirlpool, true)
    this.splash = new Pool(tex.splash, Math.max(8, cap >> 2), false)
    this.group.add(this.tube.mesh, this.whirl, this.splash.mesh)
  }

  begin(_me?: TopState, _foe?: TopState): void {
    this.on = true
    this.flung = -1
  }

  cue(move: BeastMove, _x: number, _y: number, foe: TopState): void {
    if (move !== 'fling' || this.flung >= 0) return
    this.flung = 0
    const h = floorAt(foe.x, foe.y) + 0.08
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, sp = 0.9 + (i % 3) * 0.35
      this.splash.spawn(foe.x, h, -foe.y, Math.cos(a) * sp, 0.8 + (i % 4) * 0.25, Math.sin(a) * sp, 0.5, 0.09, 0.08)
    }
  }

  update(dt: number, e: number, me: TopState, foe: TopState, still: boolean, camQ: Quaternion): void {
    let target = this.on && e >= 0 ? 1 : 0
    if (this.flung >= 0) { this.flung += dt; target = 0 }
    this.k = this.flung >= 0 ? Math.max(0, 1 - this.flung / FLING_S) : approach(this.k, target, dt, 10)
    const show = this.k > 0.01
    this.tube.mesh.visible = show
    if (show) {
      const dx = me.x - foe.x, dy = me.y - foe.y, d = Math.hypot(dx, dy)
      const r = Math.min(0.5, Math.max(0.14, d)), a0 = d > 1e-4 ? Math.atan2(dy, dx) : 0
      for (let i = 0; i < SEG; i++) {
        const u = i / (SEG - 1), ang = a0 - u * TURNS * Math.PI * 2, rad = r * (1 - 0.3 * u)
        const x = foe.x + Math.cos(ang) * rad, y = foe.y + Math.sin(ang) * rad
        this.tube.points[i]!.set(x, floorAt(x, y) + 0.04 + u * LIFT, -y)
      }
      this.tube.radius = RAD * this.k
      this.tube.layout()
      this.tube.mesh.material.opacity = 0.9 * this.k
      if (!still) this.tube.mesh.material.map!.offset.x -= dt * 0.8
      setDecal(this.whirl, foe.x, foe.y, 0.45, 0.85 * this.k)
      if (!still) this.whirl.rotation.z += dt * 3
    } else this.whirl.visible = false
    this.splash.update(dt, camQ, 3)
  }

  end(): void {
    this.on = false
  }

  reset(): void {
    this.on = false
    this.flung = -1
    this.k = 0
    this.tube.mesh.visible = false
    this.whirl.visible = false
    this.splash.clear()
  }

  dispose(): void {
    this.tube.dispose()
    this.whirl.material.dispose()
    this.splash.dispose()
  }
}
