import { AdditiveBlending, Sprite, SpriteMaterial, Texture } from 'three'

export class SpiritBillboard {
  readonly sprite: Sprite
  private t = 0
  private target = 0

  constructor(tex: Texture) {
    this.sprite = new Sprite(new SpriteMaterial({ map: tex, blending: AdditiveBlending, transparent: true, opacity: 0, depthWrite: false }))
    this.sprite.scale.set(2.2, 1.47, 1)
    this.sprite.visible = false
  }

  show(on: boolean): void {
    this.target = on ? 1 : 0
    if (on) this.sprite.visible = true
  }

  update(x: number, y: number, dt: number): void {
    this.t += dt
    const m = this.sprite.material
    m.opacity += (this.target * 0.95 - m.opacity) * Math.min(1, dt * 6)
    if (m.opacity < 0.01 && this.target === 0) this.sprite.visible = false
    const s = 0.85 + m.opacity * 0.25
    this.sprite.scale.set(2.2 * s, 1.47 * s, 1)
    this.sprite.position.set(x, 0.9 + Math.sin(this.t * 2.2) * 0.05, -y - 0.25)
  }
}
