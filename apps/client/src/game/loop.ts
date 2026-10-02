export interface Stepper {
  scale: number
  advance(dtMs: number): number
  reset(): void
}

export function createStepper(hz: number, maxSteps: number, step: () => void): Stepper {
  const stepMs = 1000 / hz
  let acc = 0
  return {
    scale: 1,
    advance(dtMs) {
      acc += Math.min(dtMs, stepMs * (maxSteps + 1)) * this.scale
      let n = 0
      while (acc >= stepMs && n < maxSteps) {
        step()
        acc -= stepMs
        n++
      }
      if (n === maxSteps) acc = Math.min(acc, stepMs)
      return acc / stepMs
    },
    reset() {
      acc = 0
    },
  }
}
