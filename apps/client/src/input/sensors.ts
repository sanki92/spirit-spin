import type { GravitySample, MotionSample } from '@spirit/core'

const IOS = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1))
const KEEP_MS = 3000
const TILT_RANGE = 0.3
const DRIFT_S = 4
const DRIFT_NEAR = 0.15 * TILT_RANGE
export const deadzone = (v: number, dz = 0.08) => (Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz))

export interface Tilt { x: number; y: number }

export class SensorFeed {
  readonly motion: MotionSample[] = []
  readonly gravity: GravitySample[] = []
  private g = { x: 0, y: 0, z: 9.8 }
  private neutral = { x: 0, y: 0, z: 1 }
  private smooth: Tilt = { x: 0, y: 0 }
  private lastEvent = 0
  private readonly onMotion = (e: DeviceMotionEvent) => this.handle(e)

  get live(): boolean {
    return performance.now() - this.lastEvent < 500
  }

  start(): void {
    window.addEventListener('devicemotion', this.onMotion)
  }

  stop(): void {
    window.removeEventListener('devicemotion', this.onMotion)
  }

  calibrateNeutral(): void {
    const m = Math.hypot(this.g.x, this.g.y, this.g.z) || 1
    this.neutral = { x: this.g.x / m, y: this.g.y / m, z: this.g.z / m }
  }

  tilt(): Tilt {
    const m = Math.hypot(this.g.x, this.g.y, this.g.z) || 1
    const nx = this.g.x / m, ny = this.g.y / m
    const tx = clamp(deadzone(-(nx - this.neutral.x) / TILT_RANGE))
    const ty = clamp(deadzone((this.neutral.y - ny) / TILT_RANGE))
    this.smooth.x += (tx - this.smooth.x) * 0.35
    this.smooth.y += (ty - this.smooth.y) * 0.35
    return { x: this.smooth.x, y: this.smooth.y }
  }

  private drift(dt: number): void {
    const m = Math.hypot(this.g.x, this.g.y, this.g.z) || 1
    const nx = this.g.x / m, ny = this.g.y / m, nz = this.g.z / m
    if (Math.abs(nx - this.neutral.x) > DRIFT_NEAR || Math.abs(ny - this.neutral.y) > DRIFT_NEAR) return
    const k = dt / DRIFT_S
    this.neutral.x += (nx - this.neutral.x) * k
    this.neutral.y += (ny - this.neutral.y) * k
    this.neutral.z += (nz - this.neutral.z) * k
  }

  measuredHz(): number {
    const m = this.motion
    if (m.length < 10) return 0
    return Math.round(((m.length - 1) * 1000) / ((m[m.length - 1] as MotionSample).t - (m[0] as MotionSample).t))
  }

  window(from: number, to: number): MotionSample[] {
    return this.motion.filter(s => s.t >= from && s.t <= to)
  }

  private handle(e: DeviceMotionEvent): void {
    const ag = e.accelerationIncludingGravity
    if (!ag || ag.x === null || ag.y === null || ag.z === null) return
    const flip = IOS ? -1 : 1
    const gx = ag.x * flip, gy = ag.y * flip, gz = ag.z * flip
    const t = performance.now()
    const dt = this.lastEvent ? Math.min(0.1, (t - this.lastEvent) / 1000) : 0
    this.lastEvent = t
    this.g.x += (gx - this.g.x) * 0.2
    this.g.y += (gy - this.g.y) * 0.2
    this.g.z += (gz - this.g.z) * 0.2
    this.drift(dt)
    const lin = e.acceleration
    const ax = lin?.x != null ? lin.x * flip : gx - this.g.x
    const ay = lin?.y != null ? lin.y * flip : gy - this.g.y
    const az = lin?.z != null ? lin.z * flip : gz - this.g.z
    const r = e.rotationRate
    const roll = (Math.atan2(-this.g.x, Math.hypot(this.g.y, this.g.z)) * 180) / Math.PI
    this.motion.push({ t, ax, ay, az, gx: r?.alpha ?? 0, gy: r?.beta ?? 0, gz: r?.gamma ?? 0, roll })
    this.gravity.push({ t, mag: Math.hypot(gx, gy, gz) })
    prune(this.motion, t)
    prune(this.gravity, t)
  }
}

function prune(arr: { t: number }[], now: number): void {
  let i = 0
  while (i < arr.length && (arr[i] as { t: number }).t < now - KEEP_MS) i++
  if (i) arr.splice(0, i)
}

const clamp = (v: number) => (v > 1 ? 1 : v < -1 ? -1 : v)
