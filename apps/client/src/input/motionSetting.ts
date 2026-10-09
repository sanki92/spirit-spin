import type { Settings } from '../state/save'

export interface MotionIo { request(): Promise<boolean>; feed(): { start(): void; stop(): void }; wait(ms: number): Promise<boolean> }

export const motionOn = (s: Partial<Settings> | undefined): boolean => s?.motion === true

export async function armMotion(io: MotionIo): Promise<boolean> {
  if (!(await io.request())) return false
  const f = io.feed()
  f.start()
  if (await io.wait(800)) return true
  f.stop()
  return false
}

export const MOTION_BLOCKED = 'Motion blocked. Allow Motion & Orientation for this site in iPhone Settings, then try again.'

export async function flipMotion(on: boolean, rt: { enableMotion(): Promise<boolean>; disableMotion(): void }, patch: (p: { motion: boolean }) => void): Promise<string | null> {
  if (!on) { rt.disableMotion(); patch({ motion: false }); return null }
  const ok = await rt.enableMotion()
  patch({ motion: ok })
  return ok ? null : MOTION_BLOCKED
}
