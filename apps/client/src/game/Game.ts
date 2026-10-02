import { assembleTop, type BattleState, type TopBuild, type TopSpec } from '@spirit/core'
import type { Texture } from 'three'
import { hasAsset, texture } from '../assets/assets'
import { BEASTS } from './beasts'
import { createStepper, type Stepper } from './loop'
import { Fx } from './render/Fx'
import { SpiritBillboard } from './render/SpiritBillboard'
import { buildStadium } from './render/Stadium'
import { detectQuality, Stage } from './render/Stage'
import { TopMesh } from './render/TopMesh'

export type StadiumTheme = 'classic' | 'volcano' | 'frozen-moon'

interface Snap { x: number; y: number }

const tex = (id: string, fallback: string): Promise<Texture> => texture(hasAsset(id) ? id : fallback)

export class Game {
  readonly stage: Stage
  readonly stepper: Stepper
  readonly fx: Fx
  tops: [TopMesh, TopMesh] | null = null
  spirits: [SpiritBillboard, SpiritBillboard] | null = null
  specs: [TopSpec, TopSpec] | null = null
  battle: BattleState | null = null
  dropT = 1
  private prev: [Snap, Snap] = [{ x: 0, y: 0 }, { x: 0, y: 0 }]
  private removeResize: (() => void) | null = null
  private last = 0
  private hitstopUntil = 0
  private slowUntil = 0
  private slowScale = 1
  private onTick: (() => void) | null = null
  private onFrame: ((dt: number) => void) | null = null

  private constructor(readonly canvas: HTMLCanvasElement, fx: Fx) {
    this.stage = new Stage(canvas, detectQuality())
    this.fx = fx
    this.stage.world.add(fx.group)
    this.stepper = createStepper(60, 5, () => this.step())
  }

  static async create(canvas: HTMLCanvasElement, theme: StadiumTheme): Promise<Game> {
    const [spark, shock, crack, lightning, crystal, water, fire, bowl, floor] = await Promise.all([
      tex('vfx/impact-flash', 'vfx/impact-flash'),
      tex('vfx/shockwave', 'vfx/impact-flash'),
      tex('vfx/crack-decal', 'vfx/impact-flash'),
      tex('vfx/hit-lightning', 'vfx/impact-flash'),
      tex('vfx/hit-crystal', 'vfx/impact-flash'),
      tex('vfx/hit-water', 'vfx/impact-flash'),
      tex('vfx/hit-fire', 'vfx/impact-flash'),
      tex(`stadium/bowl-${theme}`, 'stadium/arena-floor'),
      tex('stadium/arena-floor', 'stadium/arena-floor'),
    ])
    const quality = detectQuality()
    const g = new Game(canvas, new Fx({ spark, shock, crack, hits: { lightning, crystal, water, fire } }, quality === 'low' ? 60 : 140))
    g.stage.world.add(buildStadium(bowl, floor))
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = g
    for (const t of [spark, shock, crack, lightning, crystal, water, fire, bowl, floor]) g.stage.renderer.initTexture(t)
    return g
  }

  async setTops(builds: [TopBuild, TopBuild], beastArt: [string, string]): Promise<void> {
    const specs: [TopSpec, TopSpec] = [assembleTop(builds[0]), assembleTop(builds[1])]
    const load = (b: TopBuild, emblem: string) =>
      Promise.all([tex(`parts/blade-${b.bladeId}`, `beasts/${b.beastId}/emblem`), tex(`parts/disc-${b.discId}`, `beasts/${b.beastId}/emblem`), tex(emblem, `beasts/${b.beastId}/emblem`)])
    const [[b0, d0, e0], [b1, d1, e1], c0, c1] = await Promise.all([
      load(builds[0], `${beastArt[0]}/emblem`),
      load(builds[1], `${beastArt[1]}/emblem`),
      tex(`${beastArt[0]}/cutin`, `beasts/${builds[0].beastId}/cutin`),
      tex(`${beastArt[1]}/cutin`, `beasts/${builds[1].beastId}/cutin`),
    ])
    if (this.tops) for (const t of this.tops) this.stage.world.remove(t.group)
    if (this.spirits) for (const s of this.spirits) this.stage.world.remove(s.sprite)
    this.tops = [new TopMesh({ blade: b0, disc: d0, emblem: e0 }, specs[0].radius, specs[0].type), new TopMesh({ blade: b1, disc: d1, emblem: e1 }, specs[1].radius, specs[1].type)]
    this.spirits = [new SpiritBillboard(c0), new SpiritBillboard(c1)]
    for (const t of this.tops) this.stage.world.add(t.group)
    for (const s of this.spirits) this.stage.world.add(s.sprite)
    for (const t of [b0, d0, e0, b1, d1, e1, c0, c1]) this.stage.renderer.initTexture(t)
    this.specs = specs
    this.stage.resize(this.canvas.clientWidth || innerWidth, this.canvas.clientHeight || innerHeight)
    await this.stage.renderer.compileAsync(this.stage.scene, this.stage.camera)
    for (let i = 0; i < 2; i++) this.stage.render(0)
  }

  elementOf(side: 0 | 1): string {
    return this.specs ? BEASTS[this.specs[side].beastId].element : 'lightning'
  }

  bind(onTick: () => void, onFrame: (dt: number) => void): void {
    this.onTick = onTick
    this.onFrame = onFrame
  }

  setBattle(b: BattleState | null): void {
    this.battle = b
    this.stepper.reset()
    if (b) this.prev = [{ x: b.tops[0].x, y: b.tops[0].y }, { x: b.tops[1].x, y: b.tops[1].y }]
  }

  hitstop(ms: number): void {
    this.hitstopUntil = Math.max(this.hitstopUntil, performance.now() + ms)
  }

  slowmo(scale: number, ms: number): void {
    this.slowScale = scale
    this.slowUntil = performance.now() + ms
  }

  start(): void {
    const resize = () => this.stage.resize(this.canvas.clientWidth, this.canvas.clientHeight)
    resize()
    window.addEventListener('resize', resize)
    this.removeResize = () => window.removeEventListener('resize', resize)
    this.last = performance.now()
    this.stage.renderer.setAnimationLoop(now => {
      const dtMs = Math.min(100, now - this.last)
      this.last = now
      this.stepper.scale = now < this.hitstopUntil ? 0 : now < this.slowUntil ? this.slowScale : 1
      const alpha = this.battle && this.dropT >= 1 ? this.stepper.advance(dtMs) : 0
      this.dropT = Math.min(1, this.dropT + dtMs / 380)
      this.draw(alpha, dtMs / 1000)
      this.stage.adapt(dtMs)
      this.onFrame?.(dtMs / 1000)
    })
  }

  stop(): void {
    this.stage.renderer.setAnimationLoop(null)
    this.removeResize?.()
  }

  private step(): void {
    const b = this.battle
    if (!b || b.outcome) return
    this.prev = [{ x: b.tops[0].x, y: b.tops[0].y }, { x: b.tops[1].x, y: b.tops[1].y }]
    this.onTick?.()
  }

  private draw(alpha: number, dt: number): void {
    const b = this.battle
    const scaled = dt * (this.stepper.scale || 0.05)
    if (!b && this.tops) for (const t of this.tops) t.group.visible = false
    if (b && this.tops && this.spirits) {
      for (let i = 0; i < 2; i++) {
        const t = b.tops[i as 0 | 1], p = this.prev[i] as Snap
        const x = p.x + (t.x - p.x) * alpha, y = p.y + (t.y - p.y) * alpha
        const top = this.tops[i as 0 | 1]
        top.update(x, y, t.spin, t.wobble, t.spiritTicks > 0, scaled, !t.out)
        top.group.position.y += (1 - this.dropT) ** 2 * 1.4
        this.spirits[i as 0 | 1].update(x, y, dt)
      }
    }
    this.fx.update(scaled, this.stage.camera)
    this.stage.render(dt)
  }
}
