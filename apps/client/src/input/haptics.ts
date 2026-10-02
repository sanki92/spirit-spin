let enabled = true

export function setHaptics(on: boolean): void {
  enabled = on
}

export function buzz(pattern: number | number[]): void {
  if (enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
}
