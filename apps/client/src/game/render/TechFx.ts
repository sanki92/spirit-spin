import type { TopState } from '@spirit/core'
import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Sprite, SpriteMaterial, type Texture } from 'three'
import { bowlHeight } from './Stadium'

export interface TechTextures { lightning: Texture; crystal: Texture; water: Texture; fire: Texture; wind: Texture; shadow: Texture }

const PLANE = new PlaneGeometry(1, 1)

class SideFx {
  readonly ground: Mesh
  readonly aura: Sprite
  readonly mark: Sprite
  private t = 0

  constructor(private tex: TechTextures) {
    this.ground = new Mesh(PLANE, new MeshBasicMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0 }))
    this.ground.rotation.x = -Math.PI / 2
    this.aura = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0 }))
    this.mark = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0 }))
  }

  update(t: TopState, tideOn: boolean, dt: number, still: boolean): void {
    this.t += dt
    const gm = this.ground.material as MeshBasicMaterial, am = this.aura.material as SpriteMaterial, mm = this.mark.material as SpriteMaterial
    const h = (x: number, y: number) => bowlHeight(Math.min(1, Math.hypot(x, y)))
    let gTex: Texture | null = null, gSize = 0, gOp = 0, gSpin = 0
    let gx = t.x, gy = t.y
    if (t.pullTicks > 0) { gTex = this.tex.wind; gSize = 1.25 + Math.sin(this.t * 6) * 0.06; gOp = 0.85; gSpin = -9 }
    else if (t.phaseTicks > 0) { gTex = this.tex.shadow; gSize = 0.7; gOp = 0.95; gSpin = 2 }
    else if (t.shieldTicks > 0) { gTex = this.tex.crystal; gSize = 0.55 + Math.sin(this.t * 4) * 0.03; gOp = 0.75; gSpin = 1.2 }
    else if (tideOn) { gTex = this.tex.water; gSize = 0.9 + Math.sin(this.t * 2) * 0.08; gOp = 0.6; gSpin = 0.8; gx = t.x * 0.5; gy = t.y * 0.5 }
    if (gTex && gm.map !== gTex) { gm.map = gTex; gm.needsUpdate = true }
    gm.opacity += ((gTex ? gOp : 0) - gm.opacity) * Math.min(1, dt * 10)
    this.ground.visible = gm.opacity > 0.02 && !t.out
    if (gTex) {
      this.ground.scale.setScalar(gSize)
      this.ground.position.set(gx, h(gx, gy) + 0.004, -gy)
      if (!still) this.ground.rotation.z += gSpin * dt
    }
    let aTex: Texture | null = null, aOp = 0
    if (t.stunTicks > 0) { aTex = this.tex.lightning; aOp = still ? 0.8 : (Math.sin(this.t * 40) > -0.2 ? 0.95 : 0.15) }
    else if (t.burnTicks > 0) { aTex = this.tex.fire; aOp = 0.55 + Math.sin(this.t * 13) * 0.2 }
    if (aTex && am.map !== aTex) { am.map = aTex; am.needsUpdate = true }
    am.opacity += ((aTex ? aOp : 0) - am.opacity) * Math.min(1, dt * 18)
    this.aura.visible = am.opacity > 0.02 && !t.out
    this.aura.scale.setScalar(t.stunTicks > 0 ? 0.42 : 0.32)
    this.aura.position.set(t.x, h(t.x, t.y) + 0.14, -t.y)
    const armed = t.strikeArmed || t.stealArmed
    const mTex = t.stealArmed ? this.tex.fire : t.strikeArmed ? (t.phaseTicks > 0 || t.steps > 0 ? this.tex.shadow : this.tex.lightning) : null
    if (mTex && mm.map !== mTex) { mm.map = mTex; mm.needsUpdate = true }
    mm.opacity += ((armed ? 0.7 + Math.sin(this.t * 9) * 0.2 : 0) - mm.opacity) * Math.min(1, dt * 12)
    this.mark.visible = mm.opacity > 0.02 && !t.out && t.phaseTicks === 0
    this.mark.scale.setScalar(0.26)
    this.mark.position.set(t.x, h(t.x, t.y) + 0.05, -t.y)
  }
}

export class TechFx {
  readonly group = new Group()
  private sides: [SideFx, SideFx]

  constructor(tex: TechTextures) {
    this.sides = [new SideFx(tex), new SideFx(tex)]
    for (const s of this.sides) this.group.add(s.ground, s.aura, s.mark)
  }

  update(tops: readonly [TopState, TopState], tide: [boolean, boolean], dt: number, still: boolean): void {
    this.sides[0].update(tops[0], tide[0], dt, still)
    this.sides[1].update(tops[1], tide[1], dt, still)
  }

  hide(): void {
    for (const s of this.sides) { s.ground.visible = false; s.aura.visible = false; s.mark.visible = false }
  }
}
