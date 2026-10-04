import { assembleTop, type BattleState, type TopBuild, type TopSpec } from '@spirit/core'
import type { Texture } from 'three'
import { hasAsset } from '../assets/assets'
import { texture } from './render/textures'
import { BEASTS } from './beasts'
import { createStepper, type Stepper } from './loop'
import { Fx } from './render/Fx'
import { SpiritBillboard } from './render/SpiritBillboard'
import { buildStadium, type StadiumView } from './render/Stadium'
import { detectQuality, Stage } from './render/Stage'
import { TechFx } from './render/TechFx'
import { TopMesh } from './render/TopMesh'
import { keepInside, separate } from './contact'
import { HANG, HOLD_HEIGHT, LaunchRig } from './render/Launcher'
import { flightProgress, KICK_MS, launchDuration, planFor, type LaunchPlan, type LaunchTier } from './launchPlan'

export type StadiumTheme = 'classic' | 'volcano' | 'frozen-moon'
const THEME_ACCENT: Record<StadiumTheme, number> = { classic: 0x3be6ff, volcano: 0xff6a1a, 'frozen-moon': 0xa8e8ff }

interface Snap { x: number; y: number }
interface TopF { x: number; y: number; vx: number; vy: number; spin: number; wobble: number; spirit: boolean; out: boolean }
interface Frame { t: [TopF, TopF]; clash: { x: number; y: number; energy: number } | null }
interface Cine { frames: Frame[]; t: number; dur: number; fired: number; impact: boolean; hold: number; loser: 0 | 1 | null; done: () => void }
const REPLAY_TICKS = 80
const HOLD: [Snap, Snap] = [{ x: 0, y: -0.52 }, { x: 0, y: 0.52 }]
interface LaunchAnim { t: number; dur: number; plans: [LaunchPlan, LaunchPlan]; tiers: [LaunchTier, LaunchTier]; landed: [boolean, boolean] }

const tex = (id: string, fallback: string): Promise<Texture> => texture(hasAsset(id) ? id : fallback)
const summonTex = (art: string, beast: string): Promise<Texture> =>
  texture([`${art}/summon`, `beasts/${beast}/summon`, `${art}/emblem`].find(hasAsset) ?? `beasts/${beast}/emblem`)

export class Game {
  readonly stage: Stage
  readonly stepper: Stepper
  readonly fx: Fx
  stadium: StadiumView | null = null
  techFx: TechFx | null = null
  tops: [TopMesh, TopMesh] | null = null
  spirits: [SpiritBillboard, SpiritBillboard] | null = null
  specs: [TopSpec, TopSpec] | null = null
  battle: BattleState | null = null
  launchers: [LaunchRig | null, LaunchRig | null] = [null, null]
  playerLauncher: string | null = null
  onLand: ((side: 0 | 1, tier: LaunchTier) => void) | null = null
  private armed = false
  private anim: LaunchAnim | null = null
  private clockS = 0
  private grindT = 0
  private prev: [Snap, Snap] = [{ x: 0, y: 0 }, { x: 0, y: 0 }]
  private corr: [Snap, Snap] = [{ x: 0, y: 0 }, { x: 0, y: 0 }]
  private removeResize: (() => void) | null = null
  private last = 0
  private hitstopUntil = 0
  private slowUntil = 0
  private slowScale = 1
  private onTick: (() => void) | null = null
  private hist: Frame[] = []
  private pendingClash: Frame['clash'] = null
  private cine: Cine | null = null
  private onFrame: ((dt: number) => void) | null = null

  private constructor(readonly canvas: HTMLCanvasElement, fx: Fx) {
    this.stage = new Stage(canvas, detectQuality())
    this.fx = fx
    this.stage.world.add(fx.group)
    this.stepper = createStepper(60, 5, () => this.step())
  }

  static async create(canvas: HTMLCanvasElement, theme: StadiumTheme): Promise<Game> {
    const [spark, shock, crack, lightning, crystal, water, fire, wind, shadow, bowl, floor, rim] = await Promise.all([
      tex('vfx/impact-flash', 'vfx/impact-flash'),
      tex('vfx/shockwave', 'vfx/impact-flash'),
      tex('vfx/crack-decal', 'vfx/impact-flash'),
      tex('vfx/hit-lightning', 'vfx/impact-flash'),
      tex('vfx/hit-crystal', 'vfx/impact-flash'),
      tex('vfx/hit-water', 'vfx/impact-flash'),
      tex('vfx/hit-fire', 'vfx/impact-flash'),
      tex('vfx/hit-wind', 'vfx/impact-flash'),
      tex('vfx/hit-shadow', 'vfx/impact-flash'),
      tex(`stadium/bowl-${theme}`, 'stadium/arena-floor'),
      tex('stadium/arena-floor', 'stadium/arena-floor'),
      hasAsset('stadium/rim-wall') ? texture('stadium/rim-wall').catch(() => null) : Promise.resolve(null),
    ])
    const quality = detectQuality()
    const g = new Game(canvas, new Fx({ spark, shock, crack, hits: { lightning, crystal, water, fire, wind, shadow } }, quality === 'low' ? 60 : 140))
    g.stadium = buildStadium(bowl, floor, rim, THEME_ACCENT[theme])
    g.stage.world.add(g.stadium.group)
    g.techFx = new TechFx({ lightning, crystal, water, fire, wind, shadow })
    g.stage.world.add(g.techFx.group)
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = g
    for (const t of [spark, shock, crack, lightning, crystal, water, fire, wind, shadow, bowl, floor, ...(rim ? [rim] : [])]) g.stage.renderer.initTexture(t)
    return g
  }

  async setTops(builds: [TopBuild, TopBuild], beastArt: [string, string]): Promise<void> {
    const specs: [TopSpec, TopSpec] = [assembleTop(builds[0]), assembleTop(builds[1])]
    const load = (b: TopBuild, emblem: string) =>
      Promise.all([tex(`parts/blade-${b.bladeId}`, `beasts/${b.beastId}/emblem`), tex(`parts/disc-${b.discId}`, `beasts/${b.beastId}/emblem`), tex(emblem, `beasts/${b.beastId}/emblem`)])
    const [[b0, d0, e0], [b1, d1, e1], c0, c1] = await Promise.all([
      load(builds[0], `${beastArt[0]}/emblem`),
      load(builds[1], `${beastArt[1]}/emblem`),
      summonTex(beastArt[0], builds[0].beastId),
      summonTex(beastArt[1], builds[1].beastId),
    ])
    const shock = await tex('vfx/shockwave', 'vfx/impact-flash')
    const rigArt = [this.playerLauncher ?? `launchers/${builds[0].beastId}`, `launchers/${builds[1].beastId}`].map(id => (hasAsset(id) ? id : null))
    const rigTex = await Promise.all(rigArt.map(id => (id ? texture(id).catch(() => null) : null)))
    for (const r of this.launchers) if (r) { this.stage.world.remove(r.group); r.dispose() }
    this.launchers = [rigTex[0] ? new LaunchRig(rigTex[0], 0) : null, rigTex[1] ? new LaunchRig(rigTex[1], 1) : null]
    for (const r of this.launchers) if (r) this.stage.world.add(r.group)
    for (const t of rigTex) if (t) this.stage.renderer.initTexture(t)
    if (this.tops) for (const t of this.tops) { this.stage.world.remove(t.group); t.dispose() }
    if (this.spirits) for (const s of this.spirits) this.stage.world.remove(s.group)
    this.tops = [new TopMesh({ blade: b0, disc: d0, emblem: e0 }, specs[0].radius, specs[0].type), new TopMesh({ blade: b1, disc: d1, emblem: e1 }, specs[1].radius, specs[1].type)]
    this.spirits = [new SpiritBillboard(c0, shock, BEASTS[builds[0].beastId].color), new SpiritBillboard(c1, shock, BEASTS[builds[1].beastId].color)]
    for (const t of this.tops) this.stage.world.add(t.group)
    for (const s of this.spirits) this.stage.world.add(s.group)
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

  arm(): void {
    this.armed = true
    this.anim = null
  }

  disarm(): void {
    this.armed = false
    this.anim = null
    for (const r of this.launchers) r?.hide()
  }

  get launching(): boolean {
    return !!this.anim
  }

  launch(tiers: [LaunchTier, LaunchTier]): void {
    const still = document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches
    const plans: [LaunchPlan, LaunchPlan] = [planFor(tiers[0], still), planFor(tiers[1], still)]
    this.armed = false
    this.anim = { t: 0, dur: launchDuration(plans), plans, tiers, landed: [false, false] }
  }

  setBattle(b: BattleState | null): void {
    this.battle = b
    this.hist = []
    this.pendingClash = null
    this.stepper.reset()
    if (b) this.prev = [{ x: b.tops[0].x, y: b.tops[0].y }, { x: b.tops[1].x, y: b.tops[1].y }]
  }

  correct(side: 0 | 1, dx: number, dy: number): void {
    const c = this.corr[side]
    c.x += dx
    c.y += dy
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
      const alpha = this.battle && !this.anim ? this.stepper.advance(dtMs) : 0
      this.stadium?.update(dtMs / 1000, this.battle && !this.anim ? this.battle.tops : null)
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
    if (!this.cine) this.record()
  }

  private record(): void {
    const b = this.battle
    if (!b) return
    const f = (i: 0 | 1): TopF => { const t = b.tops[i]; return { x: t.x, y: t.y, vx: t.vx, vy: t.vy, spin: t.spin, wobble: t.wobble, spirit: t.spiritTicks > 0, out: t.out } }
    this.hist.push({ t: [f(0), f(1)], clash: this.pendingClash })
    this.pendingClash = null
    if (this.hist.length > REPLAY_TICKS) this.hist.shift()
  }

  noteClash(x: number, y: number, energy: number): void {
    this.pendingClash = { x, y, energy }
  }

  get replaying(): boolean {
    return !!this.cine
  }

  finishCam(loser: 0 | 1 | null, done: () => void): boolean {
    this.record()
    if (this.hist.length < 24) return false
    this.cine = { frames: [...this.hist], t: 0, dur: 2600, fired: 0, impact: false, hold: 0, loser, done }
    this.slowUntil = 0
    return true
  }

  skipCine(run = true): void {
    const c = this.cine
    if (!c) return
    this.cine = null
    this.stage.cinematic(false)
    if (run) c.done()
  }

  private drawCine(c: Cine, dt: number): void {
    if (!this.tops) return
    const ms = dt * 1000
    if (!c.impact) c.t += ms
    const p = Math.min(1, c.t / c.dur)
    const u = 1 - (1 - p) * (1 - p) * (1 - p)
    const fi = u * (c.frames.length - 1), i0 = Math.floor(fi), a = fi - i0
    const A = c.frames[i0]!, B = c.frames[Math.min(c.frames.length - 1, i0 + 1)]!
    const pos: [Snap, Snap] = [{ x: 0, y: 0 }, { x: 0, y: 0 }]
    const look: { spin: number; wobble: number; spirit: boolean; vis: boolean; out: boolean }[] = []
    for (let i = 0; i < 2; i++) {
      const fa = A.t[i as 0 | 1], fb = B.t[i as 0 | 1]
      let x = fa.x + (fb.x - fa.x) * a, y = fa.y + (fb.y - fa.y) * a, vis = !fa.out
      if (fa.out) {
        let k = i0
        while (k > 0 && c.frames[k]!.t[i as 0 | 1].out) k--
        const last = c.frames[k]!.t[i as 0 | 1], n = fi - k
        x = last.x + last.vx * n * 0.02
        y = last.y + last.vy * n * 0.02
        vis = n < 45
      }
      pos[i] = { x, y }
      look[i] = { spin: fa.spin, wobble: fa.wobble + (fa.out ? 0.6 : 0), spirit: fa.spirit, vis, out: fa.out }
    }
    if (!look[0]!.out && !look[1]!.out) {
      const sp = separate(pos[0], pos[1], this.tops[0].radius, this.tops[1].radius)
      pos[0] = sp.a
      pos[1] = sp.b
    }
    for (let i = 0; i < 2; i++) {
      const l = look[i]!, top = this.tops[i as 0 | 1]
      if (!l.out) pos[i] = keepInside(pos[i]!, top.radius)
      top.fade(1, dt)
      top.update(pos[i]!.x, pos[i]!.y, l.spin, l.wobble, l.spirit, dt * 0.3, l.vis)
    }
    for (; c.fired <= i0; c.fired++) {
      const cl = c.frames[c.fired]!.clash
      if (cl) {
        this.fx.clash(cl.x, cl.y, cl.energy, cl.energy > 1.5 ? BEASTS[this.specs![0].beastId].element : null)
        this.stage.shake(Math.min(0.06, cl.energy * 0.02))
      }
    }
    const lx = c.loser !== null ? pos[c.loser].x : (pos[0].x + pos[1].x) / 2, ly = c.loser !== null ? pos[c.loser].y : (pos[0].y + pos[1].y) / 2
    const mx = (pos[0].x + pos[1].x) / 2, my = (pos[0].y + pos[1].y) / 2
    this.stage.cinematic(true, mx * 0.35 + lx * 0.65, -(my * 0.35 + ly * 0.65))
    if (p >= 1 && !c.impact) {
      c.impact = true
      this.stage.shake(0.12)
      this.stage.punch(0.08)
      this.fx.clash(lx, ly, 3, c.loser !== null && this.specs ? BEASTS[this.specs[(1 - c.loser) as 0 | 1].beastId].element : null)
    }
    if (c.impact) {
      c.hold += ms
      if (c.hold > 520) this.skipCine()
    }
  }

  private settle(b: BattleState, pos: Snap[], dt: number): void {
    if (!this.tops) return
    const [t0, t1] = b.tops, [m0, m1] = this.tops
    const solid = !t0.out && !t1.out && t0.phaseTicks <= 0 && t1.phaseTicks <= 0
    if (solid) {
      const s = separate(pos[0]!, pos[1]!, m0.radius, m1.radius)
      pos[0] = s.a
      pos[1] = s.b
      const spin = Math.min(t0.spin, t1.spin)
      if (s.touching && spin > 0.08 && dt > 0) {
        this.grindT += dt
        if (this.grindT > 0.045) {
          this.grindT = 0
          this.fx.grind(pos[0]!.x + s.nx * m0.radius, pos[0]!.y + s.ny * m0.radius, s.nx, s.ny, spin)
        }
      } else this.grindT = 0
    }
    if (!t0.out) pos[0] = keepInside(pos[0]!, m0.radius)
    if (!t1.out) pos[1] = keepInside(pos[1]!, m1.radius)
  }

  private drawHold(dt: number): void {
    for (let i = 0; i < 2; i++) {
      const h = HOLD[i]!, rig = this.launchers[i]
      rig?.pose(h.x, h.y, this.clockS, 0)
      const top = this.tops![i as 0 | 1]
      top.fade(1, dt)
      top.update(h.x, h.y, 0.06, 0, false, dt, true)
      top.group.position.y += HOLD_HEIGHT - HANG + (rig ? Math.sin(this.clockS * 2.3 + i * 1.7) * 0.012 : 0)
    }
    this.stage.follow(0, 0)
  }

  private drawLaunch(b: BattleState, a: LaunchAnim, dt: number): void {
    a.t += dt * 1000
    this.techFx?.hide()
    this.stage.follow(0, 0)
    for (let i = 0; i < 2; i++) {
      const side = i as 0 | 1, plan = a.plans[side], h = HOLD[side]!, t = b.tops[side], top = this.tops![side]
      const u = flightProgress(plan, a.t)
      const kick = Math.min(1, a.t / KICK_MS)
      this.launchers[side]?.pose(h.x, h.y, this.clockS, Math.min(1, a.t / 520))
      const x = h.x + (t.x - h.x) * u, y = h.y + (t.y - h.y) * u
      const spin = 0.06 + (t.spin - 0.06) * kick
      top.fade(1, dt)
      top.update(x, y, spin, plan.wobble * (1 - u * 0.5), false, dt, true)
      top.group.position.y += (HOLD_HEIGHT - HANG) * (1 - u)
      this.prev[side] = { x: t.x, y: t.y }
      if (u >= 1 && !a.landed[side]) {
        a.landed[side] = true
        const perfect = a.tiers[side] === 'PERFECT' || a.tiers[side] === 'GREAT'
        this.fx.clash(t.x, t.y, plan.impact, perfect ? this.elementOf(side) : null)
        if (plan.shake) this.stage.shake(plan.shake)
        if (plan.punch) this.stage.punch(plan.punch)
        this.onLand?.(side, a.tiers[side])
      }
    }
    if (a.t >= a.dur) {
      this.anim = null
      for (const r of this.launchers) r?.hide()
      this.stepper.reset()
    }
  }

  private draw(alpha: number, dt: number): void {
    if (this.cine) {
      this.techFx?.hide()
      this.drawCine(this.cine, dt)
      this.fx.update(dt * 0.35, this.stage.camera)
      this.stage.render(dt)
      return
    }
    const b = this.battle
    const scaled = dt * (this.stepper.scale || 0.05)
    this.clockS += dt
    if (!b && this.tops && this.armed) this.drawHold(dt)
    else if (!b && this.tops) for (const t of this.tops) t.group.visible = false
    if (!b && !this.armed) for (const r of this.launchers) r?.hide()
    if (b && this.anim && this.tops) {
      this.drawLaunch(b, this.anim, dt)
      this.fx.update(dt, this.stage.camera)
      this.stage.render(dt)
      return
    }
    if (!b) this.techFx?.hide()
    if (!b) this.stage.follow(0, 0)
    if (b && this.tops && this.spirits) {
      const sum = this.spirits.findIndex(s => s.summoning)
      const t0 = b.tops[0], t1 = b.tops[1]
      if (sum >= 0) {
        const t = b.tops[sum as 0 | 1]
        this.stage.follow(t.x * 0.35, -t.y * 0.35, 0.88)
      } else {
        const live = [t0, t1].filter(t => !t.out)
        const mx = live.reduce((a, t) => a + t.x, 0) / (live.length || 1), my = live.reduce((a, t) => a + t.y, 0) / (live.length || 1)
        this.stage.follow(mx * 0.22, -my * 0.22, 1)
      }
      const pos: Snap[] = [0, 1].map(i => {
        const t = b.tops[i as 0 | 1], p = this.prev[i] as Snap
        const c = this.corr[i] as Snap, k = Math.exp(-dt * 12)
        c.x *= k
        c.y *= k
        return { x: p.x + (t.x - p.x) * alpha + c.x, y: p.y + (t.y - p.y) * alpha + c.y }
      })
      this.settle(b, pos, scaled)
      for (let i = 0; i < 2; i++) {
        const t = b.tops[i as 0 | 1], { x, y } = pos[i]!
        const top = this.tops[i as 0 | 1]
        top.update(x, y, t.spin, t.wobble, t.spiritTicks > 0, scaled, !t.out)
        const o = b.tops[(1 - i) as 0 | 1]
        this.spirits[i as 0 | 1].update(x, y, o.x, o.y, dt)
        top.fade(t.phaseTicks > 0 ? 0.18 : 1, dt)
      }
      if (this.techFx && this.specs) {
        const sp = this.specs
        this.techFx.update(b.tops, [sp[0].beastId === 'nagara' && t0.spiritTicks > 0, sp[1].beastId === 'nagara' && t1.spiritTicks > 0], scaled, document.documentElement.classList.contains('reduce-motion'))
      }
    }
    this.fx.update(scaled, this.stage.camera)
    this.stage.render(dt)
  }
}
