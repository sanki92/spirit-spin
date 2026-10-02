/** Phone-drop detection (spec §4.1): free-fall or impact pauses the game and shows a safety note. */
export interface GravitySample { t: number; mag: number } // |accelerationIncludingGravity| m/s²

const FREEFALL_MAG = 2, FREEFALL_MS = 100, IMPACT_MAG = 60

export function detectDrop(samples: readonly GravitySample[]): 'none' | 'freefall' | 'impact' {
  let fallStart = -1
  for (const s of samples) {
    if (s.mag > IMPACT_MAG) return 'impact'
    if (s.mag < FREEFALL_MAG) {
      if (fallStart < 0) fallStart = s.t
      else if (s.t - fallStart >= FREEFALL_MS) return 'freefall'
    } else fallStart = -1
  }
  return 'none'
}
