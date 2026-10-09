import { calibrate, DEFAULT_CALIBRATION, type Calibration } from '@spirit/core'
import { createContext, useContext } from 'react'
import { Sound } from './audio/sound'
import { ShoutDetector } from './input/mic'
import { armMotion, type MotionIo } from './input/motionSetting'
import { requestAll, requestMotion, waitForMotion } from './input/permissions'
import { SensorFeed } from './input/sensors'
import { log } from './telemetry'

const CAL_KEY = 'spirit.calibration'

export class Runtime {
  readonly sound = new Sound()
  sensors: SensorFeed | null = null
  shout: ShoutDetector | null = null
  ready = false

  private motionSeq = 0

  private motionIo(): MotionIo {
    let feed: SensorFeed | null = null
    return {
      request: requestMotion,
      feed: () => { const f = new SensorFeed(); feed = f; return { start: () => f.start(), stop: () => { f.stop(); feed = null } } },
      wait: async ms => {
        const ok = await waitForMotion(ms)
        if (ok && feed) {
          const f = feed
          this.sensors = f
          setTimeout(() => log('sensors.rate', { hz: f.measuredHz(), samples: f.motion.length }), 1500)
        }
        return ok
      },
    }
  }

  async enableMotion(): Promise<boolean> {
    const seq = ++this.motionSeq
    this.dropSensors()
    const ok = await armMotion(this.motionIo())
    if (seq !== this.motionSeq) { this.dropSensors(); return false }
    log('motion.enable', { ok })
    return ok
  }

  disableMotion(): void {
    this.motionSeq++
    this.dropSensors()
  }

  private dropSensors(): void {
    this.sensors?.stop()
    this.sensors = null
  }

  async arm(wantMic: boolean, wantMotion: boolean): Promise<{ motion: boolean }> {
    const p = await requestAll(this.sound.ctx, wantMic, wantMotion)
    log('arm.permissions', { motionGranted: p.motion, audio: this.sound.ctx.state, sampleRate: this.sound.ctx.sampleRate, baseLatency: this.sound.ctx.baseLatency })
    await this.sound.loadAll()
    if (p.motion && !(await armMotion({ ...this.motionIo(), request: async () => true }))) log('sensors.none', { reason: 'no devicemotion event within 800ms' })
    void p.mic.then(stream => {
      if (!stream) return log('mic.denied')
      const d = new ShoutDetector()
      d.attach(this.sound.ctx, stream)
      this.shout = d
      log('mic.ready', { tracks: stream.getAudioTracks().map(t => t.getSettings()) })
    })
    this.ready = true
    return { motion: this.sensors !== null }
  }

  calibration(): Calibration {
    try {
      const raw = localStorage.getItem(CAL_KEY)
      return raw ? (JSON.parse(raw) as Calibration) : DEFAULT_CALIBRATION
    } catch {
      return DEFAULT_CALIBRATION
    }
  }

  saveCalibration(pulls: number[]): Calibration {
    const c = calibrate(pulls)
    try {
      localStorage.setItem(CAL_KEY, JSON.stringify(c))
    } catch {
      return c
    }
    return c
  }
}

export const RuntimeContext = createContext<Runtime | null>(null)

export function useRuntime(): Runtime {
  const rt = useContext(RuntimeContext)
  if (!rt) throw new Error('Runtime missing')
  return rt
}
