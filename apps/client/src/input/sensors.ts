import type { GravitySample, MotionSample } from '@spirit/core'

const IOS = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1))
const KEEP_MS = 3000
const TILT_RANGE = 0.34

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
    const tx = clamp(-(this.g.x / m - this.neutral.x) / TILT_RANGE)
    const ty = clamp((this.neutral.y - this.g.y / m) / TILT_RANGE)
    this.smooth.x += (tx - this.smooth.x) * 0.35
    this.smooth.y += (ty - this.smooth.y) * 0.35
    return { x: this.smooth.x, y: this.smooth.y }
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
    this.lastEvent = t
    this.g.x += (gx - this.g.x) * 0.2
    this.g.y += (gy - this.g.y) * 0.2
    this.g.z += (gz - this.g.z) * 0.2
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
