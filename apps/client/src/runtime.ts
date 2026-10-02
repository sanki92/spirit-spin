import { calibrate, DEFAULT_CALIBRATION, type Calibration } from '@spirit/core'
import { createContext, useContext } from 'react'
import { Sound } from './audio/sound'
import { ShoutDetector } from './input/mic'
import { requestAll, waitForMotion } from './input/permissions'
import { SensorFeed } from './input/sensors'
import { log } from './telemetry'

const CAL_KEY = 'spirit.calibration'

export class Runtime {
  readonly sound = new Sound()
  sensors: SensorFeed | null = null
  shout: ShoutDetector | null = null
  ready = false

  async arm(wantMic: boolean): Promise<{ motion: boolean }> {
    const p = await requestAll(this.sound.ctx, wantMic)
    log('arm.permissions', { motionGranted: p.motion, audio: this.sound.ctx.state, sampleRate: this.sound.ctx.sampleRate, baseLatency: this.sound.ctx.baseLatency })
    await this.sound.loadAll()
    if (p.motion) {
      const feed = new SensorFeed()
      feed.start()
      if (await waitForMotion(800)) {
        this.sensors = feed
        setTimeout(() => log('sensors.rate', { hz: feed.measuredHz(), samples: feed.motion.length }), 1500)
      } else {
        feed.stop()
        log('sensors.none', { reason: 'no devicemotion event within 800ms' })
      }
    }
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
