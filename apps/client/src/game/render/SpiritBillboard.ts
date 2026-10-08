import { AdditiveBlending, Color, Group, Sprite, SpriteMaterial, Texture } from 'three'
import { Eruption, type PillarStyle } from './power/eruption'

const H = 1.15
const BONDED = 0.7
const WAIT = 0.15
const RISE = 0.4
const PUNCH = 0.25
const OVER = 0.12
const RING = 0.45
const FADE = 0.35
const easeOut = (k: number) => 1 - (1 - k) ** 3

export class SpiritBillboard {
  readonly group = new Group()
  readonly body = new Group()
  readonly pillar: Eruption
  private beast: Sprite
  private aura: Sprite
  private ring: Sprite
  private aspect: number
  private state: 'off' | 'wait' | 'in' | 'punch' | 'hold' | 'out' = 'off'
  private t = 0
  private life = 0
  private ringT = RING
  private tint: Color

  constructor(private readonly base: Texture, shock: Texture, color: string, private readonly attack: Texture | null, pillar: PillarStyle) {
    const img = base.image as { width?: number; height?: number } | undefined
    this.aspect = img?.width && img.height ? img.width / img.height : 0.67
    this.tint = new Color(color)
    this.beast = new Sprite(new SpriteMaterial({ map: base, transparent: true, depthTest: true, depthWrite: false, toneMapped: false }))
    this.beast.center.set(0.5, 0.08)
    this.beast.renderOrder = 20
    this.aura = new Sprite(new SpriteMaterial({ map: base, toneMapped: false, color: this.tint, blending: AdditiveBlending, transparent: true, depthTest: true, depthWrite: false, opacity: 0 }))
    this.aura.center.set(0.5, 0.1)
    this.aura.renderOrder = 19
    this.ring = new Sprite(new SpriteMaterial({ map: shock, color: this.tint, blending: AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }))
    this.ring.renderOrder = 21
    this.ring.position.set(0, 0.05, 0)
    this.pillar = new Eruption(pillar)
    this.body.add(this.aura, this.beast, this.ring)
    this.group.add(this.pillar.group, this.body)
    this.group.visible = false
  }

  show(on: boolean): void {
    if (on && (this.state === 'off' || this.state === 'out')) {
      this.state = 'wait'
      this.t = 0
      this.ringT = RING
      this.group.visible = true
      this.body.visible = false
      this.pillar.fire()
    } else if (!on && this.state !== 'off') {
      if (this.state === 'wait') this.hide()
      else { this.state = 'out'; this.t = 0 }
    }
  }

  reset(): void {
    this.pose(false)
    this.hide()
  }

  dispose(): void {
    this.beast.material.dispose()
    this.aura.material.dispose()
    this.ring.material.dispose()
    this.pillar.dispose()
  }

  pose(attack: boolean): void {
    const map = attack && this.attack ? this.attack : this.base
    if (this.beast.material.map === map) return
    this.beast.material.map = map
    this.aura.material.map = map
    const img = map.image as { width?: number; height?: number } | undefined
    this.aspect = img?.width && img.height ? img.width / img.height : 0.67
  }

  get summoning(): boolean {
    return this.state === 'wait' || this.state === 'in' || this.state === 'punch'
  }

  private hide(): void {
    this.state = 'off'
    this.group.visible = false
    this.pillar.reset()
  }

  update(x: number, y: number, h: number, fx: number, fy: number, dt: number, still: boolean): void {
    if (this.state === 'off') return
    this.t += dt
    this.life += dt
    this.pillar.update(dt, x, y, still)
    const bm = this.beast.material, am = this.aura.material, rm = this.ring.material
    let s = 1, a = 1, lift = 0, flash = 0, bob = 0
    if (this.state === 'wait') {
      this.body.position.set(x, h + 0.02, -y)
      if (this.t < WAIT) return
      this.state = 'in'
      this.t = 0
      this.body.visible = true
    }
    if (this.state === 'in') {
      const k = Math.min(1, this.t / RISE)
      s = 0.05 + (1 + OVER - 0.05) * easeOut(k)
      a = Math.min(1, k * 3)
      lift = (1 - k) * -0.1
      if (k >= 1) { this.state = 'punch'; this.t = 0; this.ringT = 0; this.pose(true) }
    }
    if (this.state === 'punch') {
      const p = Math.min(1, this.t / PUNCH)
      s = 1 + OVER * (1 - easeOut(p))
      flash = (1 - p) ** 1.5
      if (p >= 1) { this.state = 'hold'; this.t = 0 }
    } else if (this.state === 'hold') {
      a = 1 - Math.min(1, this.t / 0.35) * (1 - BONDED)
      bob = Math.sin(this.life * 2.2) * 0.03
    } else if (this.state === 'out') {
      const k = Math.min(1, this.t / FADE)
      s = 1 + k * 0.18
      a = BONDED * (1 - k)
      lift = k * 0.35
      if (k >= 1) return this.hide()
    }
    if (this.ringT < RING) {
      this.ringT += dt
      const k = Math.min(1, this.ringT / RING)
      rm.opacity = (1 - k) * 0.9
      this.ring.scale.setScalar(0.5 + k * 2.6)
    } else rm.opacity = 0
    const sh = H * s * (this.state === 'hold' ? 1 + Math.sin(this.life * 3.1) * 0.025 : 1)
    this.beast.scale.set(sh * this.aspect, sh, 1)
    bm.opacity = a
    bm.color.setScalar(1 + flash * 2.4)
    const dx = fx - x, dy = fy - y, d = Math.hypot(dx, dy) || 1
    bm.rotation = Math.max(-0.12, Math.min(0.12, (-dx / d) * 0.1))
    am.opacity = Math.min(1, a * 1.15) * (0.6 + Math.sin(this.life * 5) * 0.15)
    am.rotation = bm.rotation
    this.aura.scale.set(sh * this.aspect * 1.12, sh * 1.09, 1)
    this.body.position.set(x, h + 0.12 + lift + bob, -y)
  }
}
