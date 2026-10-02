import { AdditiveBlending, Color, Group, Sprite, SpriteMaterial, Texture } from 'three'

const H = 1.45
const ease = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2
const DELAY = 0.75
const RISE = 0.45
const FADE = 0.35

export class SpiritBillboard {
  readonly group = new Group()
  private beast: Sprite
  private aura: Sprite
  private ring: Sprite
  private aspect: number
  private state: 'off' | 'wait' | 'in' | 'hold' | 'out' = 'off'
  private t = 0
  private life = 0
  private tint: Color

  constructor(tex: Texture, shock: Texture, color: string) {
    const img = tex.image as { width?: number; height?: number } | undefined
    this.aspect = img?.width && img.height ? img.width / img.height : 0.67
    this.tint = new Color(color)
    this.beast = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }))
    this.beast.center.set(0.5, 0.08)
    this.beast.renderOrder = 20
    this.aura = new Sprite(new SpriteMaterial({ map: tex, toneMapped: false, color: this.tint, blending: AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }))
    this.aura.center.set(0.5, 0.1)
    this.aura.renderOrder = 19
    this.ring = new Sprite(new SpriteMaterial({ map: shock, color: this.tint, blending: AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }))
    this.ring.renderOrder = 21
    this.group.add(this.aura, this.beast, this.ring)
    this.group.visible = false
  }

  show(on: boolean): void {
    if (on && (this.state === 'off' || this.state === 'out')) {
      this.state = 'wait'
      this.t = 0
      this.group.visible = true
      this.beast.material.opacity = 0
    } else if (!on && this.state !== 'off') {
      if (this.state === 'wait') this.hide()
      else { this.state = 'out'; this.t = 0 }
    }
  }

  get summoning(): boolean {
    return this.state === 'wait' || this.state === 'in'
  }

  private hide(): void {
    this.state = 'off'
    this.group.visible = false
  }

  update(x: number, y: number, fx: number, fy: number, dt: number): void {
    if (this.state === 'off') return
    this.t += dt
    this.life += dt
    const bm = this.beast.material, am = this.aura.material, rm = this.ring.material
    let s = 1, a = 1, lift = 0, flash = 0
    if (this.state === 'wait') {
      a = 0
      if (this.t >= DELAY) { this.state = 'in'; this.t = 0 }
    } else if (this.state === 'in') {
      const k = Math.min(1, this.t / RISE)
      s = 0.25 + 0.75 * ease(k)
      a = Math.min(1, k * 2.5)
      lift = (1 - k) * -0.3
      flash = 1 - k
      rm.opacity = (1 - k) * 0.9
      this.ring.scale.setScalar(0.4 + k * 2.4)
      if (k >= 1) { this.state = 'hold'; this.t = 0 }
    } else if (this.state === 'out') {
      const k = Math.min(1, this.t / FADE)
      s = 1 + k * 0.18
      a = 1 - k
      lift = k * 0.35
      if (k >= 1) return this.hide()
    }
    const breathe = this.state === 'hold' ? 1 + Math.sin(this.life * 3.1) * 0.025 : 1
    const h = H * s * breathe
    this.beast.scale.set(h * this.aspect, h, 1)
    bm.opacity = a
    bm.color.setScalar(1 + flash * 2.2)
    const dx = fx - x, dy = fy - y, d = Math.hypot(dx, dy) || 1
    bm.rotation = Math.max(-0.12, Math.min(0.12, (-dx / d) * 0.1))
    am.opacity = a * (0.45 + Math.sin(this.life * 5) * 0.15)
    am.rotation = bm.rotation
    this.aura.scale.set(h * this.aspect * 1.09, h * 1.07, 1)
    const lean = 0.12
    this.group.position.set(x + (dx / d) * lean, 0.12 + lift + Math.sin(this.life * 2.2) * 0.03, -y - (dy / d) * lean)
    this.ring.position.set(0, 0.05, 0)
  }
}
