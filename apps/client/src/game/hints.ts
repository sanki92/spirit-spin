import type { RipFail, RipResult } from '@spirit/core'

export interface Hints { battles: number; launches: number; steers: number }

export const hintsLive = (h: Partial<Hints> | undefined): boolean => (h?.battles ?? 0) < 3 && !((h?.launches ?? 0) >= 3 && (h?.steers ?? 0) >= 3)

export const goodLaunch = (r: RipResult | RipFail): boolean => r.ok && !r.overspin && (r.quality === 'GOOD' || r.quality === 'GREAT' || r.quality === 'PERFECT')

export const steerHintDue = (msSinceLaunch: number, touched: boolean): boolean => !touched && msSinceLaunch >= 2000 && msSinceLaunch < 6000
