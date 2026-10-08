import { AdditiveBlending, Color, Group, Sprite, SpriteMaterial, Texture } from 'three'

const H = 1.15
const GHOST = 0.3
const BACK = 0.18
const ease = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2
const DELAY = 0.05
const RISE = 0.85
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
  private grow = 1
  private tint: Color

  constructor(private readonly base: Texture, shock: Texture, color: string, private readonly attack: Texture | null = null) {
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
    this.group.add(this.aura, this.beast, this.ring)
    this.group.visible = false
  }

  show(on: boolean): void {
    if (on && (this.state === 'off' || this.state === 'out')) {
      this.state = 'wait'
      this.t = 0
      this.grow = 0
      this.group.visible = true
      this.beast.material.opacity = 0
    } else if (!on && this.state !== 'off') {
      if (this.state === 'wait') this.hide()
      else { this.state = 'out'; this.t = 0 }
    }
  }

  reset(): void {
    this.pose(false)
    this.hide()
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
      this.grow = k
      s = 0.05 + 0.95 * ease(k)
      a = Math.min(1, k * 2.5)
      lift = (1 - k) * -0.12
      flash = 1 - k
      rm.opacity = (1 - k) * 0.9
      this.ring.scale.setScalar(0.4 + k * 2.4)
      if (k >= 1) { this.state = 'hold'; this.t = 0; this.grow = 1 }
    } else if (this.state === 'out') {
      const k = Math.min(1, this.t / FADE)
      s = 1 + k * 0.18
      a = 1 - k
      lift = k * 0.35
      if (k >= 1) return this.hide()
    }
    if (this.state === 'hold') a = 1 - Math.min(1, this.t / 0.35) * (1 - GHOST)
    const breathe = this.state === 'hold' ? 1 + Math.sin(this.life * 3.1) * 0.025 : 1
    const h = H * s * breathe
    this.beast.scale.set(h * this.aspect, h, 1)
    bm.opacity = a
    bm.color.setScalar(1 + flash * 2.2)
    const dx = fx - x, dy = fy - y, d = Math.hypot(dx, dy) || 1
    bm.rotation = Math.max(-0.12, Math.min(0.12, (-dx / d) * 0.1))
    am.opacity = a * (0.35 + Math.sin(this.life * 5) * 0.12)
    am.rotation = bm.rotation
    this.aura.scale.set(h * this.aspect * 1.09, h * 1.07, 1)
    const lean = 0.12
    this.group.position.set(x + (dx / d) * lean * this.grow, 0.12 + lift + Math.sin(this.life * 2.2) * 0.03, -y - ((dy / d) * lean + BACK) * this.grow)
    this.ring.position.set(0, 0.05, 0)
  }
}
