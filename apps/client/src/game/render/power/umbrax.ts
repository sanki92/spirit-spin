import { TUNING, type BeastMove, type TopState } from '@spirit/core'
import { Group, type Mesh, type MeshBasicMaterial, type PlaneGeometry, type Quaternion, type Sprite, type SpriteMaterial } from 'three'
import type { Power, PowerTextures } from './PowerFx'
import { approach, floorAt, floorDecal, setDecal, sprite } from './shapes'

const OPEN_S = 0.15, CLAW_S = 0.55, SLASH_S = 0.25
const CLAW_X = [-0.07, 0, 0.07] as const
const RING_R = 0.1

export class UmbraxPower implements Power {
  readonly group = new Group()
  private readonly poolA: Mesh<PlaneGeometry, MeshBasicMaterial>
  private readonly poolB: Mesh<PlaneGeometry, MeshBasicMaterial>
  private readonly claws: Sprite[]
  private readonly slash: Sprite
  private readonly ox: Float32Array
  private readonly oy: Float32Array
  private on = false
  private pounceT = -1
  private slashT = 0
  private aOp = 0
  private bOp = 0
  private ax = 0
  private ay = 0
  private bx = 0
  private by = 0
  private aSize = 0

  constructor(tex: PowerTextures, ultimate = false) {
    this.poolA = floorDecal(tex.shadowPool, false)
    this.poolB = floorDecal(tex.shadowPool, false)
    const n = ultimate ? 6 : CLAW_X.length
    this.claws = Array.from({ length: n }, () => sprite(tex.claw, false))
    this.ox = new Float32Array(n)
    this.oy = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      this.ox[i] = ultimate ? Math.cos(a) * RING_R : CLAW_X[i]!
      this.oy[i] = ultimate ? Math.sin(a) * RING_R : i === 1 ? 0.03 : 0
    }
    this.slash = sprite(tex.slash)
    this.slash.center.set(0.5, 0.5)
    this.group.add(this.poolA, this.poolB, ...this.claws, this.slash)
  }

  begin(_me?: TopState, _foe?: TopState): void {
    this.on = true
    this.pounceT = -1
  }

  cue(move: BeastMove, x: number, y: number, foe: TopState): void {
    if (move === 'pounce') { this.pounceT = 0; this.bx = foe.x; this.by = foe.y }
    if (move === 'strike') {
      this.slashT = SLASH_S
      this.slash.position.set(x, floorAt(x, y) + 0.12, -y)
      ;(this.slash.material as SpriteMaterial).rotation = Math.random() * Math.PI
      this.slash.scale.setScalar(0.3)
    }
  }

  update(dt: number, e: number, me: TopState, _foe: TopState, _still: boolean, _camQ: Quaternion): void {
    const pre = this.on && e >= 0 && this.pounceT < 0
    if (pre) { this.ax = me.x; this.ay = me.y; this.aSize = 0.12 + 0.3 * Math.min(1, e / TUNING.tech.pounceAt) }
    this.aOp = approach(this.aOp, pre ? 0.9 : 0, dt, pre ? 12 : 6)
    setDecal(this.poolA, this.ax, this.ay, this.aSize, this.aOp)
    if (this.pounceT >= 0) this.pounceT += dt
    const open = this.pounceT >= 0 && this.on
    this.bOp = approach(this.bOp, open ? 0.9 : 0, dt, open ? 20 : 6)
    setDecal(this.poolB, this.bx, this.by, 0.42 * Math.min(1, Math.max(0, this.pounceT) / OPEN_S || 0), this.bOp)
    const t = this.pounceT
    for (let i = 0; i < this.claws.length; i++) {
      const c = this.claws[i]!, m = c.material as SpriteMaterial
      const show = t >= 0 && t < CLAW_S
      c.visible = show
      if (!show) continue
      const rise = Math.min(1, t / OPEN_S)
      m.opacity = t < OPEN_S ? 1 : Math.max(0, 1 - (t - OPEN_S) / (CLAW_S - OPEN_S))
      c.scale.set(0.16, Math.max(1e-3, 0.35 * rise), 1)
      const x = this.bx + this.ox[i]!, y = this.by + this.oy[i]!
      c.position.set(x, floorAt(x, y), -y)
    }
    const sm = this.slash.material as SpriteMaterial
    if (this.slashT > 0) { this.slashT -= dt; sm.opacity = Math.max(0, this.slashT / SLASH_S) }
    this.slash.visible = this.slashT > 0
  }

  end(): void {
    this.on = false
  }

  reset(): void {
    this.on = false
    this.pounceT = -1
    this.slashT = 0
    this.aOp = 0
    this.bOp = 0
    this.poolA.visible = false
    this.poolB.visible = false
    for (const c of this.claws) c.visible = false
    this.slash.visible = false
  }

  dispose(): void {
    this.poolA.material.dispose()
    this.poolB.material.dispose()
    for (const c of this.claws) c.material.dispose()
    this.slash.material.dispose()
  }
}
