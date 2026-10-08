import { TUNING, type BeastMove, type TopState } from '@spirit/core'
import { Group, Mesh, type MeshBasicMaterial, type PlaneGeometry, type Quaternion } from 'three'
import { Pool } from '../Fx'
import type { Power, PowerTextures } from './PowerFx'
import { floorAt, floorDecal, helix, Ribbon, setDecal } from './shapes'

const RING_S = 0.6
const TAU = Math.PI * 2
const PTS = 28

export class AgnyxPower implements Power {
  readonly group = new Group()
  private readonly flames: Ribbon[]
  private readonly embers: Pool
  private readonly trail: Ribbon
  private readonly ring: Mesh<PlaneGeometry, MeshBasicMaterial>
  private on = false
  private dived = false
  private ringT = 0
  private rx = 0
  private ry = 0
  private phase = 0

  constructor(tex: PowerTextures, cap: number) {
    this.flames = [0, 1].map(() => new Ribbon(tex.fire, PTS, 0.075))
    this.embers = new Pool(tex.fire, Math.max(48, cap), false)
    this.trail = new Ribbon(tex.fire, 20, 0.16)
    this.ring = floorDecal(tex.fireRing, true)
    this.group.add(this.flames[0]!.mesh, this.flames[1]!.mesh, this.embers.mesh, this.trail.mesh, this.ring)
  }

  private burst(x: number, y: number, n: number, speed: number, lift: number): void {
    const h = floorAt(x, y) + 0.05
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.4, v = speed * (0.6 + Math.random() * 0.6)
      this.embers.spawn(x, h, -y, Math.cos(a) * v, lift * (0.5 + Math.random()), -Math.sin(a) * v, 0.5 + Math.random() * 0.3, 0.05)
    }
  }

  begin(_me?: TopState, _foe?: TopState): void {
    this.on = true
    this.dived = false
  }

  cue(move: BeastMove, x: number, y: number): void {
    if (move === 'dive') { this.dived = true; this.burst(x, y, 14, 0.8, 1.2) }
    if (move === 'strike' && this.dived) { this.ringT = RING_S; this.rx = x; this.ry = y; this.burst(x, y, 16, 1.6, 0.6) }
  }

  update(dt: number, e: number, me: TopState, _foe: TopState, still: boolean, camQ: Quaternion): void {
    const rising = this.on && e >= 0 && e < TUNING.tech.riseTicks && !this.dived
    const grow = Math.min(1, Math.max(0, e) / TUNING.tech.riseTicks)
    const base = floorAt(me.x, me.y) + 0.02
    if (!still) this.phase += dt * 6
    for (let s = 0; s < 2; s++) {
      const f = this.flames[s]!
      f.fade(rising ? 0.95 : 0, dt, rising ? 10 : 14)
      if (!f.mesh.visible) continue
      helix(f.points, me.x, me.y, base, 0.5 * grow, this.phase + s * Math.PI, 2, 0.13, 0.6)
      f.layout(false)
      if (!still) f.scroll(-dt * 1.5)
    }
    if (rising && !still) for (let n = 0; n < 2; n++) {
      const a = Math.random() * TAU, r = 0.1
      this.embers.spawn(me.x + Math.cos(a) * r, base, -(me.y + Math.sin(a) * r), Math.cos(a) * 0.1, 0.7, -Math.sin(a) * 0.1, 0.7, 0.045)
    }
    this.embers.update(dt, camQ, 0)
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
      setDecal(this.ring, this.rx, this.ry, 0.25 + 0.6 * (1 - k), k * k)
    } else this.ring.visible = false
  }

  end(): void {
    this.on = false
  }

  reset(): void {
    this.on = false
    this.dived = false
    this.ringT = 0
    for (const f of this.flames) { f.mesh.material.opacity = 0; f.mesh.visible = false }
    this.ring.visible = false
    this.trail.mesh.material.opacity = 0
    this.trail.mesh.visible = false
    this.embers.clear()
  }

  dispose(): void {
    for (const f of this.flames) f.dispose()
    this.embers.dispose()
    this.trail.dispose()
    this.ring.material.dispose()
  }
}
