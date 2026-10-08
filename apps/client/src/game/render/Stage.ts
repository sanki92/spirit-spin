import { ACESFilmicToneMapping, NoToneMapping, AmbientLight, Color, DirectionalLight, Fog, Group, PerspectiveCamera, PointLight, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three'

export type Quality = 'low' | 'medium' | 'high'

export function detectQuality(): Quality {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)
  if (ios) return 'high'
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  const cores = navigator.hardwareConcurrency ?? 4
  if (mem <= 2 || cores <= 4) return 'low'
  if (mem >= 6 && cores >= 8) return 'high'
  return 'medium'
}

let shared: { canvas: HTMLCanvasElement; renderer: WebGLRenderer } | null = null

export function battleCanvas(): HTMLCanvasElement {
  if (!shared) {
    const canvas = document.createElement('canvas')
    canvas.className = 'game-canvas'
    shared = { canvas, renderer: new WebGLRenderer({ canvas, antialias: detectQuality() !== 'low', powerPreference: 'high-performance', alpha: false }) }
  }
  return shared.canvas
}

export class Stage {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(42, 1, 0.05, 60)
  readonly world = new Group()
  private shakeAmp = 0
  private base = new Vector3(0, 3.05, 2.35)
  private look = new Vector3(0, 0, 0.12)
  private focus = new Vector3()
  private focusGoal = new Vector3()
  private push = 1
  private pushGoal = 1
  private punchAmt = 0
  private sweep = 0
  private clock = 0
  private tmp = new Vector3()
  zoom = 1
  dpr = 1
  private maxDpr = 1
  private avgMs = 16.7
  private jitter = 0
  private slowFor = 0
  private fastFor = 0
  readonly perf = { p95: 16.7, frames: 0, slow: 0 }

  constructor(canvas: HTMLCanvasElement, readonly quality: Quality) {
    this.renderer = shared?.canvas === canvas ? shared.renderer : new WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance', alpha: false })
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = quality === 'high' ? ACESFilmicToneMapping : NoToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.maxDpr = Math.min(devicePixelRatio, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1)
    this.dpr = this.maxDpr
    this.renderer.setPixelRatio(this.dpr)
    this.scene.background = new Color(0x05081a)
    this.scene.fog = new Fog(0x05081a, 6, 14)
    this.scene.add(this.world)
    this.scene.add(new AmbientLight(0x8fa8ff, 1.1))
    const key = new DirectionalLight(0xffffff, 2.2)
    key.position.set(1.5, 4, 2)
    this.scene.add(key)
    const rim = new PointLight(0x38e8ff, 6, 6)
    rim.position.set(0, 1.4, -1.6)
    this.scene.add(rim)
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    const halfV = (this.camera.fov * Math.PI) / 360
    const halfH = Math.atan(Math.tan(halfV) * this.camera.aspect)
    const fit = Math.max(1.22 / Math.tan(halfH), (h > w ? 1.6 : 1.25) / Math.tan(halfV))
    const pitch = h > w ? 0.93 : 0.74
    this.base.set(0, fit * Math.sin(pitch), fit * Math.cos(pitch))
    this.look.set(0, 0, h > w ? 0.1 : 0.14)
    this.camera.updateProjectionMatrix()
  }

  adapt(frameMs: number): void {
    this.avgMs += (frameMs - this.avgMs) * 0.05
    this.jitter += (Math.abs(frameMs - this.avgMs) - this.jitter) * 0.05
    const capped = this.jitter < 2.5 && this.avgMs > 30 && this.avgMs < 36
    this.perf.frames++
    if (frameMs > 20) this.perf.slow++
    this.perf.p95 = Math.max(this.perf.p95 * 0.995, frameMs)
    if (capped) { this.slowFor = 0; this.fastFor = 0; return }
    if (this.avgMs > 18.5) { this.slowFor += frameMs; this.fastFor = 0 } else if (this.avgMs < 14.5) { this.fastFor += frameMs; this.slowFor = 0 } else { this.slowFor = 0; this.fastFor = 0 }
    if (this.slowFor > 1500 && this.dpr > 0.8) this.setDpr(this.dpr - 0.1)
    else if (this.fastFor > 3000 && this.dpr < this.maxDpr) this.setDpr(this.dpr + 0.1)
  }

  private setDpr(v: number): void {
    this.dpr = Math.max(0.8, Math.min(this.maxDpr, v))
    this.renderer.setPixelRatio(this.dpr)
    this.slowFor = 0
    this.fastFor = 0
  }

  shake(amount: number): void {
    this.shakeAmp = Math.min(0.12, this.shakeAmp + amount)
  }

  punch(amount: number): void {
    this.punchAmt = Math.min(0.09, this.punchAmt + amount)
  }

  follow(x: number, z: number, push = 1): void {
    this.focusGoal.set(x, 0, z)
    this.pushGoal = push
  }

  introSweep(): void {
    this.sweep = 1
  }

  private cineAmt = 0
  private cineGoal = 0
  private cineYaw = 0
  private cineFocus = new Vector3()

  cinematic(on: boolean, x = 0, z = 0, amount = 1): void {
    this.cineGoal = on ? amount : 0
    if (on) this.cineFocus.set(x, 0, z)
  }

  render(dt: number): void {
    this.clock += dt
    this.shakeAmp *= Math.exp(-dt * 9)
    this.punchAmt *= Math.exp(-dt * 7)
    this.sweep = Math.max(0, this.sweep - dt / 1.6)
    this.cineAmt += (this.cineGoal - this.cineAmt) * (1 - Math.exp(-dt * (this.cineGoal ? 5 : 3)))
    const ca = this.cineAmt
    this.cineYaw = ca > 0.01 ? this.cineYaw + dt * 0.3 : 0
    const k = 1 - Math.exp(-dt * (3 + ca * 14))
    this.focus.lerp(ca > 0.01 ? this.tmp.copy(this.focusGoal).lerp(this.cineFocus, ca) : this.focusGoal, k)
    this.push += (this.pushGoal - this.push) * (1 - Math.exp(-dt * 4))
    const e = this.sweep * this.sweep * (3 - 2 * this.sweep)
    const yaw = Math.sin(this.clock * 0.21) * 0.07 + e * 0.9 + ca * (0.45 + this.cineYaw)
    const c = Math.cos(yaw), sn = Math.sin(yaw)
    const z = this.zoom * this.push * (1 - this.punchAmt) * (1 + e * 0.35) * (1 - 0.58 * ca)
    this.tmp.set(this.base.x * c + this.base.z * sn, this.base.y * (1 + e * 0.25) * (1 - 0.42 * ca), -this.base.x * sn + this.base.z * c).multiplyScalar(z)
    const s = this.shakeAmp
    this.camera.position.copy(this.tmp).add(this.focus)
    this.camera.position.x += (Math.random() - 0.5) * s
    this.camera.position.y += (Math.random() - 0.5) * s
    this.tmp.copy(this.look).add(this.focus)
    this.camera.lookAt(this.tmp)
    this.renderer.render(this.scene, this.camera)
  }
}
