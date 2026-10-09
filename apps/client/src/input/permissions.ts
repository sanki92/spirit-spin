type PermissionFn = { requestPermission?: () => Promise<'granted' | 'denied'> }

export interface Permissions { motion: boolean; mic: Promise<MediaStream | null>; audio: AudioContext }

export async function requestMotion(): Promise<boolean> {
  const motionReq = (globalThis.DeviceMotionEvent as unknown as PermissionFn | undefined)?.requestPermission
  const orientReq = (globalThis.DeviceOrientationEvent as unknown as PermissionFn | undefined)?.requestPermission
  const [m] = await Promise.all([
    motionReq ? motionReq().catch(() => 'denied' as const) : Promise.resolve('granted' as const),
    orientReq ? orientReq().catch(() => 'denied' as const) : Promise.resolve('granted' as const),
  ])
  return m === 'granted' && 'DeviceMotionEvent' in globalThis
}

export async function requestAll(audio: AudioContext, wantMic: boolean, wantMotion: boolean): Promise<Permissions> {
  const [motionGranted] = await Promise.all([
    wantMotion ? requestMotion() : Promise.resolve(false),
    Promise.race([audio.resume().catch(() => undefined), new Promise(r => setTimeout(r, 1500))]),
  ])
  let mic: Promise<MediaStream | null> = Promise.resolve(null)
  if (wantMic && navigator.mediaDevices?.getUserMedia) {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'play-and-record'
    mic = navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .catch(() => null)
  }
  return { motion: motionGranted, mic, audio }
}

export function waitForMotion(timeoutMs: number): Promise<boolean> {
  return new Promise(resolve => {
    const done = (ok: boolean) => {
      window.removeEventListener('devicemotion', on)
      clearTimeout(timer)
      resolve(ok)
    }
    const on = (e: DeviceMotionEvent) => {
      if (e.accelerationIncludingGravity?.x != null) done(true)
    }
    const timer = setTimeout(() => done(false), timeoutMs)
    window.addEventListener('devicemotion', on)
  })
}
