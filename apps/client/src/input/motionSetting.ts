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
